import Cube from 'cubejs';
import { describe, expect, it } from 'vitest';
import type { FaceId, StickerColor } from '../../types';
import { rotateFaceClockwise } from './faceOrientation';
import { cubiesFromFacelet } from './faceletColors';
import { faceletInScanLayout, inferScanOrientationIndices } from './scanDisplayLayout';
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

function cubieKey(coords: { x: number; y: number; z: number }): string {
  return `${coords.x},${coords.y},${coords.z}`;
}

describe('cubiesFromFacelet', () => {
  it('scan-layout facelet breaks global cubie assembly vs solver facelet', () => {
    const canonical = Cube.random().asString();
    const scanned = rotateScannedFaces(faceletToFaceMap(canonical), {
      U: 1,
      R: 2,
      F: 3,
      D: 1,
      L: 2,
      B: 3,
    });
    const indices = inferScanOrientationIndices(scanned, canonical);
    const scanLayoutFacelet = faceletInScanLayout(canonical, indices);

    expect(scanLayoutFacelet).toBe(buildFaceletFromMap(scanned));
    expect(scanLayoutFacelet).not.toBe(canonical);

    const solverCubies = new Map(
      cubiesFromFacelet(canonical).map((cubie) => [cubieKey(cubie.coords), cubie.faces]),
    );
    const layoutCubies = cubiesFromFacelet(scanLayoutFacelet);

    let mismatched = 0;
    for (const cubie of layoutCubies) {
      const solver = solverCubies.get(cubieKey(cubie.coords));
      if (!solver) continue;
      if (JSON.stringify(solver) !== JSON.stringify(cubie.faces)) {
        mismatched++;
      }
    }

    expect(mismatched).toBeGreaterThan(0);
  });
});
