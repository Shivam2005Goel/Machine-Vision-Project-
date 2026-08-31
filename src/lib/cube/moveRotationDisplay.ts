import type { Move } from '../../types';
import { isDoubleMove, isPrimeMove, moveFace } from './moves';

export interface MoveRotationDisplay {
  symbol: string;
  direction: string;
  turns: string;
  face: string;
}

function mirrorMoveForSelfie(move: Move): Move {
  if (isDoubleMove(move)) return move;
  const face = moveFace(move);
  return isPrimeMove(move) ? (face as Move) : (`${face}'` as Move);
}

/** Quarter-turn count the user should perform (1 for 90°, 2 for 180°). */
export function getMoveTurnCount(move: Move): 1 | 2 {
  return isDoubleMove(move) ? 2 : 1;
}

export function getMoveTurnCountLabel(move: Move): string {
  return getMoveTurnCount(move) === 2 ? '2 turns' : '1 turn';
}

/** User-facing rotation angle for solve guide (quarter vs half turn). */
export function getMoveAngleLabel(move: Move): '90°' | '180°' {
  return isDoubleMove(move) ? '180°' : '90°';
}

/** Move notation adjusted for selfie camera preview (matches on-screen arrow). */
export function getSelfieDisplayMove(move: Move): Move {
  return mirrorMoveForSelfie(move);
}

/** Selfie-mirrored rotation hint for the on-screen guide. */
export function getMoveRotationDisplay(move: Move, selfieMirror = true): MoveRotationDisplay {
  const effective = selfieMirror ? mirrorMoveForSelfie(move) : move;
  const face = moveFace(move);

  if (isDoubleMove(effective)) {
    return {
      symbol: '180°',
      direction: 'Half turn',
      turns: getMoveTurnCountLabel(move),
      face,
    };
  }

  const clockwise = !isPrimeMove(effective);
  return {
    symbol: clockwise ? '↻' : '↺',
    direction: clockwise ? 'Clockwise' : 'Counter-clockwise',
    turns: getMoveTurnCountLabel(move),
    face,
  };
}
