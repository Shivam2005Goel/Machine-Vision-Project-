import * as THREE from 'three';
import type { CubePose } from '../../types';

/**
 * Convert OpenCV solvePnP extrinsics to a Three.js object matrix.
 * OpenCV: x right, y down, z forward. Three: x right, y up, z toward viewer.
 */
export function poseToThreeMatrix(pose: CubePose): THREE.Matrix4 {
  const r = pose.rotationMatrix;
  const t = pose.translation;

  const extrinsic = new THREE.Matrix4().set(
    r[0]!, r[1]!, r[2]!, t[0]!,
    r[3]!, r[4]!, r[5]!, t[1]!,
    r[6]!, r[7]!, r[8]!, t[2]!,
    0, 0, 0, 1,
  );

  const cvToThree = new THREE.Matrix4().set(
    1, 0, 0, 0,
    0, -1, 0, 0,
    0, 0, -1, 0,
    0, 0, 0, 1,
  );

  const view = new THREE.Matrix4().multiplyMatrices(cvToThree, extrinsic);
  return view.invert();
}

export function configureCameraFromIntrinsics(
  camera: THREE.PerspectiveCamera,
  pose: CubePose,
  frameWidth: number,
  frameHeight: number,
): void {
  const fy = pose.cameraFy || frameWidth * 0.9;
  const fovRad = 2 * Math.atan(frameHeight / (2 * fy));
  camera.fov = (fovRad * 180) / Math.PI;
  camera.aspect = frameWidth / frameHeight;
  camera.near = 0.01;
  camera.far = 100;
  camera.position.set(0, 0, 0);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, -1);
  camera.updateProjectionMatrix();
}
