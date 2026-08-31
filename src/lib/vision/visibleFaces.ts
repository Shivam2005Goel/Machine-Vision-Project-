import type { CubePose, FaceId } from '../../types';
import { FACE_NORMALS } from '../cube/moves';
import { ALL_FACE_IDS } from './faceModels';

const FACE_OFFSET = 0.51;

function faceCenter(faceId: FaceId): [number, number, number] {
  const n = FACE_NORMALS[faceId];
  return [n[0] * FACE_OFFSET, n[1] * FACE_OFFSET, n[2] * FACE_OFFSET];
}

/** Up to three faces oriented toward the camera (typical corner view). */
export function getVisibleFaces(pose: CubePose, maxFaces = 3): FaceId[] {
  const r = pose.rotationMatrix;
  const t = pose.translation;
  const scored: { id: FaceId; score: number }[] = [];

  for (const id of ALL_FACE_IDS) {
    const c = faceCenter(id);
    const z = r[2]! * c[0]! + r[5]! * c[1]! + r[8]! * c[2]! + t[2]!;
    const n = FACE_NORMALS[id];
    const nz = r[6]! * n[0]! + r[7]! * n[1]! + r[8]! * n[2]!;
    if (z > 0.02 && nz < -0.12) {
      scored.push({ id, score: z * -nz });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFaces)
    .map((entry) => entry.id);
}
