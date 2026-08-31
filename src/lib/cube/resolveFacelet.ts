import Cube from 'cubejs';
import { findSolvableCubeFromCaptures } from './faceOrientation';
import { isFaceletStructurallyValid } from './faceletStructure';
import { isFaceletColorBalanced } from './faceletValidate';
import { isCubePhysicallySolvable } from './solvability';
import {
  applyRotationIndices,
  enumerateScanOrientations,
  inferOrientationIndicesFromScans,
} from './scanOrientationSearch';
import type { FaceId, StickerColor } from '../../types';
import { buildFaceletFromMap } from './state';

const RESOLVE_BUDGET_MS = 12_000;

export interface ResolvedFacelet {
  facelet: string;
  rotationIndices: Record<FaceId, number>;
}

export function isSolvableFacelet(facelet: string): boolean {
  if (!isFaceletColorBalanced(facelet) || !isFaceletStructurallyValid(facelet)) {
    return false;
  }

  try {
    const cube = Cube.fromString(facelet);
    return isCubePhysicallySolvable(cube as never);
  } catch {
    return false;
  }
}

function facesFromRecord(
  record: Record<FaceId, StickerColor[]> | Map<FaceId, StickerColor[]>,
): Map<FaceId, StickerColor[]> {
  if (record instanceof Map) return record;
  return new Map(Object.entries(record) as [FaceId, StickerColor[]][]);
}

function remainingMs(deadline: number): number {
  return Math.max(0, deadline - Date.now());
}

function isStructurallyValidFacelet(facelet: string): boolean {
  return isFaceletColorBalanced(facelet) && isFaceletStructurallyValid(facelet);
}

/**
 * Align per-face scan grids to a solvable Singmaster facelet.
 * Search and solver both use the same scan-layout face map so orientation
 * indices round-trip to the palette shown during solving.
 */
export function resolveFaceletForSolve(
  scannedFaces: Record<FaceId, StickerColor[]> | Map<FaceId, StickerColor[]>,
  captures: StickerColor[][],
  _rawFaces?: Record<FaceId, StickerColor[]> | Map<FaceId, StickerColor[]>,
  budgetMs = RESOLVE_BUDGET_MS,
): ResolvedFacelet | null {
  const deadline = Date.now() + budgetMs;
  const layout = facesFromRecord(scannedFaces);

  const tryApply = (rotationIndices: Record<FaceId, number>): ResolvedFacelet | null => {
    const solverFacelet = buildFaceletFromMap(applyRotationIndices(layout, rotationIndices));
    if (!isSolvableFacelet(solverFacelet)) return null;
    return { facelet: solverFacelet, rotationIndices };
  };

  const structural = enumerateScanOrientations(layout, isStructurallyValidFacelet, {
    deadlineMs: remainingMs(deadline),
    requirePerfectAdjacency: true,
  });
  if (structural) {
    const solved = tryApply(structural.rotationIndices);
    if (solved) return solved;
  }

  const layoutSolvable = enumerateScanOrientations(layout, isSolvableFacelet, {
    deadlineMs: remainingMs(deadline),
    requirePerfectAdjacency: true,
  });
  if (layoutSolvable) {
    const solved = tryApply(layoutSolvable.rotationIndices);
    if (solved) return solved;
  }

  const relaxed = enumerateScanOrientations(layout, isSolvableFacelet, {
    deadlineMs: remainingMs(deadline),
    requirePerfectAdjacency: false,
  });
  if (relaxed) {
    const solved = tryApply(relaxed.rotationIndices);
    if (solved) return solved;
  }

  const fallback = findSolvableCubeFromCaptures(
    captures,
    isSolvableFacelet,
    Math.min(3_000, remainingMs(deadline)),
  );
  if (!fallback) return null;
  if (layout.size === 6) {
    return {
      facelet: fallback.facelet,
      rotationIndices: inferOrientationIndicesFromScans(layout, fallback.facelet),
    };
  }
  return fallback;
}
