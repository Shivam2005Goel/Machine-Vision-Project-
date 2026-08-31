import type { FaceId, StickerColor } from '../../types';

/** Palette / display order for the 6 face colours (not a required scan sequence). */
export const CALIBRATION_ORDER: FaceId[] = ['U', 'R', 'D', 'L', 'F', 'B'];

export const ALL_FACES: FaceId[] = ['U', 'R', 'D', 'L', 'F', 'B'];

/** 표준 큐브: 가운데 스티커 색으로 물리 면 식별 */
const CENTER_COLOR_TO_FACE: Record<StickerColor, FaceId> = {
  W: 'U',
  Y: 'D',
  R: 'R',
  O: 'L',
  G: 'F',
  B: 'B',
};

const FACE_CENTER_COLOR: Record<FaceId, StickerColor> = {
  U: 'W',
  D: 'Y',
  F: 'G',
  R: 'R',
  L: 'O',
  B: 'B',
};

export function identifyFaceFromCenter(center: StickerColor): FaceId | null {
  return CENTER_COLOR_TO_FACE[center] ?? null;
}

export function getFaceCenterColor(faceId: FaceId): StickerColor {
  return FACE_CENTER_COLOR[faceId];
}

export const FACE_COLOR_NAME: Record<FaceId, string> = {
  U: 'white',
  R: 'red',
  D: 'yellow',
  L: 'orange',
  F: 'green',
  B: 'blue',
};

const FACE_NUMBER: Record<FaceId, number> = {
  U: 1,
  R: 2,
  D: 3,
  L: 4,
  F: 5,
  B: 6,
};

export function getFaceNumber(faceId: FaceId): number {
  return FACE_NUMBER[faceId];
}

export function getFaceLabel(faceId: FaceId): string {
  return `Face ${FACE_NUMBER[faceId]}`;
}

export function getFaceScanHint(faceId: FaceId): string {
  const n = FACE_NUMBER[faceId];
  const color = FACE_COLOR_NAME[faceId];
  return `Face ${n} — scan ${color} center`;
}

export const FACE_LABELS: Record<FaceId, string> = {
  U: 'Face 1',
  R: 'Face 2',
  D: 'Face 3',
  L: 'Face 4',
  F: 'Face 5',
  B: 'Face 6',
};
