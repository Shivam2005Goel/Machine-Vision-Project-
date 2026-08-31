import { describe, it, expect } from 'vitest';
import type { FaceId, StickerColor } from '../../types';
import {
  reconcileLiveScanFaces,
  inferUncertainCells,
  getStickerImbalance,
  suggestRescanFaces,
  formatColourMismatchError,
  isCubeColorBalanced,
} from './cubeColorReconcile';

describe('scan reconcile helpers', () => {
  it('reconcileLiveScanFaces can still infer ? cells for solver prep', () => {
    const faces = new Map<FaceId, StickerColor[]>([
      ['U', Array(9).fill('W') as StickerColor[]],
      ['D', Array(9).fill('Y') as StickerColor[]],
      ['F', Array(9).fill('G') as StickerColor[]],
      ['B', Array(9).fill('B') as StickerColor[]],
      ['R', Array(9).fill('R') as StickerColor[]],
      ['L', ['O', 'O', 'O', 'O', 'O', 'O', 'O', 'O', '?'] as StickerColor[]],
    ]);

    const reconciled = reconcileLiveScanFaces(faces);
    expect(reconciled.get('L')![8]).toBe('O');
    expect(getStickerImbalance(reconciled as Map<FaceId, StickerColor[]>).W).toBe(0);
  });

  it('inferUncertainCells fills a lone missing sticker', () => {
    const faces = new Map<FaceId, StickerColor[]>([
      ['U', Array(9).fill('W') as StickerColor[]],
      ['F', ['G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', '?'] as StickerColor[]],
      ['R', Array(9).fill('R') as StickerColor[]],
    ]);
    const result = inferUncertainCells(faces);
    expect(result.get('F')![8]).toBe('G');
  });

  it('suggests the yellow face when one white sticker should be blue', () => {
    const faces = new Map<FaceId, StickerColor[]>([
      ['U', Array(9).fill('W') as StickerColor[]],
      ['D', ['Y', 'Y', 'W', 'Y', 'Y', 'Y', 'Y', 'Y', 'Y'] as StickerColor[]],
      ['F', Array(9).fill('G') as StickerColor[]],
      ['B', ['B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'Y'] as StickerColor[]],
      ['R', Array(9).fill('R') as StickerColor[]],
      ['L', Array(9).fill('O') as StickerColor[]],
    ]);

    const imbalance = getStickerImbalance(faces);
    expect(imbalance.W).toBe(1);
    expect(imbalance.B).toBe(-1);

    const suggested = suggestRescanFaces(faces);
    expect(suggested).toEqual(['D']);
    expect(formatColourMismatchError(faces)).toBe(
      'Could not build a valid cube from the scan. Please re-scan all faces.',
    );
  });

  it('rebalances G/B and O/Y misreads before solve', () => {
    const faces = new Map<FaceId, StickerColor[]>([
      ['U', ['R', 'W', 'R', 'O', 'W', 'G', 'O', 'Y', 'G']],
      ['F', ['B', 'Y', 'B', 'G', 'G', 'O', 'R', 'B', 'B']],
      ['R', ['G', 'B', 'R', 'R', 'R', 'B', 'Y', 'W', 'Y']],
      ['B', ['G', 'Y', 'W', 'W', 'B', 'W', 'G', 'O', 'O']],
      ['L', ['B', 'G', 'G', 'B', 'O', 'Y', 'R', 'R', 'Y']],
      ['D', ['B', 'R', 'G', 'O', 'Y', 'O', 'W', 'W', 'W']],
    ]);

    expect(isCubeColorBalanced(faces)).toBe(false);
    expect(getStickerImbalance(faces).G).toBe(1);
    expect(getStickerImbalance(faces).B).toBe(1);

    const reconciled = reconcileLiveScanFaces(faces) as Map<FaceId, StickerColor[]>;
    expect(isCubeColorBalanced(reconciled)).toBe(true);
    expect(getStickerImbalance(reconciled).G).toBe(0);
    expect(getStickerImbalance(reconciled).B).toBe(0);
    expect(getStickerImbalance(reconciled).O).toBe(0);
    expect(getStickerImbalance(reconciled).Y).toBe(0);
  });
});
