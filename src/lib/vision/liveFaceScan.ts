import { identifyFaceFromCenter, getFaceCenterColor } from '../cube/colors';
import type { FaceId, ReadColor, StickerColor } from '../../types';
import { isKnownColor } from './readColorUtils';

/** Periphery cells only — center may jitter between frames */
const PERIPHERY_INDICES = [0, 1, 2, 3, 5, 6, 7, 8] as const;

export const STABLE_DURATION_MS = 1000;
const MAX_READINGS_PER_FACE = 10;
const SAME_FACE_PERIPHERY_MATCHES = 6;
const STABILITY_JITTER_MATCHES = 5;
const MIN_COMPARABLE_PERIPHERY = 4;

export interface LiveScanSnapshot {
  faces: Map<FaceId, ReadColor[]>;
  knownFaces: FaceId[];
  currentFace: FaceId | null;
  stableProgress: number;
  stableTarget: number;
  isComplete: boolean;
  newlyCaptured: FaceId | null;
  /** Existing face replaced after a steady hold. */
  faceUpdated: FaceId | null;
  /** Camera still shows a face that is already in the scan set. */
  holdingScannedFace: boolean;
  needsNewFace: boolean;
  needsClearerCenter: boolean;
  rescanTarget: FaceId | null;
}

function countMatchingPeriphery(a: ReadColor[], b: ReadColor[]): number {
  let matches = 0;
  for (const i of PERIPHERY_INDICES) {
    if (!isKnownColor(a[i]!) || !isKnownColor(b[i]!)) continue;
    if (a[i] === b[i]) matches++;
  }
  return matches;
}

function countMatchingPeripheryStability(a: ReadColor[], b: ReadColor[]): {
  matches: number;
  comparable: number;
} {
  let matches = 0;
  let comparable = 0;
  for (const i of PERIPHERY_INDICES) {
    if (!isKnownColor(a[i]!) || !isKnownColor(b[i]!)) continue;
    comparable++;
    if (a[i] === b[i]) matches++;
  }
  return { matches, comparable };
}

function matchesStoredFace(live: ReadColor[], stored: ReadColor[]): boolean {
  return countMatchingPeriphery(live, stored) >= SAME_FACE_PERIPHERY_MATCHES;
}

function findStoredMatch(
  colors: ReadColor[],
  faces: Map<FaceId, ReadColor[]>,
): FaceId | null {
  for (const [id, stored] of faces) {
    if (matchesStoredFace(colors, stored)) return id;
  }
  return null;
}

function majorityVoteCells(readings: ReadColor[][]): ReadColor[] {
  const result: ReadColor[] = [];
  for (let i = 0; i < 9; i++) {
    const votes = new Map<StickerColor, number>();
    for (const reading of readings) {
      const c = reading[i]!;
      if (!isKnownColor(c)) continue;
      votes.set(c, (votes.get(c) ?? 0) + 1);
    }
    if (votes.size === 0) {
      result.push('?');
      continue;
    }
    let best: StickerColor = 'W';
    let bestCount = 0;
    for (const [color, count] of votes) {
      if (count > bestCount) {
        bestCount = count;
        best = color;
      }
    }
    result.push(best);
  }
  return result;
}

/** Use the latest stable frame when majority vote leaves a cell uncertain. */
export function fallbackUncertainFromHistory(
  voted: ReadColor[],
  history: ReadColor[][],
): ReadColor[] {
  const result = [...voted];
  const latest = history[history.length - 1];

  for (let i = 0; i < 9; i++) {
    if (isKnownColor(result[i])) continue;

    if (latest && isKnownColor(latest[i])) {
      result[i] = latest[i];
      continue;
    }

    const votes = new Map<StickerColor, number>();
    for (const reading of history) {
      const c = reading[i]!;
      if (!isKnownColor(c)) continue;
      votes.set(c, (votes.get(c) ?? 0) + 1);
    }
    if (votes.size === 0) continue;

    let best: StickerColor = 'W';
    let bestCount = 0;
    for (const [color, count] of votes) {
      if (count > bestCount) {
        bestCount = count;
        best = color;
      }
    }

    if (bestCount >= 2) {
      result[i] = best;
    }
  }

  return result;
}

function majorityVoteCenter(readings: ReadColor[][]): StickerColor | null {
  if (readings.length === 0) return null;
  const votes = new Map<StickerColor, number>();
  for (const reading of readings) {
    const c = reading[4]!;
    if (!isKnownColor(c)) continue;
    votes.set(c, (votes.get(c) ?? 0) + 1);
  }
  let best: StickerColor | null = null;
  let bestCount = 0;
  for (const [color, count] of votes) {
    if (count > bestCount) {
      bestCount = count;
      best = color;
    }
  }
  return bestCount >= 2 ? best : null;
}

function finalizeStoredColors(voted: ReadColor[], faceId: FaceId): ReadColor[] {
  const stored = [...voted];
  stored[4] = getFaceCenterColor(faceId);
  return stored;
}

function resolveCenterFaceId(colors: ReadColor[]): FaceId | null {
  const center = colors[4];
  if (!isKnownColor(center)) return null;
  return identifyFaceFromCenter(center);
}

function centerMatchesScanTarget(colors: ReadColor[], target: FaceId): boolean {
  const centerFaceId = resolveCenterFaceId(colors);
  return centerFaceId === target;
}

function pickFaceIdForCapture(
  voted: ReadColor[],
  faces: Map<FaceId, ReadColor[]>,
  history: ReadColor[][],
  rescanTarget: FaceId | null,
): FaceId | null {
  let candidate: FaceId | null = null;
  const centerCandidates: (ReadColor | null)[] = [majorityVoteCenter(history), voted[4] ?? '?'];
  for (const center of centerCandidates) {
    if (center === null || !isKnownColor(center)) continue;
    const faceId = identifyFaceFromCenter(center);
    if (faceId && !faces.has(faceId)) {
      candidate = faceId;
      break;
    }
  }

  const peripheryMatch = findStoredMatch(voted, faces);
  if (peripheryMatch) {
    const centerFaceId = resolveCenterFaceId(voted);
    if (!candidate || candidate === peripheryMatch || centerFaceId === peripheryMatch) {
      return null;
    }
  }

  if (rescanTarget) {
    return candidate === rescanTarget ? rescanTarget : null;
  }

  if (candidate && !faces.has(candidate)) {
    return candidate;
  }

  return null;
}

/** Already-scanned face held in view — allow a steady hold to replace the capture. */
function pickUpdateTarget(
  colors: ReadColor[],
  faces: Map<FaceId, ReadColor[]>,
  rescanTarget: FaceId | null,
): FaceId | null {
  const storedMatch = findStoredMatch(colors, faces);
  if (storedMatch) {
    if (rescanTarget && storedMatch !== rescanTarget) return null;
    return storedMatch;
  }

  const center = colors[4];
  if (!isKnownColor(center)) return null;
  const centerFaceId = resolveCenterFaceId(colors);
  if (!centerFaceId || !faces.has(centerFaceId)) return null;
  if (rescanTarget && centerFaceId !== rescanTarget) return null;
  return centerFaceId;
}

function isUnscannedCenterHold(
  colors: ReadColor[],
  anchor: ReadColor[],
  faces: Map<FaceId, ReadColor[]>,
): boolean {
  const c = colors[4];
  const a = anchor[4];
  if (!isKnownColor(c) || !isKnownColor(a) || c !== a) return false;
  const faceId = identifyFaceFromCenter(c);
  return faceId !== null && !faces.has(faceId);
}

export function canonicalizeScannedFaces(
  faces: Map<FaceId, ReadColor[]>,
): Map<FaceId, ReadColor[]> {
  if (faces.size !== 6) return faces;

  const result = new Map<FaceId, ReadColor[]>();
  const claimed = new Set<FaceId>();

  const entries = [...faces.entries()].sort((a, b) => {
    const aCenter = a[1][4];
    const bCenter = b[1][4];
    const aOk = isKnownColor(aCenter) && identifyFaceFromCenter(aCenter) === a[0] ? 0 : 1;
    const bOk = isKnownColor(bCenter) && identifyFaceFromCenter(bCenter) === b[0] ? 0 : 1;
    return aOk - bOk;
  });

  for (const [, colors] of entries) {
    const center = colors[4];
    if (!isKnownColor(center)) continue;
    const detected = identifyFaceFromCenter(center);
    if (detected && !claimed.has(detected)) {
      result.set(detected, [...colors]);
      claimed.add(detected);
    }
  }

  return result.size === 6 ? result : faces;
}

function cloneFaceMap(faces: Map<FaceId, ReadColor[]>): Map<FaceId, ReadColor[]> {
  const copy = new Map<FaceId, ReadColor[]>();
  for (const [id, colors] of faces) {
    copy.set(id, [...colors]);
  }
  return copy;
}

/** Merge locked captures with in-progress faces (rescan target only). */
export function mergeLockedScanFaces(
  lockedFaces: Map<FaceId, ReadColor[]>,
  faces: Map<FaceId, ReadColor[]>,
): Map<FaceId, ReadColor[]> {
  const merged = cloneFaceMap(lockedFaces);
  for (const [id, colors] of faces) {
    if (!lockedFaces.has(id)) {
      merged.set(id, [...colors]);
    }
  }
  return merged;
}

/** Show stored scan colors — only the center sticker is forced to the face color. */
export function facesForDisplay(
  faces: Map<FaceId, ReadColor[]>,
): Map<FaceId, ReadColor[]> {
  const result = new Map<FaceId, ReadColor[]>();
  for (const [faceId, colors] of faces) {
    const adjusted = [...colors];
    adjusted[4] = getFaceCenterColor(faceId);
    result.set(faceId, adjusted);
  }
  return result;
}

export class LiveFaceAccumulator {
  private faces = new Map<FaceId, ReadColor[]>();
  private lockedFaces: Map<FaceId, ReadColor[]> | null = null;
  private pendingReadings: ReadColor[][] = [];
  private pendingMedianReadings: [number, number, number][][] = [];
  private stableSinceMs: number | null = null;
  private stabilityAnchor: ReadColor[] | null = null;
  private rescanTarget: FaceId | null = null;

  reset(): void {
    this.faces.clear();
    this.lockedFaces = null;
    this.pendingReadings = [];
    this.pendingMedianReadings = [];
    this.stableSinceMs = null;
    this.stabilityAnchor = null;
    this.rescanTarget = null;
  }

  removeFace(faceId: FaceId): void {
    this.faces.delete(faceId);
    this.pendingReadings = [];
    this.pendingMedianReadings = [];
    this.stableSinceMs = null;
    this.stabilityAnchor = null;
  }

  setRescanTarget(faceId: FaceId | null): void {
    this.rescanTarget = faceId;
    this.lockedFaces = faceId && this.faces.size > 0 ? cloneFaceMap(this.faces) : null;
    if (this.lockedFaces) {
      this.restoreLockedFaces();
    }
    this.pendingReadings = [];
    this.pendingMedianReadings = [];
    this.stableSinceMs = null;
    this.stabilityAnchor = null;
  }

  getRescanTarget(): FaceId | null {
    return this.rescanTarget;
  }

  getLockedFaces(): Map<FaceId, ReadColor[]> | null {
    return this.lockedFaces;
  }

  getFaces(): Map<FaceId, ReadColor[]> {
    return this.lockedFaces ? mergeLockedScanFaces(this.lockedFaces, this.faces) : this.faces;
  }

  private restoreLockedFaces(): void {
    if (!this.lockedFaces) return;
    for (const [faceId, colors] of this.lockedFaces) {
      this.faces.set(faceId, [...colors]);
    }
  }

  update(
    colors: ReadColor[] | null,
    medians: [number, number, number][] | null = null,
    nowMs = Date.now(),
  ): LiveScanSnapshot {
    const stableTargetSec = STABLE_DURATION_MS / 1000;
    const empty: LiveScanSnapshot = {
      faces: this.getFaces(),
      knownFaces: [...this.faces.keys()],
      currentFace: null,
      stableProgress: 0,
      stableTarget: stableTargetSec,
      isComplete: this.faces.size === 6,
      newlyCaptured: null,
      faceUpdated: null,
      holdingScannedFace: false,
      needsNewFace: false,
      needsClearerCenter: false,
      rescanTarget: this.rescanTarget,
    };

    if (!colors || colors.length !== 9) {
      this.stableSinceMs = null;
      this.stabilityAnchor = null;
      this.pendingReadings = [];
      this.pendingMedianReadings = [];
      return empty;
    }

    const center = colors[4];
    const centerFaceId = isKnownColor(center) ? identifyFaceFromCenter(center) : null;
    const storedMatch = findStoredMatch(colors, this.faces);
    const updateTarget = pickUpdateTarget(colors, this.faces, this.rescanTarget);

    if (this.rescanTarget && storedMatch && storedMatch !== this.rescanTarget) {
      this.stableSinceMs = null;
      this.stabilityAnchor = null;
      this.pendingReadings = [];
      this.pendingMedianReadings = [];
      return {
        ...empty,
        currentFace: storedMatch,
        needsNewFace: true,
        rescanTarget: this.rescanTarget,
      };
    }

    if (
      this.rescanTarget &&
      !centerMatchesScanTarget(colors, this.rescanTarget)
    ) {
      this.stableSinceMs = null;
      this.stabilityAnchor = null;
      this.pendingReadings = [];
      this.pendingMedianReadings = [];
      return {
        ...empty,
        currentFace: centerFaceId ?? storedMatch,
        holdingScannedFace: Boolean(storedMatch && storedMatch !== this.rescanTarget),
        needsNewFace: Boolean(storedMatch && storedMatch !== this.rescanTarget),
        rescanTarget: this.rescanTarget,
      };
    }

    const anchorMatch = this.stabilityAnchor
      ? countMatchingPeripheryStability(colors, this.stabilityAnchor)
      : { matches: 0, comparable: 0 };
    const centerHold = this.stabilityAnchor
      ? isUnscannedCenterHold(colors, this.stabilityAnchor, this.faces)
      : false;

    if (
      !this.stabilityAnchor ||
      (!centerHold &&
        (anchorMatch.comparable < MIN_COMPARABLE_PERIPHERY ||
          anchorMatch.matches < STABILITY_JITTER_MATCHES))
    ) {
      this.stabilityAnchor = [...colors];
      this.stableSinceMs = nowMs;
      this.pendingReadings = [];
      this.pendingMedianReadings = [];
    } else if (this.stableSinceMs === null) {
      this.stableSinceMs = nowMs;
    }

    const stableMs = this.stableSinceMs !== null ? nowMs - this.stableSinceMs : 0;
    const stableProgressSec = Math.min(stableMs, STABLE_DURATION_MS) / 1000;

    let newlyCaptured: FaceId | null = null;
    let faceUpdated: FaceId | null = null;
    let needsClearerCenter = false;

    if (stableMs >= STABLE_DURATION_MS) {
      const history = [...this.pendingReadings, [...colors]];
      if (history.length > MAX_READINGS_PER_FACE) history.shift();
      this.pendingReadings = history;

      if (medians && medians.length === 9) {
        const medianHistory = [...this.pendingMedianReadings, medians.map((cell) => [...cell] as [number, number, number])];
        if (medianHistory.length > MAX_READINGS_PER_FACE) medianHistory.shift();
        this.pendingMedianReadings = medianHistory;
      }

      const voted = fallbackUncertainFromHistory(majorityVoteCells(history), history);

      if (updateTarget) {
        const stored = finalizeStoredColors(voted, updateTarget);
        const finishingRescan = this.rescanTarget === updateTarget;
        if (finishingRescan && this.lockedFaces) {
          this.restoreLockedFaces();
        }
        this.faces.set(updateTarget, stored);
        faceUpdated = updateTarget;
        if (finishingRescan) {
          this.rescanTarget = null;
          this.lockedFaces = null;
        }
        this.stableSinceMs = null;
        this.stabilityAnchor = null;
        this.pendingReadings = [];
        this.pendingMedianReadings = [];
      } else {
        const resolvedFaceId = pickFaceIdForCapture(voted, this.faces, history, this.rescanTarget);

        if (resolvedFaceId) {
          const isNew = !this.faces.has(resolvedFaceId);
          const stored = finalizeStoredColors(voted, resolvedFaceId);
          const finishingRescan = this.rescanTarget === resolvedFaceId;
          if (finishingRescan && this.lockedFaces) {
            this.restoreLockedFaces();
          }
          this.faces.set(resolvedFaceId, stored);
          if (isNew) newlyCaptured = resolvedFaceId;
          if (finishingRescan) {
            this.rescanTarget = null;
            this.lockedFaces = null;
          }
          this.stableSinceMs = null;
          this.stabilityAnchor = null;
          this.pendingReadings = [];
          this.pendingMedianReadings = [];
        } else {
          needsClearerCenter = true;
          this.stableSinceMs = nowMs - STABLE_DURATION_MS + 400;
        }
      }
    }

    return {
      faces: this.getFaces(),
      knownFaces: [...this.faces.keys()],
      currentFace: updateTarget ?? centerFaceId,
      stableProgress: Math.round(stableProgressSec * 10) / 10,
      stableTarget: stableTargetSec,
      isComplete: this.faces.size === 6,
      newlyCaptured,
      faceUpdated,
      holdingScannedFace: updateTarget !== null,
      needsNewFace: false,
      needsClearerCenter,
      rescanTarget: this.rescanTarget,
    };
  }
}
