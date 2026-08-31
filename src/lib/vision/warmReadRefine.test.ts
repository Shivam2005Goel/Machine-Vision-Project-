import { describe, it, expect, beforeEach } from 'vitest';
import { refineWarmReadsForFace } from './colorClassifier';
import { resetColorReferences, saveLearnedColor } from './colorReference';
import type { ReadColor } from '../../types';

describe('refineWarmReadsForFace', () => {
  beforeEach(() => {
    resetColorReferences();
    saveLearnedColor('R', [48, 62, 38]);
    saveLearnedColor('O', [62, 42, 62]);
    saveLearnedColor('Y', [88, -4, 82]);
    saveLearnedColor('G', [55, -48, 32]);
    saveLearnedColor('B', [32, 28, -52]);
    saveLearnedColor('W', [95, 0, 0]);
  });

  it('corrects orange misread as red on the orange face', () => {
    const colors: ReadColor[] = ['R', 'R', 'R', 'R', 'O', 'R', 'R', 'R', 'R'];
    const medians: [number, number, number][] = Array.from({ length: 9 }, () => [235, 140, 75]);
    medians[4] = [235, 130, 70];

    const refined = refineWarmReadsForFace(colors, medians, 'L');
    expect(refined.filter((c) => c === 'O').length).toBeGreaterThanOrEqual(7);
    expect(refined[4]).toBe('O');
  });

  it('keeps confident red on the red face', () => {
    const colors: ReadColor[] = ['R', 'R', 'R', 'R', 'R', 'R', 'R', 'R', 'R'];
    const medians: [number, number, number][] = Array.from({ length: 9 }, () => [220, 85, 75]);

    const refined = refineWarmReadsForFace(colors, medians, 'R');
    expect(refined.every((c) => c === 'R')).toBe(true);
  });
});
