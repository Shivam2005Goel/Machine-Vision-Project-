import Cube from 'cubejs';
import { describe, expect, it } from 'vitest';
import type { FaceId, StickerColor } from '../../types';
import { rawEdgeAgreementScore } from './faceAdjacency';
import { faceOrientationAtIndex, rotateFaceClockwise } from './faceOrientation';
import { faceletToFaceMap } from './state';

const FACE_ORDER: FaceId[] = ['U', 'R', 'F', 'D', 'L', 'B'];

describe('faceAdjacency', () => {
  it('scores 36 when raw scans use the canonical layout', () => {
    const canonical = Cube.random().asString();
    const faces = faceletToFaceMap(canonical);
    const indices = [0, 0, 0, 0, 0, 0];
    expect(rawEdgeAgreementScore(faces, indices)).toBe(36);
  });

  it('scores lower when one face is rotated wrong relative to its neighbours', () => {
    const canonical = Cube.random().asString();
    const faces = faceletToFaceMap(canonical);
    const wrong = new Map(faces);
    wrong.set('F', rotateFaceClockwise([...faces.get('F')!]));

    expect(rawEdgeAgreementScore(wrong, [0, 0, 0, 0, 0, 0])).toBeLessThan(36);
  });

  it('scores 36 when rotation indices undo per-face scan rotations', () => {
    const canonical = Cube.random().asString();
    const canonicalMap = faceletToFaceMap(canonical);
    const scanRotations = [1, 2, 3, 1, 2, 3];
    const scanned = new Map<FaceId, StickerColor[]>();

    for (let i = 0; i < FACE_ORDER.length; i++) {
      const faceId = FACE_ORDER[i]!;
      scanned.set(faceId, faceOrientationAtIndex([...canonicalMap.get(faceId)!], scanRotations[i]!));
    }

    const undo = scanRotations.map((turn) => (4 - turn) % 4);
    expect(rawEdgeAgreementScore(scanned, undo)).toBe(36);
  });
});
