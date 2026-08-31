import { describe, expect, it } from 'vitest';
import Cube from 'cubejs';
import type { Move } from '../../types';
import { applyMoveToFacelet } from './moveColorProgress';

const SCRAMBLED =
  'DUUBULDBFRBFRRULLLBRDFFFBLURDBFDFDRFRULBLUFDURRBLBDUDL';

/** Mirrors applyCompletedMove guard + immediate solutionRef sync. */
function createSolverSession(moves: Move[]) {
  let facelet = SCRAMBLED;
  let solution = { moves, currentIndex: 0 };

  const tryApply = (move: Move): boolean => {
    if (solution.currentIndex >= solution.moves.length) return false;
    const expected = solution.moves[solution.currentIndex];
    if (move !== expected) return false;
    facelet = applyMoveToFacelet(facelet, move);
    solution = { ...solution, currentIndex: solution.currentIndex + 1 };
    return true;
  };

  const faceletAfterMoves = (count: number) => {
    const cube = Cube.fromString(SCRAMBLED);
    for (let i = 0; i < count; i++) cube.move(moves[i]!);
    return cube.asString();
  };

  return { tryApply, getFacelet: () => facelet, getIndex: () => solution.currentIndex, faceletAfterMoves };
}

describe('solving facelet sync', () => {
  it('rejects applying the same move twice when the index has not advanced', () => {
    const moves = ['R', "U'", 'F'] as Move[];
    const session = createSolverSession(moves);

    expect(session.tryApply('R')).toBe(true);
    expect(session.tryApply('R')).toBe(false);
    expect(session.getIndex()).toBe(1);
    expect(session.getFacelet()).toBe(session.faceletAfterMoves(1));
  });

  it('advances facelet exactly once per accepted move in a burst', () => {
    const moves = ['R', "U'", 'F', 'D'] as Move[];
    const session = createSolverSession(moves);

    expect(session.tryApply('R')).toBe(true);
    expect(session.tryApply("U'")).toBe(true);
    expect(session.tryApply('F')).toBe(true);
    expect(session.getIndex()).toBe(3);
    expect(session.getFacelet()).toBe(session.faceletAfterMoves(3));
  });
});
