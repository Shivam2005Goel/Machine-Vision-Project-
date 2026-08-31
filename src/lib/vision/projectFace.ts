import type { CubePose, FaceId, Point2D } from '../../types';
import { FACE_MODEL_CORNERS } from './faceModels';
import { getCameraIntrinsics } from './poseTracker';

function projectPoint(
  point: [number, number, number],
  rotation: number[],
  translation: [number, number, number],
  fx: number,
  fy: number,
  cx: number,
  cy: number,
): Point2D | null {
  const x =
    rotation[0]! * point[0]! +
    rotation[1]! * point[1]! +
    rotation[2]! * point[2]! +
    translation[0]!;
  const y =
    rotation[3]! * point[0]! +
    rotation[4]! * point[1]! +
    rotation[5]! * point[2]! +
    translation[1]!;
  const z =
    rotation[6]! * point[0]! +
    rotation[7]! * point[1]! +
    rotation[8]! * point[2]! +
    translation[2]!;
  if (z < 0.02) return null;
  return { x: (fx * x) / z + cx, y: (fy * y) / z + cy };
}

export function projectCubePoint(
  point: [number, number, number],
  pose: CubePose,
  frameWidth: number,
  frameHeight: number,
): Point2D | null {
  const { fx, fy, cx, cy } = getCameraIntrinsics(frameWidth, frameHeight);
  const camFx = pose.cameraFx ?? fx;
  const camFy = pose.cameraFy ?? fy;
  const camCx = pose.cameraCx ?? cx;
  const camCy = pose.cameraCy ?? cy;
  return projectPoint(point, pose.rotationMatrix, pose.translation, camFx, camFy, camCx, camCy);
}

/** Project a cube face quad into camera frame coordinates (TL, TR, BR, BL). */
export function projectFaceCorners(
  faceId: FaceId,
  pose: CubePose,
  frameWidth: number,
  frameHeight: number,
): [Point2D, Point2D, Point2D, Point2D] | null {
  const model = FACE_MODEL_CORNERS[faceId];
  const { fx, fy, cx, cy } = getCameraIntrinsics(frameWidth, frameHeight);
  const camFx = pose.cameraFx ?? fx;
  const camFy = pose.cameraFy ?? fy;
  const camCx = pose.cameraCx ?? cx;
  const camCy = pose.cameraCy ?? cy;

  const projected: Point2D[] = [];
  for (const point of model) {
    const p = projectPoint(point, pose.rotationMatrix, pose.translation, camFx, camFy, camCx, camCy);
    if (!p) return null;
    if (p.x < -40 || p.y < -40 || p.x > frameWidth + 40 || p.y > frameHeight + 40) {
      return null;
    }
    projected.push(p);
  }

  return projected as [Point2D, Point2D, Point2D, Point2D];
}
