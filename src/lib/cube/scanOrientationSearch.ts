import type { FaceId, StickerColor } from '../../types';
import {
  MAX_CORNER_AGREEMENT,
  MAX_EDGE_AGREEMENT,
  rawCornerAgreementScore,
  rawEdgeAgreementScore,
} from './faceAdjacency';
import {
  faceOrientationAtIndex,
  faceOrientationIndexCost,
  orientedLayoutMatchScore,
  type SolvableFaceletResult,
} from './faceOrientation';
import { buildFaceletFromMap, faceletToFaceMap } from './state';

const FACE_ORDER: FaceId[] = ['U', 'R', 'F', 'D', 'L', 'B'];

export interface EnumerateScanOptions {
  deadlineMs?: number;
  /** When true, prefer only candidates with perfect edge+corner agreement on raw scans. */
  requirePerfectAdjacency?: boolean;
}

function isPastDeadline(deadline: number | undefined): boolean {
  return deadline !== undefined && Date.now() >= deadline;
}

function indicesToRecord(indices: readonly number[]): Record<FaceId, number> {
  const record = {} as Record<FaceId, number>;
  for (let i = 0; i < FACE_ORDER.length; i++) {
    record[FACE_ORDER[i]!] = indices[i]!;
  }
  return record;
}

export function applyRotationIndices(
  faces: Map<FaceId, StickerColor[]>,
  rotationIndices: Record<FaceId, number> | readonly number[],
): Map<FaceId, StickerColor[]> {
  const oriented = new Map<FaceId, StickerColor[]>();
  for (let i = 0; i < FACE_ORDER.length; i++) {
    const faceId = FACE_ORDER[i]!;
    const index = Array.isArray(rotationIndices)
      ? rotationIndices[i]!
      : (rotationIndices as Record<FaceId, number>)[faceId] ?? 0;
    oriented.set(faceId, faceOrientationAtIndex([...faces.get(faceId)!], index));
  }
  return oriented;
}

function isBetterCandidate(
  edge: number,
  corner: number,
  cost: number,
  perfect: boolean,
  bestEdge: number,
  bestCorner: number,
  bestCost: number,
  sawPerfect: boolean,
): boolean {
  if (perfect && !sawPerfect) return true;
  if (perfect !== sawPerfect) return perfect;
  if (edge > bestEdge) return true;
  if (edge < bestEdge) return false;
  if (corner > bestCorner) return true;
  if (corner < bestCorner) return false;
  return cost < bestCost;
}

/**
 * Exhaustively try all 4⁶ per-face rotations on scan grids.
 * Orientation is inferred only from the six scanned faces (edges + corners + acceptance).
 */
export function enumerateScanOrientations(
  rawFaces: Map<FaceId, StickerColor[]>,
  isAccepted: (facelet: string) => boolean,
  options: EnumerateScanOptions = {},
): SolvableFaceletResult | null {
  const deadline =
    options.deadlineMs !== undefined ? Date.now() + options.deadlineMs : undefined;
  const requirePerfect = options.requirePerfectAdjacency ?? true;

  const indices = [0, 0, 0, 0, 0, 0];
  let bestFacelet: string | null = null;
  let bestIndices = [...indices];
  let bestEdge = -1;
  let bestCorner = -1;
  let bestCost = Number.POSITIVE_INFINITY;
  let sawPerfect = false;

  for (;;) {
    if (isPastDeadline(deadline)) break;

    const edgeScore = rawEdgeAgreementScore(rawFaces, indices);
    const cornerScore = rawCornerAgreementScore(rawFaces, indices);
    const perfect =
      edgeScore === MAX_EDGE_AGREEMENT && cornerScore === MAX_CORNER_AGREEMENT;

    if (!(requirePerfect && sawPerfect && !perfect)) {
      const trial = applyRotationIndices(rawFaces, indices);
      const facelet = buildFaceletFromMap(trial);

      if (isAccepted(facelet)) {
        const cost = indices.reduce((sum, index) => sum + faceOrientationIndexCost(index), 0);
        if (
          isBetterCandidate(
            edgeScore,
            cornerScore,
            cost,
            perfect,
            bestEdge,
            bestCorner,
            bestCost,
            sawPerfect,
          )
        ) {
          bestFacelet = facelet;
          bestIndices = [...indices];
          bestEdge = edgeScore;
          bestCorner = cornerScore;
          bestCost = cost;
          if (perfect) sawPerfect = true;
        }
      }
    }

    let digit = 0;
    while (digit < FACE_ORDER.length) {
      indices[digit]! += 1;
      if (indices[digit]! < 4) break;
      indices[digit] = 0;
      digit += 1;
    }
    if (digit >= FACE_ORDER.length) break;
  }

  if (!bestFacelet) return null;
  return { facelet: bestFacelet, rotationIndices: indicesToRecord(bestIndices) };
}

/** Pick rotation indices that map raw scans onto a solver facelet (4⁶ joint search). */
export function inferOrientationIndicesFromScans(
  rawFaces: Map<FaceId, StickerColor[]>,
  solverFacelet: string,
  options: EnumerateScanOptions = {},
): Record<FaceId, number> {
  const canonical = faceletToFaceMap(solverFacelet);
  const indices = [0, 0, 0, 0, 0, 0];
  let best = indicesToRecord(indices);
  let bestEdge = -1;
  let bestCorner = -1;
  let bestScore = -1;
  let bestCost = Number.POSITIVE_INFINITY;
  const deadline =
    options.deadlineMs !== undefined ? Date.now() + options.deadlineMs : undefined;

  for (;;) {
    if (isPastDeadline(deadline)) break;

    const edgeScore = rawEdgeAgreementScore(rawFaces, indices);
    const cornerScore = rawCornerAgreementScore(rawFaces, indices);
    const perfect =
      edgeScore === MAX_EDGE_AGREEMENT && cornerScore === MAX_CORNER_AGREEMENT;
    const score = orientedLayoutMatchScore(rawFaces, canonical, indices);
    const cost = indices.reduce((sum, index) => sum + faceOrientationIndexCost(index), 0);

    const better =
      (perfect && bestEdge < MAX_EDGE_AGREEMENT) ||
      (edgeScore > bestEdge ||
        (edgeScore === bestEdge &&
          (cornerScore > bestCorner ||
            (cornerScore === bestCorner &&
              (score > bestScore || (score === bestScore && cost < bestCost))))));

    if (better) {
      best = indicesToRecord(indices);
      bestEdge = edgeScore;
      bestCorner = cornerScore;
      bestScore = score;
      bestCost = cost;
    }

    let digit = 0;
    while (digit < FACE_ORDER.length) {
      indices[digit]! += 1;
      if (indices[digit]! < 4) break;
      indices[digit] = 0;
      digit += 1;
    }
    if (digit >= FACE_ORDER.length) break;
  }

  return best;
}
