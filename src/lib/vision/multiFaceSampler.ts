import type { CubePose, FaceId, StickerColor } from '../../types';
import { alignPoseToTrackedQuad } from './poseAlign';
import { projectFaceCorners } from './projectFace';
import { sampleColorsFromQuad } from './quadColorSampler';
import { getVisibleFaces } from './visibleFaces';
import { toStickerColors } from './readColorUtils';

export function sampleVisibleFaceColors(
  sourceCanvas: HTMLCanvasElement,
  pose: CubePose,
  frameWidth: number,
  frameHeight: number,
): Partial<Record<FaceId, StickerColor[]>> {
  const result: Partial<Record<FaceId, StickerColor[]>> = {};
  const aligned = alignPoseToTrackedQuad(pose, frameWidth, frameHeight);
  const visible = getVisibleFaces(aligned);

  for (const faceId of visible) {
    const corners = projectFaceCorners(faceId, aligned, frameWidth, frameHeight);
    if (!corners) continue;
    const colors = sampleColorsFromQuad(sourceCanvas, frameWidth, frameHeight, corners);
    if (colors?.length === 9) {
      result[faceId] = toStickerColors(colors);
    }
  }

  return result;
}
