import Cube from 'cubejs';
import { describe, expect, it } from 'vitest';
import type { FaceId, StickerColor } from '../../types';
import { rotateFaceClockwise } from './faceOrientation';
import {
  displayMatchesRawScans,
  faceletInScanLayout,
  inferScanOrientationIndices,
  inverseOrientationIndex,
  orientFaceByIndex,
  resolveDisplayOrientations,
} from './scanDisplayLayout';
import { resolveFaceletForSolve } from './resolveFacelet';
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

describe('scanDisplayLayout', () => {
  it('inverseOrientationIndex undoes orientFaceByIndex', () => {
    const raw = ['W', 'Y', 'R', 'O', 'G', 'B', 'W', 'Y', 'R'] as StickerColor[];
    for (let fwd = 0; fwd < 4; fwd++) {
      const inv = inverseOrientationIndex(fwd);
      const oriented = orientFaceByIndex(raw, fwd);
      const back = orientFaceByIndex(oriented, inv);
      expect(back).toEqual(raw);
    }
  });

  it('faceletInScanLayout recovers raw scan grids from a solver facelet', () => {
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

    const indices = inferScanOrientationIndices(scanned, canonical);
    const displayFacelet = faceletInScanLayout(canonical, indices);
    const displayMap = faceletToFaceMap(displayFacelet);

    for (const faceId of ['U', 'R', 'F', 'D', 'L', 'B'] as FaceId[]) {
      expect(displayMap.get(faceId)).toEqual(scanned.get(faceId));
    }
  });

  it('jointly infers rotation when a single face is locally ambiguous', () => {
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

    const indices = inferScanOrientationIndices(scanned, canonical);
    const displayFacelet = faceletInScanLayout(canonical, indices);
    const displayMap = faceletToFaceMap(displayFacelet);

    for (const faceId of ['U', 'R', 'F', 'D', 'L', 'B'] as FaceId[]) {
      expect(displayMap.get(faceId)).toEqual(scanned.get(faceId));
    }
  });

  it('prefers identity rotation when orientation inference ties', () => {
    const canonical = Cube.random().asString();
    const canonicalMap = faceletToFaceMap(canonical);
    const scanned = new Map(canonicalMap);
    scanned.set('U', Array(9).fill('W') as StickerColor[]);

    const indices = inferScanOrientationIndices(scanned, canonical);
    expect(indices.U).toBe(0);
  });

  it('resolveDisplayOrientations prefers valid worker indices', () => {
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

    const resolved = resolveFaceletForSolve(
      Object.fromEntries(scanned) as Record<FaceId, StickerColor[]>,
      [...scanned.values()],
    );
    expect(resolved).not.toBeNull();

    const orientations = resolveDisplayOrientations(
      resolved!.facelet,
      scanned,
      resolved!.rotationIndices,
    );

    expect(orientations).toEqual(resolved!.rotationIndices);
    expect(faceletInScanLayout(resolved!.facelet, orientations)).toBe(
      buildFaceletFromMap(scanned),
    );
  });

  it('resolveDisplayOrientations infers when worker indices are wrong', () => {
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

    const wrongWorker = { U: 0, R: 0, F: 0, D: 0, L: 0, B: 0 };
    const resolved = resolveDisplayOrientations(canonical, scanned, wrongWorker);

    expect(displayMatchesRawScans(canonical, resolved, scanned)).toBe(true);
    expect(faceletInScanLayout(canonical, resolved)).toBe(buildFaceletFromMap(scanned));
  });

  it('round-trips after applying a move on the solver facelet', () => {
    const canonical = Cube.random().asString();
    const scanned = faceletToFaceMap(canonical);
    const indices = inferScanOrientationIndices(scanned, canonical);

    const cube = Cube.fromString(canonical);
    cube.move('R');
    const after = cube.asString();

    const displayAfter = faceletInScanLayout(after, indices);
    const cubeAfter = Cube.fromString(canonical);
    cubeAfter.move('R');
    const expectedDisplay = faceletInScanLayout(cubeAfter.asString(), indices);

    expect(displayAfter).toBe(expectedDisplay);
    expect(faceletInScanLayout(canonical, indices)).toBe(buildFaceletFromMap(scanned));
  });
});
