import { describe, expect, it } from 'vitest';
import type { FaceId, ReadColor } from '../../types';
import {
  inferUncertainCells,
  reconcileLiveScanFaces,
  reconcileMisreadColors,
  reconcileRedOrangeFromConstraints,
} from './cubeColorReconcile';
import {
  isAwaitingFirstWhiteCenter,
  prepareMediansForClassification,
  resetScanWhiteCalibration,
} from './scanWhiteCalibration';
import { isWhiteBalanceCalibrated } from './whiteBalance';

describe('scan white calibration', () => {
  it('calibrates from first face center RGB', () => {
    resetScanWhiteCalibration();
    expect(isAwaitingFirstWhiteCenter()).toBe(true);
    expect(isWhiteBalanceCalibrated()).toBe(false);

    const warmWhite: [number, number, number][] = [
      [230, 220, 180],
      [228, 218, 178],
      [232, 222, 182],
      [229, 219, 179],
      [240, 235, 200],
      [231, 221, 181],
      [227, 217, 177],
      [233, 223, 183],
      [230, 220, 180],
    ];

    prepareMediansForClassification(warmWhite);
    expect(isAwaitingFirstWhiteCenter()).toBe(false);
    expect(isWhiteBalanceCalibrated()).toBe(true);

    const adjusted = prepareMediansForClassification(warmWhite);
    const [r, , b] = adjusted[4]!;
    expect(r).toBeGreaterThan(200);
    expect(b).toBeGreaterThan(r - 30);
  });
});

describe('inferUncertainCells', () => {
  it('fills ? when a color needs exactly one more sticker', () => {
    const faces = new Map<FaceId, ReadColor[]>([
      ['U', Array(9).fill('W') as ReadColor[]],
      ['F', ['G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', '?'] as ReadColor[]],
      ['R', Array(9).fill('R') as ReadColor[]],
    ]);
    const result = inferUncertainCells(faces);
    expect(result.get('F')![8]).toBe('G');
  });

  it('resolves deferred red/orange when only one warm color remains', () => {
    const faces = new Map<FaceId, ReadColor[]>([
      ['U', Array(9).fill('W') as ReadColor[]],
      ['D', Array(9).fill('Y') as ReadColor[]],
      ['F', Array(9).fill('G') as ReadColor[]],
      ['B', Array(9).fill('B') as ReadColor[]],
      [
        'R',
        ['R', 'R', 'R', 'R', 'R', 'R', 'R', 'R', '?'] as ReadColor[],
      ],
      ['L', Array(9).fill('O') as ReadColor[]],
    ]);
    const result = inferUncertainCells(faces);
    expect(result.get('R')![8]).toBe('R');
  });
});

describe('reconcileMisreadColors', () => {
  it('swaps surplus red to orange when too many reds were committed', () => {
    const faces = new Map<FaceId, ReadColor[]>([
      ['U', Array(9).fill('W') as ReadColor[]],
      [
        'F',
        ['R', 'R', 'R', 'R', 'G', 'R', 'R', 'R', 'R'] as ReadColor[],
      ],
      [
        'R',
        ['R', 'R', 'R', 'R', 'R', 'R', 'R', 'R', 'R'] as ReadColor[],
      ],
    ]);
    const result = reconcileMisreadColors(faces);
    const counts = { R: 0, O: 0, Y: 0, G: 0, B: 0, W: 0 };
    for (const colors of result.values()) {
      for (let i = 0; i < 9; i++) {
        const c = colors[i]!;
        if (c !== '?') counts[c as keyof typeof counts]++;
      }
    }
    expect(counts.R).toBeLessThanOrEqual(9);
    expect(counts.R).toBeGreaterThan(0);
  });

  it('reconciles live scan faces iteratively', () => {
    const faces = new Map<FaceId, ReadColor[]>([
      ['U', Array(9).fill('W') as ReadColor[]],
      ['F', Array(9).fill('G') as ReadColor[]],
      ['B', Array(9).fill('B') as ReadColor[]],
      ['D', Array(9).fill('Y') as ReadColor[]],
      ['L', Array(9).fill('O') as ReadColor[]],
      [
        'R',
        ['R', 'R', 'R', 'R', 'R', 'R', 'R', 'R', '?'] as ReadColor[],
      ],
    ]);
    const result = reconcileLiveScanFaces(faces);
    expect(result.get('R')![8]).toBe('R');
  });
});

describe('reconcileRedOrangeFromConstraints', () => {
  it('caps orange at 8 when L face is not scanned yet', () => {
    const faces = new Map<FaceId, ReadColor[]>([
      ['U', ['O', 'O', 'O', 'O', 'W', 'O', 'O', 'O', 'O'] as ReadColor[]],
      ['F', Array(9).fill('G') as ReadColor[]],
      ['R', ['O', 'O', 'O', 'O', 'R', 'O', 'O', 'O', 'O'] as ReadColor[]],
      ['B', Array(9).fill('B') as ReadColor[]],
      ['D', Array(9).fill('Y') as ReadColor[]],
    ]);
    const result = reconcileRedOrangeFromConstraints(faces);
    let oCount = 0;
    for (const colors of result.values()) {
      for (const c of colors) {
        if (c === 'O') oCount++;
      }
    }
    expect(oCount).toBeLessThanOrEqual(8);
  });

  it('moves orange to red on the R face when constraints allow', () => {
    const faces = new Map<FaceId, ReadColor[]>([
      ['U', Array(9).fill('W') as ReadColor[]],
      ['F', Array(9).fill('G') as ReadColor[]],
      ['R', ['O', 'O', 'O', 'O', 'R', 'O', 'O', 'O', 'O'] as ReadColor[]],
      ['B', Array(9).fill('B') as ReadColor[]],
      ['D', Array(9).fill('Y') as ReadColor[]],
    ]);
    const result = reconcileRedOrangeFromConstraints(faces);
    const rFace = result.get('R')!;
    expect(rFace.filter((c) => c === 'R').length).toBeGreaterThan(1);
    expect(rFace.some((c) => c === 'O')).toBe(true);
  });
});
