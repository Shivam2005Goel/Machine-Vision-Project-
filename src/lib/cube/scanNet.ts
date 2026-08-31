import type { FaceId } from '../../types';
import { CALIBRATION_ORDER, getFaceNumber } from './colors';

/** Faces not yet captured — scan order does not matter. */
export function getMissingScanFaces(scanned: Iterable<FaceId>): FaceId[] {
  const done = new Set(scanned);
  return CALIBRATION_ORDER.filter((faceId) => !done.has(faceId));
}

/** @deprecated Palette display order only; scanning no longer follows this sequence. */
export function getNextScanFace(scanned: Iterable<FaceId>): FaceId | null {
  return getMissingScanFaces(scanned)[0] ?? null;
}

export function getScanStepHint(faceId: FaceId): string {
  return `${getFaceNumber(faceId)} of 6`;
}

/** @deprecated Use getScanStepHint */
export function getNetScanHint(faceId: FaceId): string {
  return getScanStepHint(faceId);
}
