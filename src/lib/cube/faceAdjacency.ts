import type { FaceId, StickerColor } from '../../types';
import { faceOrientationAtIndex } from './faceOrientation';

/** Shared edge between two faces in Singmaster layout (3 stickers each). */
export interface FaceEdgeStrip {
  faceA: FaceId;
  stripA: readonly [number, number, number];
  faceB: FaceId;
  stripB: readonly [number, number, number];
}

/** Twelve physical edges in cubejs URFDLB layout. */
export const FACE_EDGE_STRIPS: readonly FaceEdgeStrip[] = [
  { faceA: 'U', stripA: [2, 5, 8], faceB: 'R', stripB: [2, 1, 0] },
  { faceA: 'U', stripA: [8, 7, 6], faceB: 'F', stripB: [2, 1, 0] },
  { faceA: 'U', stripA: [6, 3, 0], faceB: 'L', stripB: [2, 1, 0] },
  { faceA: 'U', stripA: [0, 1, 2], faceB: 'B', stripB: [2, 1, 0] },
  { faceA: 'D', stripA: [2, 5, 8], faceB: 'R', stripB: [6, 7, 8] },
  { faceA: 'D', stripA: [0, 1, 2], faceB: 'F', stripB: [6, 7, 8] },
  { faceA: 'D', stripA: [6, 3, 0], faceB: 'L', stripB: [6, 7, 8] },
  { faceA: 'D', stripA: [8, 7, 6], faceB: 'B', stripB: [6, 7, 8] },
  { faceA: 'F', stripA: [2, 5, 8], faceB: 'R', stripB: [0, 3, 6] },
  { faceA: 'F', stripA: [6, 3, 0], faceB: 'L', stripB: [8, 5, 2] },
  { faceA: 'B', stripA: [2, 5, 8], faceB: 'L', stripB: [0, 3, 6] },
  { faceA: 'B', stripA: [6, 3, 0], faceB: 'R', stripB: [8, 5, 2] },
] as const;

/** Eight corner cubies in cubejs URFDLB layout. */
export const FACE_CORNERS = [
  { faceA: 'U' as const, iA: 8, faceB: 'R' as const, iB: 0, faceC: 'F' as const, iC: 2 },
  { faceA: 'U' as const, iA: 6, faceB: 'F' as const, iB: 0, faceC: 'L' as const, iC: 2 },
  { faceA: 'U' as const, iA: 0, faceB: 'L' as const, iB: 0, faceC: 'B' as const, iC: 2 },
  { faceA: 'U' as const, iA: 2, faceB: 'B' as const, iB: 0, faceC: 'R' as const, iC: 2 },
  { faceA: 'D' as const, iA: 2, faceB: 'F' as const, iB: 8, faceC: 'R' as const, iC: 6 },
  { faceA: 'D' as const, iA: 0, faceB: 'L' as const, iB: 8, faceC: 'F' as const, iC: 6 },
  { faceA: 'D' as const, iA: 6, faceB: 'B' as const, iB: 8, faceC: 'L' as const, iC: 6 },
  { faceA: 'D' as const, iA: 8, faceB: 'R' as const, iB: 8, faceC: 'B' as const, iC: 6 },
] as const;

export const MAX_EDGE_AGREEMENT = FACE_EDGE_STRIPS.length * 3;
export const MAX_CORNER_AGREEMENT = FACE_CORNERS.length;

const CORNER_FACE_TRIPLES: ReadonlyArray<readonly [FaceId, FaceId, FaceId]> = [
  ['U', 'R', 'F'],
  ['U', 'F', 'L'],
  ['U', 'L', 'B'],
  ['U', 'B', 'R'],
  ['D', 'F', 'R'],
  ['D', 'L', 'F'],
  ['D', 'B', 'L'],
  ['D', 'R', 'B'],
];

const STICKER_TO_FACE: Record<StickerColor, FaceId> = {
  W: 'U',
  Y: 'D',
  R: 'R',
  O: 'L',
  G: 'F',
  B: 'B',
};

const VALID_EDGE_PAIRS = new Set([
  'UR', 'RU', 'UF', 'FU', 'UL', 'LU', 'UB', 'BU',
  'DR', 'RD', 'DF', 'FD', 'DL', 'LD', 'DB', 'BD',
  'FR', 'RF', 'FL', 'LF', 'BL', 'LB', 'BR', 'RB',
]);

function isValidEdgePair(a: StickerColor, b: StickerColor): boolean {
  const letterA = STICKER_TO_FACE[a];
  const letterB = STICKER_TO_FACE[b];
  return VALID_EDGE_PAIRS.has(`${letterA}${letterB}`);
}

function isValidCornerTriple(a: StickerColor, b: StickerColor, c: StickerColor): boolean {
  const letters = [STICKER_TO_FACE[a], STICKER_TO_FACE[b], STICKER_TO_FACE[c]];
  for (const triple of CORNER_FACE_TRIPLES) {
    for (let ori = 0; ori < 3; ori++) {
      if (
        letters[0] === triple[ori % 3] &&
        letters[1] === triple[(ori + 1) % 3] &&
        letters[2] === triple[(ori + 2) % 3]
      ) {
        return true;
      }
    }
  }
  return false;
}

const FACE_ORDER: FaceId[] = ['U', 'R', 'F', 'D', 'L', 'B'];

function faceIndex(faceId: FaceId): number {
  return FACE_ORDER.indexOf(faceId);
}

/**
 * How many shared-edge stickers on raw scans form valid physical edge pairs
 * after applying per-face rotation indices (0–36).
 */
export function rawEdgeAgreementScore(
  rawFaces: Map<FaceId, StickerColor[]>,
  rotationIndices: readonly number[],
): number {
  let score = 0;

  for (const { faceA, stripA, faceB, stripB } of FACE_EDGE_STRIPS) {
    const orientedA = faceOrientationAtIndex(rawFaces.get(faceA)!, rotationIndices[faceIndex(faceA)]!);
    const orientedB = faceOrientationAtIndex(rawFaces.get(faceB)!, rotationIndices[faceIndex(faceB)]!);

    for (let i = 0; i < 3; i++) {
      if (isValidEdgePair(orientedA[stripA[i]!]!, orientedB[stripB[i]!]!)) {
        score++;
      }
    }
  }

  return score;
}

/** How many corners on raw scans form valid physical corner triples (0–8). */
export function rawCornerAgreementScore(
  rawFaces: Map<FaceId, StickerColor[]>,
  rotationIndices: readonly number[],
): number {
  let score = 0;

  for (const { faceA, iA, faceB, iB, faceC, iC } of FACE_CORNERS) {
    const a = faceOrientationAtIndex(rawFaces.get(faceA)!, rotationIndices[faceIndex(faceA)]!)[iA]!;
    const b = faceOrientationAtIndex(rawFaces.get(faceB)!, rotationIndices[faceIndex(faceB)]!)[iB]!;
    const c = faceOrientationAtIndex(rawFaces.get(faceC)!, rotationIndices[faceIndex(faceC)]!)[iC]!;
    if (isValidCornerTriple(a, b, c)) score++;
  }

  return score;
}
