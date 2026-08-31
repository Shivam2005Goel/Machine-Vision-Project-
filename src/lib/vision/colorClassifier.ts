import type { FaceId, ReadColor, StickerColor } from '../../types';
import { identifyFaceFromCenter } from '../cube/colors';
import { getLearnedLabRefs, isColorsCalibrated } from './colorReference';
import { isKnownColor } from './readColorUtils';
import { prepareMediansForClassification } from './scanWhiteCalibration';

const CHROMA_REFS: Record<StickerColor, [number, number, number]> = {
  W: [1 / 3, 1 / 3, 1 / 3],
  Y: [0.4, 0.38, 0.22],
  R: [0.45, 0.32, 0.23],
  O: [0.42, 0.36, 0.22],
  G: [0.28, 0.42, 0.3],
  B: [0.28, 0.32, 0.4],
};

/** Min chromaticity gap between 1st and 2nd candidate to accept a read. */
const CONFIDENCE_MARGIN = 0.016;

const ALL_COLORS: StickerColor[] = ['R', 'O', 'Y', 'G', 'B', 'W'];

const FALLBACK_LAB: Record<StickerColor, [number, number, number]> = {
  W: [95, 0, 0],
  Y: [88, -4, 82],
  R: [48, 62, 38],
  O: [62, 42, 62],
  G: [55, -48, 32],
  B: [32, 28, -52],
};

function labRefs(): Record<StickerColor, [number, number, number]> {
  return isColorsCalibrated() ? getLearnedLabRefs() : FALLBACK_LAB;
}

function rgbToXyz(r: number, g: number, b: number): [number, number, number] {
  const sr = pivot(r / 255);
  const sg = pivot(g / 255);
  const sb = pivot(b / 255);
  return [
    sr * 0.4124564 + sg * 0.3575761 + sb * 0.1804375,
    sr * 0.2126729 + sg * 0.7151522 + sb * 0.072175,
    sr * 0.0193339 + sg * 0.119192 + sb * 0.9503041,
  ];
}

function pivot(v: number): number {
  return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92;
}

function xyzToLab(x: number, y: number, z: number): [number, number, number] {
  const xn = 0.95047;
  const yn = 1;
  const zn = 1.08883;
  const fx = labPivot(x / xn);
  const fy = labPivot(y / yn);
  const fz = labPivot(z / zn);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labPivot(t: number): number {
  return t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116;
}

function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const [x, y, z] = rgbToXyz(r, g, b);
  return xyzToLab(x, y, z);
}

function labDistance(a: [number, number, number], b: [number, number, number]): number {
  const dl = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

function redOrangeCalibrationGap(refs: Record<StickerColor, [number, number, number]>): number {
  return labDistance(refs.R, refs.O);
}

/** Pick red vs orange using calibrated LAB refs (falls back to RGB heuristics). */
export function pickRedOrOrange(
  lab: [number, number, number],
  refs: Record<StickerColor, [number, number, number]>,
  rgb?: [number, number, number],
): 'R' | 'O' {
  const dR = labDistance(lab, refs.R);
  const dO = labDistance(lab, refs.O);
  const calGap = redOrangeCalibrationGap(refs);
  const margin = Math.max(4, Math.min(12, calGap * 0.32));

  if (dR + margin < dO) return 'R';
  if (dO + margin < dR) return 'O';

  if (rgb) {
    const [r, g, b] = rgb;
    if (g >= r * 0.72 && g > b) return 'O';
    if (r > g + 10 && r > b + 5) return 'R';
  }

  return dO < dR ? 'O' : 'R';
}

function isWarmStickerRgb(r: number, g: number, b: number): boolean {
  return r > 55 && r >= b - 8 && r + g > b + 35;
}

function classifyByLab(r: number, g: number, b: number): StickerColor {
  const lab = rgbToLab(r, g, b);
  const refs = labRefs();
  const scored = ALL_COLORS.map((color) => ({
    color,
    dist: labDistance(lab, refs[color]),
  })).sort((a, b) => a.dist - b.dist);

  const best = scored[0]!;
  const blue = scored.find((s) => s.color === 'B')!;
  const green = scored.find((s) => s.color === 'G')!;
  const white = scored.find((s) => s.color === 'W')!;

  // Warm/yellow light: blue often misread as yellow.
  if (best.color === 'Y' && b > r + 10 && b >= g - 12 && blue.dist < best.dist + 14) {
    return 'B';
  }

  // Green stickers washed out to white under bright light.
  if (best.color === 'W' && g >= r - 6 && g > b + 4 && green.dist < best.dist + 12) {
    return 'G';
  }

  // Yellow vs white on pale stickers.
  if (best.color === 'Y' && white.dist < best.dist + 8 && r + g > b + 40) {
    return 'W';
  }

  const red = scored.find((s) => s.color === 'R')!;
  const orange = scored.find((s) => s.color === 'O')!;
  const dR = red.dist;
  const dO = orange.dist;
  const warmCandidate =
    isWarmStickerRgb(r, g, b) &&
    (best.color === 'R' ||
      best.color === 'O' ||
      Math.min(dR, dO) < best.dist + 16);

  if (warmCandidate) {
    if (isColorsCalibrated()) {
      return pickRedOrOrange(lab, refs, [r, g, b]);
    }
    if (Math.abs(dR - dO) < 14) {
      if (g >= r * 0.72 && g > b) return 'O';
      if (r > g + 10 && r > b + 5) return 'R';
    }
  }

  return best.color;
}

function isGapPixel(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 38) return true;
  if (max < 70 && max - min < 22) return true;
  return false;
}

function classifyRelativeSticker(r: number, g: number, b: number): StickerColor {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 42) return 'W';

  const chroma = max - min;
  const sum = r + g + b;
  const avg = sum / 3;

  if (chroma < 38 || chroma / max < 0.13) {
    if (avg > 85) return 'W';
  }

  const rn = r / sum;
  const gn = g / sum;
  const bn = b / sum;

  if (bn > rn + 0.05 && bn > gn + 0.04 && bn > 0.29) return 'B';
  if (gn > rn + 0.04 && gn > bn + 0.05 && gn > 0.31) return 'G';

  if (rn > 0.28 && gn > 0.28 && bn < 0.30) {
    if (rn > gn + 0.07) return 'O';
    return 'Y';
  }

  if (rn > gn && rn > bn) {
    if (gn > bn + 0.06 && gn > 0.26) return 'O';
    return 'R';
  }

  return classifyByLab(r, g, b);
}

function chromaticity(r: number, g: number, b: number): [number, number, number] {
  const sum = r + g + b;
  if (sum < 30) return [1 / 3, 1 / 3, 1 / 3];
  return [r / sum, g / sum, b / sum];
}

function chromaDist(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function classifyCellRelative(r: number, g: number, b: number): ReadColor {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 38) return '?';

  const raw = chromaticity(r, g, b);
  const scores = ALL_COLORS.map((color) => ({
    color,
    dist: chromaDist(raw, CHROMA_REFS[color]),
  })).sort((a, b) => a.dist - b.dist);

  const best = scores[0]!;
  const second = scores[1]!;
  const margin = second.dist - best.dist;

  if (margin < CONFIDENCE_MARGIN) {
    const yoTie =
      (best.color === 'Y' || best.color === 'O') &&
      (second.color === 'Y' || second.color === 'O');
    if (yoTie) {
      if (r - g > 22) return '?';
      if (g >= r - 20) return 'Y';
    }
    const roTie =
      (best.color === 'R' || best.color === 'O') &&
      (second.color === 'R' || second.color === 'O');
    if (roTie) {
      if (isColorsCalibrated()) {
        return pickRedOrOrange(rgbToLab(r, g, b), labRefs(), [r, g, b]);
      }
      if (g >= r * 0.72 && g > b) return 'O';
      if (r > g + 10 && r > b + 5) return 'R';
      return '?';
    }
    if (margin < CONFIDENCE_MARGIN * 0.35) return '?';
  }

  const chroma = max - min;
  if (chroma < 30 && chroma / max < 0.13) {
    if (best.color === 'W' && margin >= CONFIDENCE_MARGIN * 0.8) return 'W';
    if (margin < CONFIDENCE_MARGIN * 1.25) return '?';
  }

  if (margin < CONFIDENCE_MARGIN) return '?';

  return best.color;
}

/** Classify 9 cell medians via chromaticity (lighting-relative, not absolute RGB). */
export function classifyFaceRelative(
  rgbs: ReadonlyArray<readonly [number, number, number]>,
): ReadColor[] {
  return rgbs.map(([r, g, b]) => classifyCellRelative(r, g, b));
}

export function classifySticker(r: number, g: number, b: number): StickerColor {
  if (isGapPixel(r, g, b)) return classifyRelativeSticker(r, g, b);

  if (isColorsCalibrated()) {
    return classifyByLab(r, g, b);
  }

  return classifyRelativeSticker(r, g, b);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function cellSampleMargin(row: number, col: number): number {
  if (row === 1 && col === 1) return 0.12;
  const isCorner =
    (row === 0 || row === 2) && (col === 0 || col === 2);
  if (isCorner) return 0.32;
  return 0.26;
}

function pixelStickerWeight(r: number, g: number, b: number): number {
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  if (chroma > 52) return 0.15;
  if (chroma > 36) return 0.55;
  return 1;
}

function sampleCellMedianRgb(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number, number] {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const cellW = x1 - x0;
  const step = cellW > 40 ? 1 : 2;

  for (let y = Math.floor(y0); y < Math.floor(y1); y += step) {
    for (let x = Math.floor(x0); x < Math.floor(x1); x += step) {
      const i = (y * width + x) * 4;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      if (isGapPixel(r, g, b)) continue;
      rs.push(r);
      gs.push(g);
      bs.push(b);
    }
  }

  if (rs.length === 0) {
    const cx = Math.floor((x0 + x1) / 2);
    const cy = Math.floor((y0 + y1) / 2);
    const i = (cy * width + cx) * 4;
    return [data[i]!, data[i + 1]!, data[i + 2]!];
  }

  return [median(rs), median(gs), median(bs)];
}

function classifyCellPixels(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): StickerColor {
  const votes = new Map<StickerColor, number>();
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const cellW = x1 - x0;
  const step = cellW > 40 ? 1 : 2;

  for (let y = Math.floor(y0); y < Math.floor(y1); y += step) {
    for (let x = Math.floor(x0); x < Math.floor(x1); x += step) {
      const i = (y * width + x) * 4;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      if (isGapPixel(r, g, b)) continue;

      rs.push(r);
      gs.push(g);
      bs.push(b);

      const color = classifySticker(r, g, b);
      const weight = pixelStickerWeight(r, g, b);
      votes.set(color, (votes.get(color) ?? 0) + weight);
    }
  }

  if (rs.length === 0) {
    const cx = Math.floor((x0 + x1) / 2);
    const cy = Math.floor((y0 + y1) / 2);
    const i = (cy * width + cx) * 4;
    return classifySticker(data[i]!, data[i + 1]!, data[i + 2]!);
  }

  const medianColor = classifySticker(median(rs), median(gs), median(bs));
  votes.set(medianColor, (votes.get(medianColor) ?? 0) + 3);

  let best: StickerColor = medianColor;
  let bestVotes = 0;
  for (const [color, count] of votes) {
    if (count > bestVotes) {
      bestVotes = count;
      best = color;
    }
  }
  return best;
}

export interface FaceCaptureSample {
  colors: ReadColor[];
  medians: [number, number, number][];
}

function collectFaceCellMedians(
  data: Uint8ClampedArray,
  width: number,
  cellW: number,
  cellH: number,
): [number, number, number][] {
  const medians: [number, number, number][] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const margin = cellSampleMargin(row, col);
      const x0 = col * cellW + cellW * margin;
      const x1 = col * cellW + cellW * (1 - margin);
      const y0 = row * cellH + cellH * margin;
      const y1 = row * cellH + cellH * (1 - margin);
      medians.push(sampleCellMedianRgb(data, width, x0, y0, x1, y1));
    }
  }
  return medians;
}

export function medianCellMedians(
  readings: [number, number, number][][],
): [number, number, number][] {
  if (readings.length === 0) return [];

  const result: [number, number, number][] = [];
  for (let i = 0; i < 9; i++) {
    result.push([
      median(readings.map((reading) => reading[i]![0])),
      median(readings.map((reading) => reading[i]![1])),
      median(readings.map((reading) => reading[i]![2])),
    ]);
  }
  return result;
}

const PERIPHERY_INDICES = [0, 1, 2, 3, 5, 6, 7, 8] as const;

function redOrangeMargin(refs: Record<StickerColor, [number, number, number]>): number {
  return Math.max(6, Math.min(12, redOrangeCalibrationGap(refs) * 0.32));
}

/** Use learned LAB + face context to fix orange↔red misreads on R/L faces. */
export function refineWarmReadsForFace(
  colors: ReadColor[],
  medians: [number, number, number][],
  faceId: FaceId,
): ReadColor[] {
  if (!isColorsCalibrated() || medians.length !== 9) return [...colors];

  const result = [...colors];
  const refs = labRefs();
  const margin = redOrangeMargin(refs);

  for (const i of PERIPHERY_INDICES) {
    const read = result[i];
    if (read !== 'R' && read !== 'O') continue;

    const rgb = medians[i]!;
    const lab = rgbToLab(...rgb);
    const picked = pickRedOrOrange(lab, refs, rgb);

    if (faceId === 'L') {
      if (picked === 'O' || read === 'O') result[i] = 'O';
      else if (labDistance(lab, refs.R) + margin < labDistance(lab, refs.O)) result[i] = 'R';
      else result[i] = picked;
      continue;
    }

    if (faceId === 'R') {
      if (picked === 'R' || read === 'R') result[i] = 'R';
      else if (labDistance(lab, refs.O) + margin < labDistance(lab, refs.R)) result[i] = 'O';
      else result[i] = picked;
      continue;
    }

    result[i] = picked;
  }

  return result;
}

/** Refine R/O reads when the face centre identifies which sticker we are scanning. */
export function refineFaceReads(
  colors: ReadColor[],
  medians: [number, number, number][],
): ReadColor[] {
  if (!isColorsCalibrated() || medians.length !== 9) return [...colors];
  const center = colors[4];
  if (!isKnownColor(center)) return [...colors];
  const faceId = identifyFaceFromCenter(center);
  if (!faceId) return [...colors];
  return refineWarmReadsForFace(colors, medians, faceId);
}

export function sampleFaceCapture(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): FaceCaptureSample {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const cellW = width / 3;
  const cellH = height / 3;
  const medians = collectFaceCellMedians(data, width, cellW, cellH);

  if (!isColorsCalibrated()) {
    const adjusted = prepareMediansForClassification(medians);
    return {
      colors: classifyFaceRelative(adjusted),
      medians,
    };
  }

  const colors: ReadColor[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const margin = cellSampleMargin(row, col);
      const x0 = col * cellW + cellW * margin;
      const x1 = col * cellW + cellW * (1 - margin);
      const y0 = row * cellH + cellH * margin;
      const y1 = row * cellH + cellH * (1 - margin);
      colors.push(classifyCellPixels(data, width, x0, y0, x1, y1));
    }
  }

  return { colors: refineFaceReads(colors, medians), medians };
}

export function sampleFaceColors(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): ReadColor[] {
  return sampleFaceCapture(ctx, width, height).colors;
}

export function emptyColorCounts(): Record<StickerColor, number> {
  return { R: 0, O: 0, Y: 0, G: 0, B: 0, W: 0 };
}

export function countStickerColors(colors: ReadColor[]): Record<StickerColor, number> {
  const counts = emptyColorCounts();
  for (const c of colors) {
    if (!isKnownColor(c)) continue;
    counts[c]++;
  }
  return counts;
}

export function getDominantSticker(colors: ReadColor[]): {
  dominant: StickerColor;
  count: number;
} {
  const counts = countStickerColors(colors);
  let dominant: StickerColor = 'W';
  let count = 0;
  for (const color of ALL_COLORS) {
    if (counts[color] > count) {
      count = counts[color];
      dominant = color;
    }
  }
  return { dominant, count };
}

export function isColorsReadable(colors: ReadColor[] | null): boolean {
  return Boolean(colors && colors.length === 9 && colors.some(isKnownColor));
}

export function getCalibrationFeedback(colors: ReadColor[] | null): {
  valid: boolean;
  colorCounts: Record<StickerColor, number>;
  detectedCenter: StickerColor | null;
  uniqueColors: number;
  uncertainCells: number;
} {
  if (!colors || colors.length !== 9) {
    return {
      valid: false,
      colorCounts: emptyColorCounts(),
      detectedCenter: null,
      uniqueColors: 0,
      uncertainCells: 0,
    };
  }

  const colorCounts = countStickerColors(colors);
  const uniqueColors = Object.values(colorCounts).filter((n) => n > 0).length;
  const center = colors[4];

  return {
    valid: isColorsReadable(colors),
    colorCounts,
    detectedCenter: isKnownColor(center) ? center : null,
    uniqueColors,
    uncertainCells: colors.filter((c) => c === '?').length,
  };
}
