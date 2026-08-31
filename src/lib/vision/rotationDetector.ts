import type { Move } from '../../types';
import { getMoveAxis, moveAngle } from '../cube/moves';
import { identityMatrix, multiplyMatrices, rotationMatrixFromAxisAngle } from '../cube/state';

const ROTATION_THRESHOLD = 0.9;
const STABLE_FRAMES = 12;
const WRONG_MOVE_STABLE_FRAMES = 10;
const MIN_IDLE_ANGLE = 0.28;
const MIN_COMPLETE_ANGLE_RATIO = 0.82;
const MIN_COMPLETE_PROGRESS = 0.8;

const ALL_MOVES: Move[] = [
  'R',
  "R'",
  'R2',
  'L',
  "L'",
  'L2',
  'U',
  "U'",
  'U2',
  'D',
  "D'",
  'D2',
  'F',
  "F'",
  'F2',
  'B',
  "B'",
  'B2',
];

interface TrackerState {
  lastMatrix: number[];
  stableCount: number;
  pendingMove: Move | null;
  wrongMove: Move | null;
  wrongStableCount: number;
}

export interface RotationUpdate {
  completedMove: Move | null;
  progress: number;
  wrongMove: Move | null;
}

export class RotationDetector {
  private state: TrackerState = {
    lastMatrix: identityMatrix(),
    stableCount: 0,
    pendingMove: null,
    wrongMove: null,
    wrongStableCount: 0,
  };

  private initialized = false;
  private expectedMove: Move | null = null;

  reset(): void {
    this.state = {
      lastMatrix: identityMatrix(),
      stableCount: 0,
      pendingMove: null,
      wrongMove: null,
      wrongStableCount: 0,
    };
    this.initialized = false;
    this.expectedMove = null;
  }

  setExpectedMove(move: Move | null): void {
    this.expectedMove = move;
    this.state.pendingMove = null;
    this.state.stableCount = 0;
    this.state.wrongMove = null;
    this.state.wrongStableCount = 0;
  }

  sync(rotationMatrix: number[]): void {
    this.state.lastMatrix = [...rotationMatrix];
    this.state.pendingMove = null;
    this.state.stableCount = 0;
    this.state.wrongMove = null;
    this.state.wrongStableCount = 0;
    this.initialized = true;
  }

  update(rotationMatrix: number[]): RotationUpdate {
    if (!this.initialized) {
      this.state.lastMatrix = [...rotationMatrix];
      this.initialized = true;
      return { completedMove: null, progress: 0, wrongMove: null };
    }

    const delta = multiplyMatrices(transpose3x3(rotationMatrix), this.state.lastMatrix);
    const deltaAngle = rotationMagnitude(delta);

    if (deltaAngle < MIN_IDLE_ANGLE) {
      this.state.pendingMove = null;
      this.state.stableCount = 0;
      this.state.wrongMove = null;
      this.state.wrongStableCount = 0;
      return { completedMove: null, progress: 0, wrongMove: null };
    }

    const progress = this.expectedMove
      ? computeProgressTowardMove(delta, this.expectedMove)
      : 0;

    const candidates = this.expectedMove ? [this.expectedMove] : ALL_MOVES;
    const move = matrixToMove(delta, candidates);

    if (move) {
      const axis = getMoveAxis(move);
      const turned = Math.abs(rotationAngleAboutAxis(delta, axis));
      const required = Math.abs(moveAngle(move)) * MIN_COMPLETE_ANGLE_RATIO;

      if (turned < required || progress < MIN_COMPLETE_PROGRESS) {
        this.state.pendingMove = null;
        this.state.stableCount = 0;
        return { completedMove: null, progress, wrongMove: null };
      }

      if (this.state.pendingMove === move) {
        this.state.stableCount++;
        if (this.state.stableCount >= STABLE_FRAMES) {
          this.state.lastMatrix = [...rotationMatrix];
          this.state.pendingMove = null;
          this.state.stableCount = 0;
          this.state.wrongMove = null;
          this.state.wrongStableCount = 0;
          return { completedMove: move, progress: 1, wrongMove: null };
        }
      } else {
        this.state.pendingMove = move;
        this.state.stableCount = 1;
      }
      this.state.wrongMove = null;
      this.state.wrongStableCount = 0;
    } else if (this.expectedMove) {
      const detected = matrixToMove(delta, ALL_MOVES);
      if (detected && detected !== this.expectedMove) {
        if (this.state.wrongMove === detected) {
          this.state.wrongStableCount++;
        } else {
          this.state.wrongMove = detected;
          this.state.wrongStableCount = 1;
        }
        if (this.state.wrongStableCount >= WRONG_MOVE_STABLE_FRAMES) {
          return {
            completedMove: null,
            progress,
            wrongMove: detected,
          };
        }
      } else {
        this.state.wrongMove = null;
        this.state.wrongStableCount = 0;
      }
      this.state.pendingMove = null;
      this.state.stableCount = 0;
    } else {
      this.state.pendingMove = null;
      this.state.stableCount = 0;
    }

    return { completedMove: null, progress, wrongMove: null };
  }
}

function rotationMagnitude(matrix: number[]): number {
  const trace = matrix[0]! + matrix[4]! + matrix[8]!;
  const cosAngle = Math.max(-1, Math.min(1, (trace - 1) / 2));
  return Math.acos(cosAngle);
}
function rotationAngleAboutAxis(matrix: number[], axis: [number, number, number]): number {
  const angle = rotationMagnitude(matrix);
  const sinAngle = Math.sin(angle);
  if (Math.abs(sinAngle) < 1e-5) return 0;

  const rotAxis = [
    (matrix[7]! - matrix[5]!) / (2 * sinAngle),
    (matrix[2]! - matrix[6]!) / (2 * sinAngle),
    (matrix[3]! - matrix[1]!) / (2 * sinAngle),
  ];
  const dot =
    rotAxis[0]! * axis[0]! + rotAxis[1]! * axis[1]! + rotAxis[2]! * axis[2]!;
  return dot * angle;
}

function computeProgressTowardMove(delta: number[], move: Move): number {
  const axis = getMoveAxis(move);
  const target = moveAngle(move);
  const actual = rotationAngleAboutAxis(delta, axis);
  if (Math.abs(target) < 1e-6) return 0;
  if (Math.sign(actual) !== Math.sign(target) && Math.abs(actual) > 0.15) {
    return 0;
  }
  return Math.min(1, Math.abs(actual) / Math.abs(target));
}

function transpose3x3(m: number[]): number[] {
  return [m[0]!, m[3]!, m[6]!, m[1]!, m[4]!, m[7]!, m[2]!, m[5]!, m[8]!];
}

function matrixToMove(delta: number[], candidates: Move[]): Move | null {
  let best: Move | null = null;
  let bestScore = ROTATION_THRESHOLD;

  for (const move of candidates) {
    const axis = getMoveAxis(move);
    const expected = rotationMatrixFromAxisAngle(axis, moveAngle(move));
    const score = matrixSimilarity(delta, expected);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }

  return best;
}

function matrixSimilarity(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += 1 - Math.abs(a[i]! - b[i]!) / 2;
  }
  return sum / 9;
}
