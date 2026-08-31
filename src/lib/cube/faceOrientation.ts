import type { FaceId, StickerColor } from '../../types';
import { enumerateScanOrientations, applyRotationIndices } from './scanOrientationSearch';
import { buildFaceletFromMap, faceletToFaceMap } from './state';

const FACE_ORDER: FaceId[] = ['U', 'R', 'F', 'D', 'L', 'B'];

const FACE_CENTER: Record<FaceId, StickerColor> = {
  U: 'W',
  D: 'Y',
  F: 'G',
  B: 'B',
  R: 'R',
  L: 'O',
};

export interface FindSolvableOptions {
  /** Stop searching after this timestamp (Date.now() + ms). */
  deadlineMs?: number;
  /** Unmodified scan grids — used for cross-face edge scoring and layout match. */
  rawFaces?: Map<FaceId, StickerColor[]>;
  /**
   * @deprecated Use default scan-match scoring instead.
   * When true, skips the raw capture if another orientation is also solvable.
   */
  preferOriented?: boolean;
}

/** Rotate a 3×3 face 90° clockwise in the camera/guide frame. */
export function rotateFaceClockwise(colors: StickerColor[]): StickerColor[] {
  const rotated: StickerColor[] = new Array(9);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      rotated[col * 3 + (2 - row)] = colors[row * 3 + col]!;
    }
  }
  return rotated;
}

/** Four 90° clockwise rotations of a face (physical orientations only). */
export function allFaceRotations(colors: StickerColor[]): StickerColor[][] {
  const rotations = [colors];
  let current = colors;
  for (let i = 0; i < 3; i++) {
    current = rotateFaceClockwise(current);
    rotations.push(current);
  }
  return rotations;
}

/** Fixed slot: 0–3 = rotate k× clockwise (physical scan orientations only). */
export function faceOrientationAtIndex(colors: StickerColor[], index: number): StickerColor[] {
  if (colors.length !== 9) return colors;

  let face = [...colors];
  for (let turn = 0; turn < index % 4; turn++) {
    face = rotateFaceClockwise(face);
  }
  return face;
}

/** Inverse of faceOrientationAtIndex for rotation indices 0–3. */
export function inverseFaceOrientationIndex(forwardIndex: number): number {
  const index = forwardIndex % 4;
  if (index === 0 || index === 2) return index;
  return 4 - index;
}

function orientationsFor(colors: StickerColor[]): StickerColor[][] {
  const orientations: StickerColor[][] = [];
  for (let index = 0; index < 4; index++) {
    orientations.push(faceOrientationAtIndex(colors, index));
  }
  return orientations;
}

function faceStickerMatch(a: StickerColor[], b: StickerColor[]): number {
  let matches = 0;
  for (let i = 0; i < 9; i++) {
    if (a[i] === b[i]) matches++;
  }
  return matches;
}

/** How closely oriented raw scans match a candidate layout (higher is better). */
export function orientedLayoutMatchScore(
  rawFaces: Map<FaceId, StickerColor[]>,
  candidate: Map<FaceId, StickerColor[]>,
  rotationIndices: readonly number[],
): number {
  let score = 0;
  for (let i = 0; i < FACE_ORDER.length; i++) {
    const faceId = FACE_ORDER[i]!;
    const raw = rawFaces.get(faceId);
    const candidateFace = candidate.get(faceId);
    if (!raw || !candidateFace) continue;
    const oriented = faceOrientationAtIndex(raw, rotationIndices[i]!);
    score += faceStickerMatch(oriented, candidateFace);
  }
  return score;
}

/** How closely a candidate layout matches the raw scan (higher is better). */
export function scanLayoutMatchScore(
  rawFaces: Map<FaceId, StickerColor[]>,
  candidate: Map<FaceId, StickerColor[]>,
): number {
  let score = 0;
  for (const faceId of FACE_ORDER) {
    const raw = rawFaces.get(faceId);
    const candidateFace = candidate.get(faceId);
    if (!raw || !candidateFace) continue;
    score += faceStickerMatch(raw, candidateFace);
  }
  return score;
}

/** @deprecated Per-face re-orient scoring is too loose — kept for tests only. */
export function scanLayoutMatchScoreLoose(
  rawFaces: Map<FaceId, StickerColor[]>,
  candidate: Map<FaceId, StickerColor[]>,
): number {
  let score = 0;
  for (const faceId of FACE_ORDER) {
    const raw = rawFaces.get(faceId);
    const candidateFace = candidate.get(faceId);
    if (!raw || !candidateFace) continue;

    let best = 0;
    for (const oriented of orientationsFor(raw)) {
      best = Math.max(best, faceStickerMatch(oriented, candidateFace));
    }
    score += best;
  }
  return score;
}

/** Lower is closer to the raw scan grid (0 = unchanged). */
export function faceOrientationIndexCost(index: number): number {
  return index % 4;
}

export interface SolvableFaceletResult {
  facelet: string;
  rotationIndices: Record<FaceId, number>;
}

/**
 * Each scanned face may be rotated. Scan order does not matter —
 * this tries orientations until a physically valid layout is found.
 * Picks the solvable layout that best matches what the user actually scanned.
 */
export function findSolvableFacelet(
  faces: Map<FaceId, StickerColor[]>,
  isSolvableFacelet: (facelet: string) => boolean,
  options: FindSolvableOptions = {},
): SolvableFaceletResult | null {
  const scoreFaces = options.rawFaces ?? faces;
  const deadline =
    options.deadlineMs !== undefined ? Date.now() + options.deadlineMs : undefined;

  let result =
    enumerateScanOrientations(scoreFaces, isSolvableFacelet, {
      deadlineMs: deadline,
      requirePerfectAdjacency: true,
    }) ??
    enumerateScanOrientations(scoreFaces, isSolvableFacelet, {
      deadlineMs: deadline,
      requirePerfectAdjacency: false,
    });

  if (!result) return null;
  if (scoreFaces === faces) return result;

  const reconciledOriented = applyRotationIndices(faces, result.rotationIndices);
  const facelet = buildFaceletFromMap(reconciledOriented);
  if (!isSolvableFacelet(facelet)) return null;
  return { facelet, rotationIndices: result.rotationIndices };
}

function permutations(items: FaceId[]): FaceId[][] {
  const result: FaceId[][] = [];
  const arr = [...items];

  function permute(left: number): void {
    if (left >= arr.length) {
      result.push([...arr]);
      return;
    }
    for (let i = left; i < arr.length; i++) {
      [arr[left], arr[i]] = [arr[i]!, arr[left]!];
      permute(left + 1);
      [arr[left], arr[i]] = [arr[i]!, arr[left]!];
    }
  }

  permute(0);
  return result;
}

function assignmentCost(captures: StickerColor[][], faceOrder: FaceId[]): number {
  let cost = 0;
  for (let i = 0; i < captures.length; i++) {
    const center = captures[i]![4]!;
    if (center !== FACE_CENTER[faceOrder[i]!]) {
      cost += 5;
    }
  }
  return cost;
}

/**
 * Last resort when face IDs were mis-assigned during scan. Limited to avoid
 * multi-minute searches on mobile.
 */
export function findSolvableCubeFromCaptures(
  captures: StickerColor[][],
  isSolvableFacelet: (facelet: string) => boolean,
  deadlineMs = 3000,
): SolvableFaceletResult | null {
  if (captures.length !== 6 || captures.some((c) => c.length !== 9)) {
    return null;
  }

  const deadline = Date.now() + deadlineMs;
  const faceOrders = permutations(FACE_ORDER)
    .sort((a, b) => assignmentCost(captures, a) - assignmentCost(captures, b))
    .slice(0, 24);

  let bestFacelet: string | null = null;
  let bestIndices: Record<FaceId, number> = { U: 0, R: 0, F: 0, D: 0, L: 0, B: 0 };
  let bestScore = -1;

  for (const faceOrder of faceOrders) {
    if (Date.now() >= deadline) break;

    const trial = new Map<FaceId, StickerColor[]>();
    for (let i = 0; i < 6; i++) {
      trial.set(faceOrder[i]!, captures[i]!);
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    const resolved = findSolvableFacelet(trial, isSolvableFacelet, {
      deadlineMs: remaining,
      rawFaces: trial,
    });

    if (!resolved) continue;

    const score = scanLayoutMatchScoreLoose(trial, faceletToFaceMap(resolved.facelet));
    if (score > bestScore) {
      bestFacelet = resolved.facelet;
      bestIndices = resolved.rotationIndices;
      bestScore = score;
    }
  }

  if (!bestFacelet) return null;
  return { facelet: bestFacelet, rotationIndices: bestIndices };
}
