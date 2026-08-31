import Cube from 'cubejs';
import { describe, expect, it } from 'vitest';
import { rotateFaceClockwise } from './faceOrientation';
import { resolveFaceletForSolve, isSolvableFacelet } from './resolveFacelet';
import {
  displayMatchesRawScans,
  faceletInScanLayout,
} from './scanDisplayLayout';
import { buildFaceletFromMap, faceletToFaceMap } from './state';
import type { FaceId, StickerColor } from '../../types';

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

describe('resolveFaceletForSolve', () => {
  it('recovers canonical layout from per-face rotated scans', () => {
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
    const record = Object.fromEntries(scanned) as Record<FaceId, StickerColor[]>;
    const captures = [...scanned.values()];

    expect(isSolvableFacelet(buildFaceletFromMap(scanned))).toBe(false);
    expect(resolveFaceletForSolve(record, captures)?.facelet).toBe(canonical);
  });

  it('returns orientation indices that round-trip to the scan layout', () => {
    const canonical = Cube.random().asString();
    const canonicalMap = faceletToFaceMap(canonical);
    const layout = rotateScannedFaces(canonicalMap, {
      U: 1,
      R: 2,
      F: 3,
      D: 1,
      L: 2,
      B: 3,
    });
    const captures = [...layout.values()];

    const resolved = resolveFaceletForSolve(
      Object.fromEntries(layout) as Record<FaceId, StickerColor[]>,
      captures,
    );

    expect(resolved).not.toBeNull();
    expect(
      displayMatchesRawScans(resolved!.facelet, resolved!.rotationIndices, layout),
    ).toBe(true);
    expect(faceletInScanLayout(resolved!.facelet, resolved!.rotationIndices)).toBe(
      buildFaceletFromMap(layout),
    );
  });
});
