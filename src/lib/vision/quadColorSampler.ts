import type { Point2D, ReadColor } from '../../types';
import { classifyFaceRelative, classifySticker, refineFaceReads } from './colorClassifier';
import { isColorsCalibrated } from './colorReference';
import { prepareMediansForClassification } from './scanWhiteCalibration';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPoint(a: Point2D, b: Point2D, t: number): Point2D {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function bilinearOnQuad(
  tl: Point2D,
  tr: Point2D,
  br: Point2D,
  bl: Point2D,
  u: number,
  v: number,
): Point2D {
  const top = lerpPoint(tl, tr, u);
  const bottom = lerpPoint(bl, br, u);
  return lerpPoint(top, bottom, v);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function samplePatchRgb(
  data: Uint8ClampedArray,
  frameWidth: number,
  frameHeight: number,
  cx: number,
  cy: number,
  radius: number,
): [number, number, number] {
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(frameWidth, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(frameHeight, Math.ceil(cy + radius));

  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];

  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * frameWidth + x) * 4;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      if (Math.max(r, g, b) < 35) continue;
      rs.push(r);
      gs.push(g);
      bs.push(b);
    }
  }

  if (rs.length === 0) {
    const ix = Math.max(0, Math.min(frameWidth - 1, Math.floor(cx)));
    const iy = Math.max(0, Math.min(frameHeight - 1, Math.floor(cy)));
    const i = (iy * frameWidth + ix) * 4;
    return [data[i]!, data[i + 1]!, data[i + 2]!];
  }

  return [median(rs), median(gs), median(bs)];
}

/** Sample a 3×3 sticker grid from an arbitrary face quad in the camera frame. */
export function sampleColorsFromQuad(
  sourceCanvas: HTMLCanvasElement,
  frameWidth: number,
  frameHeight: number,
  corners: [Point2D, Point2D, Point2D, Point2D],
): ReadColor[] | null {
  const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const [tl, tr, br, bl] = corners;
  const edge = Math.min(
    Math.hypot(tr.x - tl.x, tr.y - tl.y),
    Math.hypot(bl.x - tl.x, bl.y - tl.y),
  );
  if (edge < 18) return null;

  const imageData = ctx.getImageData(0, 0, frameWidth, frameHeight);
  const data = imageData.data;
  const patchR = Math.max(3, edge / 14);
  const medians: [number, number, number][] = [];

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const u = (col + 0.5) / 3;
      const v = (row + 0.5) / 3;
      const center = bilinearOnQuad(tl, tr, br, bl, u, v);
      medians.push(samplePatchRgb(data, frameWidth, frameHeight, center.x, center.y, patchR));
    }
  }

  if (!isColorsCalibrated()) {
    const adjusted = prepareMediansForClassification(medians);
    return classifyFaceRelative(adjusted);
  }

  const colors = medians.map(([r, g, b]) => classifySticker(r, g, b));
  return refineFaceReads(colors, medians);
}
