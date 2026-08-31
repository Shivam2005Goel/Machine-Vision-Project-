import type { FaceId, ReadColor } from '../types';
import { CALIBRATION_ORDER, FACE_COLOR_NAME, getFaceCenterColor } from '../lib/cube/colors';
import { getMissingScanFaces } from '../lib/cube/scanNet';
import { FaceGridMini } from './FaceGridMini';

/** @deprecated Use FACE_COLOR_NAME from colors.ts */
export const FACE_CENTER_LABEL: Record<FaceId, string> = FACE_COLOR_NAME;

interface ScannedFacesBarProps {
  visible: boolean;
  scannedFaces: Partial<Record<FaceId, ReadColor[]>>;
  onRescanFace?: (faceId: FaceId) => void;
  rescanTargetFace?: FaceId | null;
  interactive?: boolean;
}

export function ScannedFacesBar({
  visible,
  scannedFaces,
  onRescanFace,
  rescanTargetFace = null,
  interactive = false,
}: ScannedFacesBarProps) {
  if (!visible) return null;

  const scannedIds = Object.keys(scannedFaces).filter(
    (id) => scannedFaces[id as FaceId],
  ) as FaceId[];
  const scannedCount = scannedIds.length;
  const missingFaces = new Set(getMissingScanFaces(scannedIds));

  return (
    <div
      className={`scanned-faces-bar${interactive ? ' scanned-faces-bar--interactive' : ''}`}
      aria-live="polite"
    >
      <p className="scanned-faces-bar-title">Scan {scannedCount}/6</p>
      <div className="scanned-faces-bar-grid" aria-label="Scan progress">
        {CALIBRATION_ORDER.map((faceId) => (
          <FaceGridMini
            key={faceId}
            faceId={faceId}
            colors={scannedFaces[faceId] ?? null}
            centerColor={scannedFaces[faceId] ? undefined : getFaceCenterColor(faceId)}
            empty={!scannedFaces[faceId]}
            onClick={onRescanFace}
            selected={rescanTargetFace === faceId}
            highlightNext={
              interactive &&
              !scannedFaces[faceId] &&
              (rescanTargetFace === faceId || (!rescanTargetFace && missingFaces.has(faceId)))
            }
            clickable={interactive}
          />
        ))}
      </div>
    </div>
  );
}
