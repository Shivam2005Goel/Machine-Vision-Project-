import type { FaceId, Move } from '../../types';
import { getMoveHoldFace } from './moveGuidanceView';
import { moveFace } from './moves';
import { visibleFacesForSelfie } from './isometricGuide';

/**
 * How the user should hold the cube in front of a selfie camera.
 *
 * Real-world setup (matches the dashed scan square):
 * - Arms length, chest height, phone vertical
 * - Hold face square to the camera (fills the guide box)
 * - Tilt top slightly away so the top face (U) peeks above the front face
 * - Rotate corner so the side face (R or L) peeks out — never show the turning face flat
 */
export interface SelfieHoldPose {
  holdFace: FaceId;
  topFace: FaceId;
  sideFace: FaceId;
  turnLayer: FaceId;
  visibleFaces: FaceId[];
  /** Radians XYZ — applied to cube root; camera is fixed at +Z */
  euler: [number, number, number];
  holdLine: string;
}

/** Match perspective cube reference view (U + F + R corner). */
const PITCH = -0.52;
const YAW_F_R = (3 * Math.PI) / 4;
const YAW_F_L = (-3 * Math.PI) / 4;

function sideFaceFor(visible: FaceId[]): FaceId {
  return visible.find((f) => f !== 'F' && f !== 'U') ?? 'R';
}

function eulerForHold(holdFace: FaceId, sideFace: FaceId): [number, number, number] {
  if (holdFace === 'F') {
    return sideFace === 'L' ? [PITCH, YAW_F_L, 0] : [PITCH, YAW_F_R, 0];
  }
  if (holdFace === 'R') {
    return [PITCH, Math.PI / 2, 0];
  }
  if (holdFace === 'L') {
    return [PITCH, -Math.PI / 2, 0];
  }
  return [PITCH, YAW_F_R, 0];
}

export function getSelfieHoldPose(move: Move): SelfieHoldPose {
  const turnLayer = moveFace(move);
  const holdFace = getMoveHoldFace(move);
  const visibleFaces = visibleFacesForSelfie(holdFace, turnLayer);
  const sideFace = sideFaceFor(visibleFaces);

  const holdLine =
    holdFace === 'F'
      ? `Face ${holdFace} to camera · corner shows ${sideFace} on side, U on top`
      : `Face ${holdFace} to camera · corner shows F and U`;

  return {
    holdFace,
    topFace: 'U',
    sideFace,
    turnLayer,
    visibleFaces,
    euler: eulerForHold(holdFace, sideFace),
    holdLine,
  };
}
