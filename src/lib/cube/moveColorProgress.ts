import Cube from 'cubejs';
import type { FaceId, Move, StickerColor } from '../../types';
import { ALL_FACES } from './colors';
import { isDoubleMove, moveFace } from './moves';
import { allFaceRotations } from './faceOrientation';
import { mirrorFaceCellsHorizontally } from '../vision/selfieView';

const FACE_ORDER: FaceId[] = ['U', 'R', 'F', 'D', 'L', 'B'];
const PERIPHERY = [0, 1, 2, 3, 5, 6, 7, 8] as const;
const ALL_CELLS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

const FACELET_TO_STICKER: Record<string, StickerColor> = {
  U: 'W',
  R: 'R',
  F: 'G',
  D: 'Y',
  L: 'O',
  B: 'B',
};

export interface MoveColorEvaluation {
  progress: number;
  completed: boolean;
  visibleFace: FaceId | null;
  comparisonFace: FaceId | null;
  rejectedWholeCube: boolean;
}

export interface MoveColorTrackerState {
  orientationLocks: Partial<Record<FaceId, number>>;
  lockMissFrames: Partial<Record<FaceId, number>>;
  /** Face toward camera when this step aligned — detects whole-cube reorientation */
  stepAnchorFace: FaceId | null;
  /** Required camera-facing face for this step (side-face hold, not turn face). */
  requiredHoldFace: FaceId | null;
  /** Saw a stable pre-move reading this step */
  sawPreMoveAlignment: boolean;
}

export function createMoveColorTrackerState(): MoveColorTrackerState {
  return {
    orientationLocks: {},
    lockMissFrames: {},
    stepAnchorFace: null,
    requiredHoldFace: null,
    sawPreMoveAlignment: false,
  };
}

export function resetMoveColorTracker(tracker: MoveColorTrackerState): void {
  tracker.orientationLocks = {};
  tracker.lockMissFrames = {};
  tracker.stepAnchorFace = tracker.requiredHoldFace;
  tracker.sawPreMoveAlignment = false;
}

function faceletFaceColors(facelet: string, faceId: FaceId): StickerColor[] {
  const idx = FACE_ORDER.indexOf(faceId);
  const slice = facelet.slice(idx * 9, idx * 9 + 9);
  return [...slice].map((ch) => FACELET_TO_STICKER[ch]!);
}

export function colorsForMoveFromFacelet(move: Move, facelet: string): StickerColor[] {
  if (!facelet || facelet.length !== 54) return [];
  return faceletFaceColors(facelet, moveFace(move));
}

export function getFaceletFaceColors(facelet: string, faceId: FaceId): StickerColor[] {
  if (!facelet || facelet.length !== 54) return [];
  return faceletFaceColors(facelet, faceId);
}

export function faceletColorsForFaces(
  facelet: string,
  faceIds: FaceId[],
): Partial<Record<FaceId, StickerColor[]>> {
  const result: Partial<Record<FaceId, StickerColor[]>> = {};
  for (const faceId of faceIds) {
    const colors = getFaceletFaceColors(facelet, faceId);
    if (colors.length === 9) result[faceId] = colors;
  }
  return result;
}

/** 0–1 score: how well detected colors match virtual cube face (periphery stickers). */
export function matchFaceToFacelet(
  facelet: string,
  faceId: FaceId,
  detected: StickerColor[],
): number {
  if (!facelet || facelet.length !== 54 || detected.length !== 9) return 0;
  const expected = faceletFaceColors(facelet, faceId);
  const refs = [expected, mirrorFaceCellsHorizontally(expected)];
  let best = 0;
  for (const ref of refs) {
    const pick = bestOrientationForReference(detected, ref, PERIPHERY);
    best = Math.max(best, pick.matches / PERIPHERY.length);
  }
  return best;
}

export function applyMoveToFacelet(facelet: string, move: Move): string {
  const cube = Cube.fromString(facelet);
  cube.move(move);
  return cube.asString();
}

const MOVE_FACELET_CACHE = new Map<string, string>();
const AFFECTED_FACES_CACHE = new Map<string, FaceId[]>();

function moveCacheKey(facelet: string, move: Move): string {
  return `${facelet}:${move}`;
}

/** Cached applyMoveToFacelet — same facelet+move is reused every vision frame. */
export function applyMoveToFaceletCached(facelet: string, move: Move): string {
  const key = moveCacheKey(facelet, move);
  const cached = MOVE_FACELET_CACHE.get(key);
  if (cached) return cached;
  const next = applyMoveToFacelet(facelet, move);
  if (MOVE_FACELET_CACHE.size > 48) MOVE_FACELET_CACHE.clear();
  MOVE_FACELET_CACHE.set(key, next);
  return next;
}

export function clearMoveFaceletCache(): void {
  MOVE_FACELET_CACHE.clear();
  AFFECTED_FACES_CACHE.clear();
}

function getAffectedFacesForMove(facelet: string, move: Move): FaceId[] {
  const key = moveCacheKey(facelet, move);
  const cached = AFFECTED_FACES_CACHE.get(key);
  if (cached) return cached;

  const afterFacelet = applyMoveToFaceletCached(facelet, move);
  const affected = ALL_FACES.filter((faceId) => {
    const before = faceletFaceColors(facelet, faceId);
    const after = faceletFaceColors(afterFacelet, faceId);
    return changedIndices(before, after).length > 0;
  });
  if (AFFECTED_FACES_CACHE.size > 48) AFFECTED_FACES_CACHE.clear();
  AFFECTED_FACES_CACHE.set(key, affected);
  return affected;
}

export function majorityVoteFaceColors(readings: StickerColor[][]): StickerColor[] | null {
  if (readings.length === 0) return null;
  const result: StickerColor[] = [];
  for (let i = 0; i < 9; i++) {
    const counts = new Map<StickerColor, number>();
    for (const reading of readings) {
      const c = reading[i]!;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    let best: StickerColor = readings[0]![i]!;
    let bestCount = 0;
    for (const [color, count] of counts) {
      if (count > bestCount) {
        bestCount = count;
        best = color;
      }
    }
    result.push(best);
  }
  return result;
}

function changedIndices(before: StickerColor[], after: StickerColor[]): number[] {
  const idx: number[] = [];
  for (let i = 0; i < 9; i++) {
    if (before[i] !== after[i]) idx.push(i);
  }
  return idx;
}

function unchangedIndices(before: StickerColor[], after: StickerColor[]): number[] {
  const idx: number[] = [];
  for (let i = 0; i < 9; i++) {
    if (before[i] === after[i]) idx.push(i);
  }
  return idx;
}

function enumerateOrientations(colors: StickerColor[]): StickerColor[][] {
  const seen = new Set<string>();
  const orientations: StickerColor[][] = [];
  for (const base of [colors, mirrorFaceCellsHorizontally(colors)]) {
    for (const rotated of allFaceRotations(base)) {
      const key = rotated.join('');
      if (seen.has(key)) continue;
      seen.add(key);
      orientations.push(rotated);
    }
  }
  return orientations;
}

function orientByIndex(colors: StickerColor[], index: number): StickerColor[] {
  return enumerateOrientations(colors)[index] ?? colors;
}

function countMatchingAtIndices(
  a: StickerColor[],
  b: StickerColor[],
  indices: readonly number[],
): number {
  let matches = 0;
  for (const i of indices) {
    if (a[i] === b[i]) matches++;
  }
  return matches;
}

function bestOrientationForReference(
  detected: StickerColor[],
  reference: StickerColor[],
  indices: readonly number[],
): { index: number; matches: number; oriented: StickerColor[] } {
  let best = { index: 0, matches: 0, oriented: detected };
  enumerateOrientations(detected).forEach((oriented, index) => {
    const matches = countMatchingAtIndices(oriented, reference, indices);
    if (matches > best.matches) {
      best = { index, matches, oriented };
    }
  });
  return best;
}

/** Same stickers on face but permuted — typical of whole-cube spin, not a layer turn */
function looksLikeWholeFaceSpin(oriented: StickerColor[], before: StickerColor[]): boolean {
  const a = [...oriented].sort().join('');
  const b = [...before].sort().join('');
  if (a !== b) return false;
  const samePosition = PERIPHERY.filter((i) => oriented[i] === before[i]).length;
  return samePosition <= 2;
}

/**
 * Layer turn: stickers that should not move stay at the same grid cell.
 * Whole-cube rotation permutes the whole face — breaks this constraint.
 */
function passesLayerTurnSignature(
  oriented: StickerColor[],
  before: StickerColor[],
  after: StickerColor[],
  changed: number[],
  unchanged: number[],
): boolean {
  if (unchanged.length > 0) {
    const held = countMatchingAtIndices(oriented, before, unchanged);
    const need = unchanged.length === 1 ? 1 : Math.ceil(unchanged.length * 0.9);
    if (held < need) return false;
  }

  if (unchanged.length >= 4) {
    const peripheryDrift = PERIPHERY.filter((i) => oriented[i] !== before[i]).length;
    if (peripheryDrift > changed.length + 1) return false;
  }

  const changedMatch = countMatchingAtIndices(oriented, after, changed);
  if (changedMatch < Math.ceil(changed.length * 0.65)) return false;

  if (looksLikeWholeFaceSpin(oriented, before) && changedMatch < changed.length) {
    return false;
  }

  return true;
}

interface FaceEvalResult {
  progress: number;
  completed: boolean;
  rejectedWholeCube: boolean;
}

const FACE_LAYER_MOVES: Record<FaceId, Move[]> = {
  U: ['U', "U'", 'U2'],
  D: ['D', "D'", 'D2'],
  R: ['R', "R'", 'R2'],
  L: ['L', "L'", 'L2'],
  F: ['F', "F'", 'F2'],
  B: ['B', "B'", 'B2'],
};

/** Which layer move best matches detected visible-face colors. */
export function detectDominantLayerMove(
  facelet: string,
  expected: Move,
  visibleFaceColors: Partial<Record<FaceId, StickerColor[]>>,
  primaryFace: FaceId | null,
  _tracker?: MoveColorTrackerState,
): Move | null {
  const faceId = primaryFace ?? moveFace(expected);
  const visibleIds = (Object.keys(visibleFaceColors) as FaceId[]).filter(
    (id) => visibleFaceColors[id]?.length === 9,
  );
  const scanFaces = visibleIds.length >= 2 ? visibleIds : [faceId];
  const candidates = isDoubleMove(expected)
    ? ([`${moveFace(expected)}2`] as Move[])
    : FACE_LAYER_MOVES[moveFace(expected)];

  let best: { move: Move; progress: number } = { move: expected, progress: 0 };

  for (const candidate of candidates) {
    const afterFl = applyMoveToFaceletCached(facelet, candidate);
    let sum = 0;
    for (const scanFace of scanFaces) {
      const detected = visibleFaceColors[scanFace];
      if (!detected) continue;
      sum += matchFaceToFacelet(afterFl, scanFace, detected);
    }
    const progress = sum / scanFaces.length;
    if (progress > best.progress) {
      best = { move: candidate, progress };
    }
  }

  if (best.move !== expected && best.progress >= 0.58) {
    return best.move;
  }
  return null;
}

function evaluateOneFace(
  facelet: string,
  move: Move,
  faceId: FaceId,
  detected: StickerColor[],
  tracker: MoveColorTrackerState,
): FaceEvalResult {
  const before = faceletFaceColors(facelet, faceId);
  const after = faceletFaceColors(applyMoveToFaceletCached(facelet, move), faceId);
  const changed = changedIndices(before, after);
  const unchanged = unchangedIndices(before, after);
  if (changed.length === 0) return { progress: 0, completed: false, rejectedWholeCube: false };

  const refs = [
    { before, after },
    { before: mirrorFaceCellsHorizontally(before), after: mirrorFaceCellsHorizontally(after) },
  ];

  let best: FaceEvalResult = { progress: 0, completed: false, rejectedWholeCube: false };

  for (const ref of refs) {
    const beforePick = bestOrientationForReference(detected, ref.before, PERIPHERY);
    const afterPick = bestOrientationForReference(detected, ref.after, ALL_CELLS);

    let oriented: StickerColor[];
    if (tracker.sawPreMoveAlignment) {
      // After turn starts, align grid to post-move layout (not pre-move lock).
      oriented =
        afterPick.matches >= beforePick.matches ? afterPick.oriented : beforePick.oriented;
      tracker.orientationLocks[faceId] =
        afterPick.matches >= beforePick.matches ? afterPick.index : beforePick.index;
    } else if (tracker.orientationLocks[faceId] !== undefined) {
      oriented = orientByIndex(detected, tracker.orientationLocks[faceId]!);
    } else {
      oriented = beforePick.oriented;
      if (beforePick.matches >= 5) {
        tracker.orientationLocks[faceId] = beforePick.index;
        tracker.lockMissFrames[faceId] = 0;
      }
    }

    const beforePeriph = countMatchingAtIndices(oriented, ref.before, PERIPHERY);
    const changedMatch = countMatchingAtIndices(oriented, ref.after, changed);
    const progress = changedMatch / changed.length;

    if (beforePeriph >= 5) {
      tracker.sawPreMoveAlignment = true;
    }

    const layerSignature = passesLayerTurnSignature(
      oriented,
      ref.before,
      ref.after,
      changed,
      unchanged,
    );

    const turning = tracker.sawPreMoveAlignment || progress > 0.15;

    if (
      turning &&
      looksLikeWholeFaceSpin(oriented, ref.before) &&
      changedMatch < Math.ceil(changed.length * 0.45)
    ) {
      best = { progress: 0, completed: false, rejectedWholeCube: true };
      continue;
    }

    if (!layerSignature && !turning) {
      if (
        (looksLikeWholeFaceSpin(oriented, ref.before) || unchanged.length >= 3) &&
        progress < 0.2
      ) {
        best = { progress: 0, completed: false, rejectedWholeCube: true };
      }
      continue;
    }

    const afterPeriph = countMatchingAtIndices(oriented, ref.after, PERIPHERY);
    const isDouble = changed.length >= 6;
    const minChanged = Math.max(1, Math.ceil(changed.length * (isDouble ? 0.45 : 0.5)));
    const minAfterPeriph = 3;
    const strongChanged = Math.ceil(changed.length * (isDouble ? 0.55 : 0.58));
    const completed =
      (tracker.sawPreMoveAlignment || beforePeriph >= 4) &&
      changedMatch >= minChanged &&
      afterPeriph >= minAfterPeriph &&
      (isDouble
        ? progress >= 0.45
        : progress >= 0.62 ||
          changedMatch >= strongChanged ||
          afterPeriph > beforePeriph);

    if (completed || progress > best.progress) {
      best = {
        progress: completed ? 1 : progress,
        completed,
        rejectedWholeCube: false,
      };
    }

    if (tracker.orientationLocks[faceId] !== undefined && !tracker.sawPreMoveAlignment) {
      if (beforePeriph < 4) {
        tracker.lockMissFrames[faceId] = (tracker.lockMissFrames[faceId] ?? 0) + 1;
        if ((tracker.lockMissFrames[faceId] ?? 0) > 8) {
          delete tracker.orientationLocks[faceId];
          delete tracker.lockMissFrames[faceId];
        }
      } else {
        tracker.lockMissFrames[faceId] = 0;
      }
    }
  }

  return best;
}

export function evaluateMoveColorProgress(
  facelet: string,
  move: Move,
  detectedColors: StickerColor[] | null,
  detectedFace: FaceId | null,
  tracker: MoveColorTrackerState,
): MoveColorEvaluation {
  if (!facelet || facelet.length !== 54 || !detectedColors || detectedColors.length !== 9) {
    return {
      progress: 0,
      completed: false,
      visibleFace: detectedFace,
      comparisonFace: null,
      rejectedWholeCube: false,
    };
  }

  if (detectedFace) {
    if (tracker.stepAnchorFace === null) {
      tracker.stepAnchorFace = detectedFace;
    } else if (
      detectedFace !== tracker.stepAnchorFace &&
      !tracker.sawPreMoveAlignment
    ) {
      return {
        progress: 0,
        completed: false,
        visibleFace: detectedFace,
        comparisonFace: null,
        rejectedWholeCube: true,
      };
    }
  }

  const affected = getAffectedFacesForMove(facelet, move);
  const moveFaceId = moveFace(move);
  const facesToTry =
    detectedFace && affected.includes(detectedFace)
      ? [detectedFace, moveFaceId]
      : [moveFaceId, ...affected.filter((f) => f !== moveFaceId)];

  let best: MoveColorEvaluation = {
    progress: 0,
    completed: false,
    visibleFace: detectedFace,
    comparisonFace: null,
    rejectedWholeCube: false,
  };

  for (const faceId of facesToTry) {
    if (!affected.includes(faceId)) continue;
    const result = evaluateOneFace(facelet, move, faceId, detectedColors, tracker);
    if (result.rejectedWholeCube) {
      best.rejectedWholeCube = true;
      best.progress = 0;
      best.completed = false;
      break;
    }
    if (result.completed || result.progress > best.progress) {
      best = {
        progress: result.progress,
        completed: result.completed,
        visibleFace: detectedFace,
        comparisonFace: faceId,
        rejectedWholeCube: false,
      };
      if (result.completed) break;
    }
  }

  return best;
}

/** Evaluate all visible faces against the virtual cube — best progress wins. */
export function evaluateThreeFaceMoveProgress(
  facelet: string,
  move: Move,
  visibleFaceColors: Partial<Record<FaceId, StickerColor[]>>,
  primaryVisibleFace: FaceId | null,
  tracker: MoveColorTrackerState,
): MoveColorEvaluation {
  if (!facelet || facelet.length !== 54) {
    return {
      progress: 0,
      completed: false,
      visibleFace: primaryVisibleFace,
      comparisonFace: null,
      rejectedWholeCube: false,
    };
  }

  if (primaryVisibleFace) {
    const anchorFace = tracker.requiredHoldFace ?? tracker.stepAnchorFace;
    if (anchorFace === null) {
      tracker.stepAnchorFace = tracker.requiredHoldFace ?? primaryVisibleFace;
    } else if (
      primaryVisibleFace !== anchorFace &&
      !tracker.sawPreMoveAlignment
    ) {
      return {
        progress: 0,
        completed: false,
        visibleFace: primaryVisibleFace,
        comparisonFace: null,
        rejectedWholeCube: true,
      };
    }
  }

  const affected = getAffectedFacesForMove(facelet, move);
  const moveFaceId = moveFace(move);
  const visibleIds = Object.keys(visibleFaceColors) as FaceId[];
  const facesToTry = [
    ...visibleIds.filter((f) => affected.includes(f)),
    moveFaceId,
    ...affected.filter((f) => f !== moveFaceId && !visibleIds.includes(f)),
  ].filter((f, i, arr) => affected.includes(f) && arr.indexOf(f) === i);

  let best: MoveColorEvaluation = {
    progress: 0,
    completed: false,
    visibleFace: primaryVisibleFace,
    comparisonFace: null,
    rejectedWholeCube: false,
  };

  for (const faceId of facesToTry) {
    const detected = visibleFaceColors[faceId];
    if (!detected || detected.length !== 9) continue;

    const result = evaluateOneFace(facelet, move, faceId, detected, tracker);
    if (result.rejectedWholeCube) {
      return {
        progress: 0,
        completed: false,
        visibleFace: primaryVisibleFace,
        comparisonFace: faceId,
        rejectedWholeCube: true,
      };
    }
    if (result.completed || result.progress > best.progress) {
      best = {
        progress: result.progress,
        completed: result.completed,
        visibleFace: primaryVisibleFace,
        comparisonFace: faceId,
        rejectedWholeCube: false,
      };
      if (result.completed) break;
    }
  }

  return best;
}
