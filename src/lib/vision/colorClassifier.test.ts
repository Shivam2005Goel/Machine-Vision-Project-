import { describe, expect, it } from 'vitest';

import { classifyFaceRelative, classifySticker } from './colorClassifier';
import { resetColorReferences } from './colorReference';
import type { ReadColor } from '../../types';

function classifyCell(r: number, g: number, b: number): ReadColor {
  return classifyFaceRelative([[r, g, b]])[0]!;
}

describe('relative face color classification', () => {
  it('classifies warm/yellow lighting using chromaticity ratios', () => {
    resetColorReferences();
    expect(classifySticker(240, 220, 80)).toBe('Y');
    expect(classifySticker(250, 245, 235)).toBe('W');
    expect(classifySticker(80, 150, 90)).toBe('G');
    expect(classifySticker(90, 100, 210)).toBe('B');
    expect(classifySticker(220, 90, 80)).toBe('R');
  });

  it('classifies a mixed face under yellow light', () => {
    resetColorReferences();
    const warmMixed: [number, number, number][] = [
      [230, 210, 70],
      [235, 215, 75],
      [90, 100, 210],
      [232, 212, 72],
      [240, 220, 80],
      [88, 98, 205],
      [220, 90, 80],
      [236, 216, 76],
      [225, 95, 85],
    ];
    const colors: ReadColor[] = classifyFaceRelative(warmMixed);
    expect(colors[4]).toBe('Y');
    expect(colors).toContain('B');
    expect(colors.some((c) => c === 'R' || c === '?')).toBe(true);
  });

  it('classifies red and orange like other sticker colors', () => {
    resetColorReferences();
    const warmOrange: [number, number, number] = [235, 140, 75];
    const warmRed: [number, number, number] = [220, 90, 80];
    const orangeRead = classifyCell(...warmOrange);
    const redRead = classifyCell(...warmRed);
    expect(orangeRead).not.toBe('?');
    expect(redRead).not.toBe('?');
    expect(orangeRead === 'R' || orangeRead === 'O').toBe(true);
    expect(redRead === 'R' || redRead === 'O').toBe(true);

    const faceWithOrangeCenter: [number, number, number][] = [
      [255, 0, 0],
      [255, 0, 0],
      [255, 0, 0],
      [255, 0, 0],
      warmOrange,
      [255, 0, 0],
      [255, 0, 0],
      [255, 0, 0],
      [255, 0, 0],
    ];
    const colors = classifyFaceRelative(faceWithOrangeCenter);
    expect(colors.every((c) => c !== '?')).toBe(true);
    expect(colors.filter((c) => c === 'R').length).toBeGreaterThan(0);
  });
});
