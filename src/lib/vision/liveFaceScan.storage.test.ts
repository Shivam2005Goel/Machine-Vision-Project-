import { describe, expect, it } from 'vitest';
import type { FaceId, ReadColor } from '../../types';
import { facesForDisplay, fallbackUncertainFromHistory } from './liveFaceScan';

describe('scan storage vs display', () => {
  it('shows stored colors without re-correction', () => {
    const stored = new Map<FaceId, ReadColor[]>([
      ['U', ['W', 'Y', 'W', 'Y', 'W', 'W', 'Y', 'W', 'Y']],
      ['F', ['W', 'W', 'W', 'W', 'G', 'G', 'G', 'G', 'G']],
    ]);

    const displayed = facesForDisplay(stored);
    expect(displayed.get('U')).toEqual(['W', 'Y', 'W', 'Y', 'W', 'W', 'Y', 'W', 'Y']);
    expect(displayed.get('F')!.filter((c) => c === 'W').length).toBe(4);
    expect(displayed.get('F')![4]).toBe('G');
  });

  it('fills uncertain cells from the latest stable frame', () => {
    const voted: ReadColor[] = ['G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', '?'];
    const history: ReadColor[][] = [
      ['G', 'G', 'G', 'G', 'G', 'G', 'G', 'W', 'G'],
      ['G', 'G', 'G', 'G', 'G', 'G', 'G', 'G', 'G'],
    ];

    const filled = fallbackUncertainFromHistory(voted, history);
    expect(filled[8]).toBe('G');
  });

  it('does not mutate stored colors at display time', () => {
    const stored = new Map<FaceId, ReadColor[]>([
      ['B', ['Y', 'Y', 'Y', 'Y', 'B', 'Y', 'Y', 'Y', 'Y']],
    ]);

    const displayed = facesForDisplay(stored);
    expect(displayed.get('B')!.filter((c) => c === 'Y').length).toBe(8);
  });
});
