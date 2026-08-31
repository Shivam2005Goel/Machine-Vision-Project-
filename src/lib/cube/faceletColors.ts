import type { FaceId, StickerColor } from '../../types';

const FACELET_ORDER: FaceId[] = ['U', 'R', 'F', 'D', 'L', 'B'];

const FACE_TO_STICKER: Record<FaceId, StickerColor> = {
  U: 'W',
  D: 'Y',
  R: 'R',
  L: 'O',
  F: 'G',
  B: 'B',
};

const LETTER_TO_STICKER: Record<string, StickerColor> = {
  U: 'W',
  D: 'Y',
  R: 'R',
  L: 'O',
  F: 'G',
  B: 'B',
};

const BLACK: StickerColor | null = null;

export type CubieCoords = { x: number; y: number; z: number };

export interface CubieStickers {
  coords: CubieCoords;
  /** +x, -x, +y, -y, +z, -z — null = hidden inner face */
  faces: [StickerColor | null, StickerColor | null, StickerColor | null, StickerColor | null, StickerColor | null, StickerColor | null];
}

function faceletFaces(facelet: string): Record<FaceId, string[]> {
  if (facelet.length !== 54) {
    throw new Error(`Invalid facelet length: ${facelet.length}`);
  }
  const faces = {} as Record<FaceId, string[]>;
  for (let i = 0; i < 6; i++) {
    const id = FACELET_ORDER[i]!;
    faces[id] = facelet.slice(i * 9, i * 9 + 9).split('');
  }
  return faces;
}

function stickerAt(faces: Record<FaceId, string[]>, faceId: FaceId, index: number): StickerColor | null {
  const letter = faces[faceId][index];
  if (!letter) return null;
  return LETTER_TO_STICKER[letter] ?? null;
}

/*
 * Standard Singmaster/Kociemba facelet orientation for each face,
 * viewed from OUTSIDE the cube:
 *   U: row 0 touches B (z=-1), col 0 at L (x=-1)
 *   D: row 0 touches F (z=+1), col 0 at L (x=-1)
 *   R: row 0 touches U (y=+1), col 0 at F (z=+1)
 *   L: row 0 touches U (y=+1), col 0 at B (z=-1)
 */
function indexU(x: number, z: number): number {
  const row = z + 1;
  const col = x + 1;
  return row * 3 + col;
}

function indexD(x: number, z: number): number {
  const row = -z + 1;
  const col = x + 1;
  return row * 3 + col;
}

function indexR(y: number, z: number): number {
  const row = -y + 1;
  const col = -z + 1;
  return row * 3 + col;
}

function indexL(y: number, z: number): number {
  const row = -y + 1;
  const col = z + 1;
  return row * 3 + col;
}

function indexF(y: number, x: number): number {
  const row = (-y + 1) / 1;
  const col = (x + 1) / 1;
  return row * 3 + col;
}

function indexB(y: number, x: number): number {
  const row = (-y + 1) / 1;
  const col = (-x + 1) / 1;
  return row * 3 + col;
}

/** Build 26 visible cubies from a 54-char cubejs facelet string. */
export function cubiesFromFacelet(facelet: string): CubieStickers[] {
  const faces = faceletFaces(facelet);
  const cubies: CubieStickers[] = [];

  for (const x of [-1, 0, 1]) {
    for (const y of [-1, 0, 1]) {
      for (const z of [-1, 0, 1]) {
        if (x === 0 && y === 0 && z === 0) continue;

        const px = x === 1 ? stickerAt(faces, 'R', indexR(y, z)) : BLACK;
        const nx = x === -1 ? stickerAt(faces, 'L', indexL(y, z)) : BLACK;
        const py = y === 1 ? stickerAt(faces, 'U', indexU(x, z)) : BLACK;
        const ny = y === -1 ? stickerAt(faces, 'D', indexD(x, z)) : BLACK;
        const pz = z === 1 ? stickerAt(faces, 'F', indexF(y, x)) : BLACK;
        const nz = z === -1 ? stickerAt(faces, 'B', indexB(y, x)) : BLACK;

        cubies.push({
          coords: { x, y, z },
          faces: [px, nx, py, ny, pz, nz],
        });
      }
    }
  }

  return cubies;
}

export const STICKER_HEX: Record<StickerColor, number> = {
  W: 0xf4f4f4,
  Y: 0xffd500,
  R: 0xc41e3a,
  O: 0xff6d00,
  G: 0x00a651,
  B: 0x0046ad,
};

export const CUBIE_BODY_HEX = 0x141414;

export function solvedFacelet(): string {
  let result = '';
  for (const faceId of FACELET_ORDER) {
    const letter = FACE_TO_STICKER[faceId];
    const faceLetter = Object.entries(LETTER_TO_STICKER).find(([, s]) => s === letter)?.[0] ?? 'U';
    result += faceLetter.repeat(9);
  }
  return result;
}
