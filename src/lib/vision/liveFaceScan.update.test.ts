import { describe, expect, it } from 'vitest';
import type { FaceId, ReadColor } from '../../types';
import { LiveFaceAccumulator, STABLE_DURATION_MS } from './liveFaceScan';

const U_FACE: ReadColor[] = ['W', 'G', 'W', 'B', 'W', 'R', 'W', 'O', 'W'];
const U_FACE_WRONG: ReadColor[] = ['W', 'G', 'W', 'B', 'W', 'R', 'W', 'O', '?'];

function seedFaces(acc: LiveFaceAccumulator, entries: [FaceId, ReadColor[]][]): void {
  const internal = acc as unknown as { faces: Map<FaceId, ReadColor[]> };
  for (const [id, colors] of entries) {
    internal.faces.set(id, [...colors]);
  }
}

function holdStable(
  acc: LiveFaceAccumulator,
  colors: ReadColor[],
  medians: [number, number, number][] | null = null,
  startMs = 1_000,
): ReturnType<LiveFaceAccumulator['update']> {
  let snapshot = acc.update(colors, medians, startMs);
  for (let elapsed = 100; elapsed <= STABLE_DURATION_MS + 200; elapsed += 100) {
    snapshot = acc.update(colors, medians, startMs + elapsed);
    if (snapshot.newlyCaptured || snapshot.faceUpdated) break;
  }
  return snapshot;
}

describe('hold to update scanned face', () => {
  it('updates a stored face after a steady hold without tapping rescan', () => {
    const acc = new LiveFaceAccumulator();
    seedFaces(acc, [['U', U_FACE_WRONG]]);

    const snapshot = holdStable(acc, U_FACE);

    expect(snapshot.faceUpdated).toBe('U');
    expect(snapshot.needsNewFace).toBe(false);
    expect(acc.getFaces().get('U')).toEqual(U_FACE);
  });

  it('replaces a stored face after a steady hold with clearer reads', () => {
    const acc = new LiveFaceAccumulator();
    seedFaces(acc, [['U', U_FACE_WRONG]]);
    acc.setRescanTarget('U');

    const snapshot = holdStable(acc, U_FACE);

    expect(snapshot.faceUpdated).toBe('U');
    expect(acc.getFaces().get('U')).toEqual(U_FACE);
  });

  it('captures R face even when white corners resemble a scanned U face', () => {
    const acc = new LiveFaceAccumulator();
    const uStored: ReadColor[] = ['W', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W'];
    seedFaces(acc, [
      ['U', uStored],
      ['F', ['G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G']],
    ]);

    const rView: ReadColor[] = ['W', 'R', 'W', 'R', 'R', 'R', 'W', 'R', 'W'];
    const snapshot = holdStable(acc, rView);

    expect(snapshot.holdingScannedFace).toBe(false);
    expect(snapshot.newlyCaptured).toBe('R');
    expect(acc.getFaces().has('R')).toBe(true);
  });

  it('captures faces in any order by center colour', () => {
    const acc = new LiveFaceAccumulator();
    seedFaces(acc, [['U', U_FACE]]);

    const fView: ReadColor[] = ['G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G'];
    const fSnapshot = holdStable(acc, fView);

    expect(fSnapshot.newlyCaptured).toBe('F');
    expect(acc.getFaces().has('F')).toBe(true);

    const rView: ReadColor[] = ['R', 'R', 'R', 'R', 'R', 'R', 'R', 'R', 'R'];
    const rSnapshot = holdStable(acc, rView);

    expect(rSnapshot.newlyCaptured).toBe('R');
    expect(acc.getFaces().has('R')).toBe(true);
  });

  it('captures a face as soon as its center colour is clear', () => {
    const acc = new LiveFaceAccumulator();
    seedFaces(acc, [['U', U_FACE]]);

    const greenCenter: ReadColor[] = ['Y', 'Y', 'Y', 'Y', 'G', 'Y', 'Y', 'Y', 'Y'];
    const snapshot = holdStable(acc, greenCenter);

    expect(snapshot.newlyCaptured).toBe('F');
    expect(acc.getFaces().has('F')).toBe(true);
  });
});
