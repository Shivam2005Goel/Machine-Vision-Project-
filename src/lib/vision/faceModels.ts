import type { FaceId } from '../../types';

const H = 0.5;

/** TL, TR, BR, BL in image space — camera looks along face outward normal. */
export const FACE_MODEL_CORNERS: Record<FaceId, [number, number, number][]> = {
  F: [
    [-H, H, H],
    [H, H, H],
    [H, -H, H],
    [-H, -H, H],
  ],
  B: [
    [H, H, -H],
    [-H, H, -H],
    [-H, -H, -H],
    [H, -H, -H],
  ],
  R: [
    [H, H, H],
    [H, H, -H],
    [H, -H, -H],
    [H, -H, H],
  ],
  L: [
    [-H, H, -H],
    [-H, H, H],
    [-H, -H, H],
    [-H, -H, -H],
  ],
  U: [
    [-H, H, -H],
    [H, H, -H],
    [H, H, H],
    [-H, H, H],
  ],
  D: [
    [-H, -H, H],
    [H, -H, H],
    [H, -H, -H],
    [-H, -H, -H],
  ],
};

export const ALL_FACE_IDS: FaceId[] = ['U', 'R', 'F', 'D', 'L', 'B'];

/** 8 cube vertices in URFDLB-style coords (y up, z forward, x right). */
export const CUBE_VERTICES: [number, number, number][] = [
  [-H, H, H],
  [H, H, H],
  [H, H, -H],
  [-H, H, -H],
  [-H, -H, H],
  [H, -H, H],
  [H, -H, -H],
  [-H, -H, -H],
];

/** 12 edges as vertex index pairs. */
export const CUBE_EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

export function rotateCornerOrder<T>(items: [T, T, T, T], quarterTurns: number): [T, T, T, T] {
  const steps = ((quarterTurns % 4) + 4) % 4;
  if (steps === 0) return items;
  if (steps === 1) return [items[3]!, items[0]!, items[1]!, items[2]!];
  if (steps === 2) return [items[2]!, items[3]!, items[0]!, items[1]!];
  return [items[1]!, items[2]!, items[3]!, items[0]!];
}
