import type { CubePose, FaceId, Point2D } from '../../types';
import {
  ALL_FACE_IDS,
  FACE_MODEL_CORNERS,
  rotateCornerOrder,
} from './faceModels';

export function orderCorners(points: Point2D[]): [Point2D, Point2D, Point2D, Point2D] | null {
  if (points.length < 4) return null;

  const sorted = [...points].sort((a, b) => a.y - b.y);
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = sorted.slice(2, 4).sort((a, b) => a.x - b.x);

  return [top[0]!, top[1]!, bottom[1]!, bottom[0]!];
}

export function getCameraIntrinsics(frameWidth: number, frameHeight: number) {
  const fx = frameWidth * 0.9;
  const fy = frameWidth * 0.9;
  const cx = frameWidth / 2;
  const cy = frameHeight / 2;
  return { fx, fy, cx, cy };
}

export function estimatePoseFromCorners(
  corners: [Point2D, Point2D, Point2D, Point2D],
  frameWidth: number,
  frameHeight: number,
  hintFace: FaceId | null = null,
): CubePose {
  try {
    return estimatePoseMultiFace(corners, frameWidth, frameHeight, hintFace);
  } catch {
    return estimatePoseSimple(corners, frameWidth, frameHeight, hintFace);
  }
}

function estimatePoseSimple(
  corners: [Point2D, Point2D, Point2D, Point2D],
  frameWidth: number,
  _frameHeight: number,
  visibleFace: FaceId | null,
): CubePose {
  const center = {
    x: corners.reduce((s, p) => s + p.x, 0) / 4,
    y: corners.reduce((s, p) => s + p.y, 0) / 4,
  };
  const size =
    (Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y) +
      Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y)) /
    2;
  const { fx, fy, cx, cy } = getCameraIntrinsics(frameWidth, _frameHeight);

  return {
    corners,
    center,
    size,
    rotationMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    translation: [0, 0, size * 3],
    confidence: 0.55,
    visibleFace,
    cameraFx: fx,
    cameraFy: fy,
    cameraCx: cx,
    cameraCy: cy,
  };
}

function estimatePoseMultiFace(
  corners: [Point2D, Point2D, Point2D, Point2D],
  frameWidth: number,
  frameHeight: number,
  hintFace: FaceId | null,
): CubePose {
  const { fx, fy, cx, cy } = getCameraIntrinsics(frameWidth, frameHeight);

  const faceOrder = hintFace
    ? [hintFace, ...ALL_FACE_IDS.filter((f) => f !== hintFace)]
    : ALL_FACE_IDS;

  let bestPose: CubePose | null = null;
  let bestError = Infinity;

  for (const faceId of faceOrder) {
    const model = FACE_MODEL_CORNERS[faceId];
    for (let rot = 0; rot < 4; rot++) {
      const imageCorners = rotateCornerOrder(corners, rot);
      const pose = solvePnP(model, imageCorners, faceId, fx, fy, cx, cy);
      if (!pose) continue;

      const err = reprojectionError(model, pose, imageCorners, fx, fy, cx, cy);
      if (err < bestError) {
        bestError = err;
        bestPose = { ...pose, confidence: Math.max(0.5, 1 - err / 40) };
      }
    }
  }

  if (!bestPose) {
    return estimatePoseSimple(corners, frameWidth, frameHeight, hintFace);
  }

  return bestPose;
}

function solvePnP(
  model: [number, number, number][],
  corners: [Point2D, Point2D, Point2D, Point2D],
  visibleFace: FaceId,
  fx: number,
  fy: number,
  cx: number,
  cy: number,
): CubePose | null {
  const cv = window.cv;

  const objectPoints = cv.matFromArray(4, 1, cv.CV_32FC1, model.flat());
  const imagePoints = cv.matFromArray(4, 1, cv.CV_32FC1, [
    corners[0].x,
    corners[0].y,
    corners[1].x,
    corners[1].y,
    corners[2].x,
    corners[2].y,
    corners[3].x,
    corners[3].y,
  ]);
  const cameraMatrix = cv.matFromArray(3, 3, cv.CV_32FC1, [fx, 0, cx, 0, fy, cy, 0, 0, 1]);
  const distCoeffs = cv.matFromArray(4, 1, cv.CV_32FC1, [0, 0, 0, 0]);
  const rvec = new cv.Mat();
  const tvec = new cv.Mat();
  const rotMat = new cv.Mat();

  cv.solvePnP(objectPoints, imagePoints, cameraMatrix, distCoeffs, rvec, tvec);
  cv.Rodrigues(rvec, rotMat);

  const rotationMatrix: number[] = [];
  for (let i = 0; i < 9; i++) {
    rotationMatrix.push(rotMat.data32F[i] ?? rotMat.floatAt(Math.floor(i / 3), i % 3));
  }

  const translation: [number, number, number] = [
    tvec.data32F[0] ?? tvec.floatAt(0, 0),
    tvec.data32F[1] ?? tvec.floatAt(1, 0),
    tvec.data32F[2] ?? tvec.floatAt(2, 0),
  ];

  const center = {
    x: corners.reduce((s, p) => s + p.x, 0) / 4,
    y: corners.reduce((s, p) => s + p.y, 0) / 4,
  };
  const size =
    (Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y) +
      Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y)) /
    2;

  objectPoints.delete();
  imagePoints.delete();
  cameraMatrix.delete();
  distCoeffs.delete();
  rvec.delete();
  tvec.delete();
  rotMat.delete();

  return {
    corners,
    center,
    size,
    rotationMatrix,
    translation,
    confidence: 0.8,
    visibleFace,
    cameraFx: fx,
    cameraFy: fy,
    cameraCx: cx,
    cameraCy: cy,
  };
}

function reprojectionError(
  model: [number, number, number][],
  pose: CubePose,
  corners: [Point2D, Point2D, Point2D, Point2D],
  fx: number,
  fy: number,
  cx: number,
  cy: number,
): number {
  const r = pose.rotationMatrix;
  const t = pose.translation;
  let sum = 0;

  for (let i = 0; i < 4; i++) {
    const p = model[i]!;
    const x = r[0]! * p[0]! + r[1]! * p[1]! + r[2]! * p[2]! + t[0]!;
    const y = r[3]! * p[0]! + r[4]! * p[1]! + r[5]! * p[2]! + t[1]!;
    const z = r[6]! * p[0]! + r[7]! * p[1]! + r[8]! * p[2]! + t[2]!;
    if (z < 1e-4) return Infinity;
    const px = (fx * x) / z + cx;
    const py = (fy * y) / z + cy;
    sum += Math.hypot(px - corners[i]!.x, py - corners[i]!.y);
  }

  return sum / 4;
}

export function poseCenter(pose: CubePose): Point2D {
  return pose.center;
}
