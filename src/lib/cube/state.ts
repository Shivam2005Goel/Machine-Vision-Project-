import type { FaceId, ScannedFace, StickerColor } from '../../types';

/**
 * Build a 54-char cubejs facelet string from scanned faces.
 * Face order: U R F D L B (each face row-major, 9 stickers).
 */
export function buildFaceletString(faces: ScannedFace[]): string {
  const map = new Map<FaceId, StickerColor[]>();
  for (const f of faces) {
    map.set(f.faceId, f.colors);
  }
  return buildFaceletFromMap(map);
}

export function buildFaceletFromMap(map: Map<FaceId, StickerColor[]>): string {
  let result = '';

  for (const faceId of FACELET_ORDER) {
    const colors = map.get(faceId);
    if (!colors || colors.length !== 9) {
      throw new Error(`Missing face data for ${faceId}`);
    }
    for (const c of colors) {
      result += stickerToFaceLetter(c);
    }
  }

  return result;
}

export const FACELET_ORDER: FaceId[] = ['U', 'R', 'F', 'D', 'L', 'B'];

const STICKER_TO_FACE_LETTER: Record<StickerColor, FaceId> = {
  W: 'U',
  Y: 'D',
  R: 'R',
  O: 'L',
  G: 'F',
  B: 'B',
};

const FACE_LETTER_TO_STICKER: Record<FaceId, StickerColor> = {
  U: 'W',
  D: 'Y',
  R: 'R',
  L: 'O',
  F: 'G',
  B: 'B',
};

function stickerToFaceLetter(color: StickerColor): FaceId {
  return STICKER_TO_FACE_LETTER[color];
}

/** Inverse of buildFaceletFromMap — parse a 54-char facelet into per-face color grids. */
export function faceletToFaceMap(facelet: string): Map<FaceId, StickerColor[]> {
  if (facelet.length !== 54) {
    throw new Error(`Invalid facelet length: ${facelet.length}`);
  }

  const result = new Map<FaceId, StickerColor[]>();
  for (let faceIndex = 0; faceIndex < FACELET_ORDER.length; faceIndex++) {
    const faceId = FACELET_ORDER[faceIndex]!;
    const start = faceIndex * 9;
    const colors: StickerColor[] = [];
    for (let i = 0; i < 9; i++) {
      const letter = facelet[start + i] as FaceId;
      const sticker = FACE_LETTER_TO_STICKER[letter];
      if (!sticker) {
        throw new Error(`Unknown face letter: ${letter}`);
      }
      colors.push(sticker);
    }
    result.set(faceId, colors);
  }
  return result;
}

/** Apply a move to internal orientation tracking (3x3 rotation matrix, row-major) */
export function multiplyMatrices(a: number[], b: number[]): number[] {
  const out = new Array(9).fill(0);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) {
        sum += a[row * 3 + k]! * b[k * 3 + col]!;
      }
      out[row * 3 + col] = sum;
    }
  }
  return out;
}

export function identityMatrix(): number[] {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

export function rotationMatrixFromAxisAngle(
  axis: [number, number, number],
  angle: number,
): number[] {
  const [x, y, z] = axis;
  const len = Math.hypot(x, y, z) || 1;
  const ux = x / len;
  const uy = y / len;
  const uz = z / len;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;

  return [
    t * ux * ux + c,
    t * ux * uy - s * uz,
    t * ux * uz + s * uy,
    t * ux * uy + s * uz,
    t * uy * uy + c,
    t * uy * uz - s * ux,
    t * ux * uz - s * uy,
    t * uy * uz + s * ux,
    t * uz * uz + c,
  ];
}
