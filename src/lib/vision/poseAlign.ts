import type { CubePose, FaceId, Point2D } from '../../types';
import { projectFaceCorners } from './projectFace';
import { getVisibleFaces } from './visibleFaces';

function quadEdgeLength(corners: [Point2D, Point2D, Point2D, Point2D]): number {
  const [tl, tr, br, bl] = corners;
  return (
    (Math.hypot(tr.x - tl.x, tr.y - tl.y) + Math.hypot(br.x - bl.x, br.y - bl.y)) / 2
  );
}

/**
 * PnP often places the unit cube too far away. Rescale translation so the
 * projected visible face matches the live-tracked corner quad size.
 */
export function alignPoseToTrackedQuad(
  pose: CubePose,
  frameWidth: number,
  frameHeight: number,
): CubePose {
  const candidates: FaceId[] = pose.visibleFace
    ? [pose.visibleFace, ...getVisibleFaces(pose).filter((f) => f !== pose.visibleFace)]
    : getVisibleFaces(pose);

  const detectedSize = quadEdgeLength(pose.corners);
  if (detectedSize < 8) return pose;

  for (const faceId of candidates) {
    const projected = projectFaceCorners(faceId, pose, frameWidth, frameHeight);
    if (!projected) continue;

    const projectedSize = quadEdgeLength(projected);
    if (projectedSize < 8) continue;

    const scale = detectedSize / projectedSize;
    if (scale < 0.25 || scale > 4) continue;

    const t = pose.translation;
    return {
      ...pose,
      visibleFace: faceId,
      translation: [t[0] / scale, t[1] / scale, t[2] / scale],
      size: pose.size * scale,
    };
  }

  return pose;
}

export function pickArrowCorners(
  pose: CubePose,
  moveFaceId: FaceId,
  frameWidth: number,
  frameHeight: number,
): [Point2D, Point2D, Point2D, Point2D] {
  if (pose.visibleFace === moveFaceId) {
    return pose.corners;
  }
  const aligned = alignPoseToTrackedQuad(pose, frameWidth, frameHeight);
  const projected = projectFaceCorners(moveFaceId, aligned, frameWidth, frameHeight);
  if (projected) return projected;
  return pose.corners;
}
