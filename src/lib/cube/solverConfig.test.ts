import { describe, expect, it } from 'vitest';
import {
  CLIENT_SOLVE_TIMEOUT_MS,
  GODS_NUMBER_HTM,
  KOCIEMBA_SOLVE_MAX_DEPTH,
  SOLVE_PROBE_TIMEOUT_MS,
} from './solverConfig';

describe('solverConfig', () => {
  it('targets God\'s number in half-turn metric', () => {
    expect(GODS_NUMBER_HTM).toBe(20);
    expect(KOCIEMBA_SOLVE_MAX_DEPTH).toBe(GODS_NUMBER_HTM);
  });

  it('keeps UI timeout above worker probe timeout', () => {
    expect(CLIENT_SOLVE_TIMEOUT_MS).toBeGreaterThan(SOLVE_PROBE_TIMEOUT_MS);
  });
});
