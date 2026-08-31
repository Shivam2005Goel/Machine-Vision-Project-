import type { FaceId, Move } from '../../types';

/** Face normal in cube-local space (unit cube centered at origin, size 1) */
export const FACE_NORMALS: Record<FaceId, [number, number, number]> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
  R: [1, 0, 0],
  L: [-1, 0, 0],
};

/** Rotation axis for each face move (right-hand rule) */
export const MOVE_AXES: Record<FaceId, [number, number, number]> = {
  R: [1, 0, 0],
  L: [1, 0, 0],
  U: [0, 1, 0],
  D: [0, 1, 0],
  F: [0, 0, 1],
  B: [0, 0, 1],
};

/** Signed rotation angle in radians for each move */
export function moveAngle(move: Move): number {
  if (move.endsWith('2')) return Math.PI;
  if (move.endsWith("'")) return -Math.PI / 2;
  return Math.PI / 2;
}

export function moveFace(move: Move): FaceId {
  return move.replace("'", '').replace('2', '') as FaceId;
}

export function isPrimeMove(move: Move): boolean {
  return move.endsWith("'") && !move.endsWith('2');
}

export function isDoubleMove(move: Move): boolean {
  return move.endsWith('2');
}

/** Undo a move on the cube (R ↔ R', R2 ↔ R2). */
export function inverseMove(move: Move): Move {
  if (isDoubleMove(move)) return move;
  if (isPrimeMove(move)) return moveFace(move);
  return `${moveFace(move)}'` as Move;
}

/** Signed rotation axis matching RotationDetector / cubejs notation. */
export function getMoveAxis(move: Move): [number, number, number] {
  const face = moveFace(move);
  let axis: [number, number, number] = [...MOVE_AXES[face]];
  if (face === 'L' || face === 'D' || face === 'B') {
    axis = [-axis[0], -axis[1], -axis[2]];
  }
  return axis;
}

export function parseMoves(algorithm: string): Move[] {
  return algorithm
    .trim()
    .split(/\s+/)
    .filter(Boolean) as Move[];
}
