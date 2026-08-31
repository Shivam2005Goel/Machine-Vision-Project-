import type { FaceId, Move, StickerColor } from '../../types';
import {
  createMoveColorTrackerState,
  detectDominantLayerMove,
  type MoveColorTrackerState,
} from './moveColorProgress';

/**
 * After a layer-turn shape break, detect if colors match a different move on the same face.
 */
export function detectWrongMoveFromColors(
  facelet: string,
  expected: Move,
  visibleFaceColors: Partial<Record<FaceId, StickerColor[]>>,
  primaryFace: FaceId | null,
  shapeValidated: boolean,
  tracker: MoveColorTrackerState = createMoveColorTrackerState(),
): Move | null {
  if (!shapeValidated || !facelet) return null;
  return detectDominantLayerMove(facelet, expected, visibleFaceColors, primaryFace, tracker);
}

export { detectDominantLayerMove, type MoveColorTrackerState };
