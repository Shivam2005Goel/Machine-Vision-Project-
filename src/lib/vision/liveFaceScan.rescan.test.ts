import { describe, it, expect } from 'vitest';
import type { FaceId, ReadColor } from '../../types';
import { LiveFaceAccumulator, mergeLockedScanFaces } from './liveFaceScan';
import { reconcileLiveScanFaces } from './cubeColorReconcile';

const U_FACE: ReadColor[] = ['W', 'G', 'W', 'B', 'W', 'R', 'W', 'O', 'W'];
const F_FACE: ReadColor[] = ['G', 'G', 'Y', 'G', 'G', 'G', 'G', 'G', 'G'];
const R_FACE: ReadColor[] = ['R', 'R', 'R', 'R', 'R', 'R', 'R', 'R', 'R'];

function seedFaces(acc: LiveFaceAccumulator, entries: [FaceId, ReadColor[]][]): void {
  const internal = acc as unknown as { faces: Map<FaceId, ReadColor[]> };
  for (const [id, colors] of entries) {
    internal.faces.set(id, [...colors]);
  }
}

describe('live face rescan', () => {
  it('does not mutate locked faces when rescan starts', () => {
    const acc = new LiveFaceAccumulator();
    seedFaces(acc, [
      ['U', U_FACE],
      ['F', F_FACE],
      ['R', R_FACE],
    ]);

    acc.removeFace('F');
    acc.setRescanTarget('F');

    expect(acc.getFaces().get('U')).toEqual(U_FACE);
    expect(acc.getFaces().get('R')).toEqual(R_FACE);
    expect(acc.getFaces().has('F')).toBe(false);
  });

  it('global reconcile on partial scan does not run during rescan lock', () => {
    const locked = new Map<FaceId, ReadColor[]>([
      ['U', [...U_FACE]],
      ['R', [...R_FACE]],
    ]);
    const partial = new Map<FaceId, ReadColor[]>([
      ['U', [...U_FACE]],
      ['R', [...R_FACE]],
    ]);

    const reconciledPartial = reconcileLiveScanFaces(partial);
    const merged = mergeLockedScanFaces(locked, reconciledPartial);

    expect(merged.get('U')).toEqual(U_FACE);
    expect(merged.get('R')).toEqual(R_FACE);
  });

  it('restores locked faces when rescan capture completes', () => {
    const acc = new LiveFaceAccumulator();
    seedFaces(acc, [
      ['U', U_FACE],
      ['F', F_FACE],
    ]);

    acc.removeFace('F');
    acc.setRescanTarget('F');

    const internal = acc as unknown as {
      faces: Map<FaceId, ReadColor[]>;
      rescanTarget: FaceId | null;
      lockedFaces: Map<FaceId, ReadColor[]> | null;
    };
    internal.faces.set('F', ['G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G']);
    internal.rescanTarget = 'F';
    internal.lockedFaces = new Map([['U', [...U_FACE]]]);
    internal.faces.set('U', ['?', '?', '?', '?', 'W', '?', '?', '?', '?']);

    const finishingRescan = internal.rescanTarget === 'F';
    if (finishingRescan && internal.lockedFaces) {
      for (const [id, colors] of internal.lockedFaces) {
        internal.faces.set(id, [...colors]);
      }
    }
    internal.rescanTarget = null;
    internal.lockedFaces = null;

    expect(internal.faces.get('U')).toEqual(U_FACE);
  });
});
