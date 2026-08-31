import Cube from 'cubejs';
import { describe, expect, it } from 'vitest';
import type { FaceId, StickerColor } from '../../types';
import {
  findSolvableFacelet,
  orientedLayoutMatchScore,
  rotateFaceClockwise,
  scanLayoutMatchScore,
} from './faceOrientation';
import { isFaceletColorBalanced } from './faceletValidate';
import { isFaceletStructurallyValid } from './faceletStructure';
import { isCubePhysicallySolvable } from './solvability';
import { buildFaceletFromMap, faceletToFaceMap } from './state';

function isSolvableFacelet(facelet: string): boolean {
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

describe('findSolvableFacelet orientation correction', () => {
  it('recovers canonical facelet when scans are per-face rotated', () => {
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

    const rawFacelet = buildFaceletFromMap(scanned);
    expect(isSolvableFacelet(rawFacelet)).toBe(false);

    const oriented = findSolvableFacelet(scanned, isSolvableFacelet);
    expect(oriented?.facelet).toBe(canonical);
  });

  it('keeps identity when it is the only solvable orientation', () => {
    const canonical = Cube.random().asString();
    const faces = faceletToFaceMap(canonical);

    const oriented = findSolvableFacelet(faces, isSolvableFacelet);
    expect(oriented?.facelet).toBe(canonical);
  });

  it('prefers the raw scan layout when it is already solvable', () => {
    const canonical = Cube.random().asString();
    const faces = faceletToFaceMap(canonical);

    const oriented = findSolvableFacelet(faces, isSolvableFacelet);

    expect(oriented?.facelet).toBe(canonical);
    expect(scanLayoutMatchScore(faces, faceletToFaceMap(oriented!.facelet))).toBe(54);
  });

  it('prefers cross-face edge agreement over a wrong global rotation', () => {
    const canonical = Cube.random().asString();
    const canonicalMap = faceletToFaceMap(canonical);
    const scanned = new Map(canonicalMap);
    scanned.set('F', rotateFaceClockwise([...canonicalMap.get('F')!]));

    const oriented = findSolvableFacelet(scanned, isSolvableFacelet, {
      rawFaces: scanned,
    });
    expect(oriented?.facelet).toBe(canonical);
  });

  it('scores oriented raw grids when comparing rotation candidates', () => {
    const canonical = Cube.random().asString();
    const canonicalMap = faceletToFaceMap(canonical);
    const scanned = rotateScannedFaces(canonicalMap, { F: 1 });
    const indices = [0, 0, 3, 0, 0, 0];

    expect(orientedLayoutMatchScore(scanned, canonicalMap, indices)).toBe(54);
    expect(scanLayoutMatchScore(scanned, canonicalMap)).toBeLessThan(54);
  });
});
