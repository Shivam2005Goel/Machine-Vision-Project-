import { describe, expect, it } from 'vitest';
import { CALIBRATION_ORDER } from './colors';
import { getMissingScanFaces, getNextScanFace, getScanStepHint } from './scanNet';

describe('scanNet', () => {
  it('keeps palette display order W R Y O G B', () => {
    expect(CALIBRATION_ORDER).toEqual(['U', 'R', 'D', 'L', 'F', 'B']);
  });

  it('lists missing faces without enforcing scan sequence', () => {
    expect(getMissingScanFaces([])).toEqual(['U', 'R', 'D', 'L', 'F', 'B']);
    expect(getMissingScanFaces(['U', 'F'])).toEqual(['R', 'D', 'L', 'B']);
    expect(getMissingScanFaces(['U', 'R', 'D', 'L', 'F', 'B'])).toEqual([]);
  });

  it('getNextScanFace returns the first missing face for palette hints', () => {
    expect(getNextScanFace([])).toBe('U');
    expect(getNextScanFace(['U', 'F'])).toBe('R');
    expect(getNextScanFace(['U', 'R', 'D', 'L', 'F', 'B'])).toBeNull();
  });

  it('formats step hints', () => {
    expect(getScanStepHint('U')).toBe('1 of 6');
    expect(getScanStepHint('B')).toBe('6 of 6');
  });
});
