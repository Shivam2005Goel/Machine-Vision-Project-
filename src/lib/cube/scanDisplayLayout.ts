import type { FaceId, StickerColor } from '../../types';
import { faceOrientationAtIndex, inverseFaceOrientationIndex } from './faceOrientation';
import { inferOrientationIndicesFromScans } from './scanOrientationSearch';
import { buildFaceletFromMap, faceletToFaceMap, FACELET_ORDER } from './state';

function faceGridExactMatch(a: StickerColor[], b: StickerColor[]): boolean {
  if (a.length !== 9 || b.length !== 9) return false;
  for (let i = 0; i < 9; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function hasCompleteOrientations(
  orientations: Partial<Record<FaceId, number>>,
): orientations is Record<FaceId, number> {
  return FACELET_ORDER.every((faceId) => orientations[faceId] !== undefined);
}

/** Apply one of four scan-orientation variants (90° rotations only). */
export function orientFaceByIndex(colors: StickerColor[], index: number): StickerColor[] {
  return faceOrientationAtIndex(colors, index);
}

/** Inverse index so orient(orient(raw, fwd), inv) restores raw. */
export function inverseOrientationIndex(forwardIndex: number): number {
  return inverseFaceOrientationIndex(forwardIndex);
}

/** Joint 4⁶ search: map raw scan grids onto the solver facelet. */
export function inferScanOrientationIndices(
  scannedFaces: Map<FaceId, StickerColor[]>,
  solverFacelet: string,
): Record<FaceId, number> {
  return inferOrientationIndicesFromScans(scannedFaces, solverFacelet);
}

/** True when mapped display grids exactly match the raw scan palette. */
export function displayMatchesRawScans(
  solverFacelet: string,
  orientationIndices: Partial<Record<FaceId, number>>,
  rawScans: Map<FaceId, StickerColor[]>,
): boolean {
  if (!solverFacelet || solverFacelet.length !== 54 || rawScans.size !== 6) return false;
  if (!hasCompleteOrientations(orientationIndices)) return false;

  const display = faceletToFaceMap(faceletInScanLayout(solverFacelet, orientationIndices));
  for (const faceId of FACELET_ORDER) {
    const raw = rawScans.get(faceId);
    const shown = display.get(faceId);
    if (!raw || !shown || !faceGridExactMatch(raw, shown)) return false;
  }
  return true;
}

/**
 * Pick per-face rotation indices so the solving guide matches the scan palette.
 * Prefer worker indices from orientation search; infer only when they do not match.
 */
export function resolveDisplayOrientations(
  solverFacelet: string,
  scanLayout: Map<FaceId, StickerColor[]>,
  workerOrientations?: Partial<Record<FaceId, number>>,
): Record<FaceId, number> {
  if (scanLayout.size !== 6 || solverFacelet.length !== 54) {
    return (workerOrientations ?? {}) as Record<FaceId, number>;
  }

  if (
    workerOrientations &&
    hasCompleteOrientations(workerOrientations) &&
    displayMatchesRawScans(solverFacelet, workerOrientations, scanLayout)
  ) {
    return workerOrientations;
  }

  return inferScanOrientationIndices(scanLayout, solverFacelet);
}

/** Map solver facelet stickers back to the scanned per-face grid layout. */
export function faceletInScanLayout(
  solverFacelet: string,
  orientationIndices: Partial<Record<FaceId, number>>,
): string {
  if (!solverFacelet || solverFacelet.length !== 54) return solverFacelet;

  const canonical = faceletToFaceMap(solverFacelet);
  const display = new Map<FaceId, StickerColor[]>();

  for (const faceId of FACELET_ORDER) {
    const face = canonical.get(faceId);
    if (!face) continue;
    const forward = orientationIndices[faceId] ?? 0;
    const inverse = inverseOrientationIndex(forward);
    display.set(faceId, faceOrientationAtIndex([...face], inverse));
  }

  return buildFaceletFromMap(display);
}
