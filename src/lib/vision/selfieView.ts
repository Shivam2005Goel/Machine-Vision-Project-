import type { FaceId, ReadColor, StickerColor } from '../../types';

export const SELFIE_CAMERA_MODE = true;

/** Raw camera pixels — never flip the canvas. */
export function drawCameraFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
): void {
  ctx.drawImage(video, 0, 0, width, height);
}

/** Mirror a 3×3 face grid left-right (camera frame → selfie preview). */
export function mirrorFaceCellsHorizontally(colors: StickerColor[]): StickerColor[];
export function mirrorFaceCellsHorizontally(colors: ReadColor[]): ReadColor[];
export function mirrorFaceCellsHorizontally(colors: ReadColor[]): ReadColor[] {
  if (colors.length !== 9) return colors;

  const mirrored: ReadColor[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 2; col >= 0; col--) {
      mirrored.push(colors[row * 3 + col]!);
    }
  }
  return mirrored;
}

export function cloneFaceColorsMap(
  faces: Map<FaceId, ReadColor[]>,
): Map<FaceId, ReadColor[]> {
  const copy = new Map<FaceId, ReadColor[]>();
  for (const [faceId, colors] of faces) {
    copy.set(faceId, [...colors]);
  }
  return copy;
}
