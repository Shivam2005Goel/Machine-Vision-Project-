import type { FaceId } from '../../types';

export const FACE_LAYER_NAMES: Record<FaceId, string> = {
  U: 'Top',
  D: 'Bottom',
  F: 'Front',
  B: 'Back',
  R: 'Right',
  L: 'Left',
};

export function getFaceLayerName(faceId: FaceId): string {
  return FACE_LAYER_NAMES[faceId];
}
