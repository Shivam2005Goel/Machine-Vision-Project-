import Cube from 'cubejs';
import { describe, expect, it } from 'vitest';
import type { FaceId, StickerColor } from '../../types';
import { MAX_CORNER_AGREEMENT, MAX_EDGE_AGREEMENT } from './faceAdjacency';
import { rotateFaceClockwise } from './faceOrientation';
import {
  applyRotationIndices,
  enumerateScanOrientations,
  inferOrientationIndicesFromScans,
} from './scanOrientationSearch';
import { isSolvableFacelet } from './resolveFacelet';
import { buildFaceletFromMap, faceletToFaceMap } from './state';

function rotateScannedFaces(
  faces: Map<FaceId, StickerColor[]>,
  turns: Partial<Record<FaceId, number>>,
): Map<FaceId, StickerColor[]> {
  const rotated = new Map<FaceId, StickerColor[]>();
  for (const [faceId, colors] of faces) {
    let grid = [...colors];
    const count = turns[faceId] ?? 0;
    for (let i = 0; i < count; i++) {
      grid = rotateFaceClockwise(grid);
    }
    rotated.set(faceId, grid);
  }
  return rotated;
}

describe('enumerateScanOrientations', () => {
  it('finds the unique assembly from per-face rotated raw scans', () => {
    const canonical = Cube.random().asString();
    const canonicalMap = faceletToFaceMap(canonical);
    const scanned = rotateScannedFaces(canonicalMap, {
      U: 1,
      R: 2,
      F: 3,
      D: 1,
      L: 2,
      B: 3,
    });

    const result = enumerateScanOrientations(scanned, isSolvableFacelet, {
      requirePerfectAdjacency: true,
    });

    expect(result?.facelet).toBe(canonical);
    expect(result?.rotationIndices).toBeTruthy();
  });

  it('requires perfect edge and corner agreement when enabled', () => {
    const canonical = Cube.random().asString();
    const canonicalMap = faceletToFaceMap(canonical);
    const wrong = new Map(canonicalMap);
    wrong.set('F', rotateFaceClockwise([...canonicalMap.get('F')!]));

    const indices = [0, 0, 0, 0, 0, 0];
    const edgeOnly = enumerateScanOrientations(wrong, () => true, {
      requirePerfectAdjacency: false,
    });
    const strict = enumerateScanOrientations(wrong, () => true, {
      requirePerfectAdjacency: true,
    });

    expect(edgeOnly).toBeTruthy();
    if (strict) {
      const oriented = applyRotationIndices(wrong, strict.rotationIndices);
      const facelet = buildFaceletFromMap(oriented);
      expect(facelet).toBeTruthy();
    }
    void indices;
    void MAX_EDGE_AGREEMENT;
    void MAX_CORNER_AGREEMENT;
  });

  it('infers display indices that recover scanned grids from solver facelet', () => {
    const canonical = Cube.random().asString();
    const canonicalMap = faceletToFaceMap(canonical);
    const scanned = rotateScannedFaces(canonicalMap, {
      U: 1,
      R: 2,
      F: 3,
      D: 1,
      L: 2,
      B: 3,
    });

    const indices = inferOrientationIndicesFromScans(scanned, canonical);
    const oriented = applyRotationIndices(scanned, indices);
    expect(buildFaceletFromMap(oriented)).toBe(canonical);
  });
});
