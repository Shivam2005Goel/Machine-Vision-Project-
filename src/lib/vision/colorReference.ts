import type { StickerColor } from '../../types';
import { getGuideSquare, getColorSampleSpot, GUIDE_SIZE_RATIO } from './roi';

export const COLOR_LEARN_ORDER: StickerColor[] = ['R', 'O', 'Y', 'G', 'B', 'W'];

export const COLOR_LABELS: Record<StickerColor, string> = {
  R: 'Red',
  O: 'Orange',
  Y: 'Yellow',
  G: 'Green',
  B: 'Blue',
  W: 'White',
};

export const COLOR_HEX: Record<StickerColor, string> = {
  R: '#ef4444',
  O: '#f97316',
  Y: '#facc15',
  G: '#22c55e',
  B: '#3b82f6',
  W: '#f5f5f5',
};

const DEFAULT_LAB: Record<StickerColor, [number, number, number]> = {
  W: [95, 0, 0],
  Y: [88, -4, 82],
  R: [48, 62, 38],
  O: [62, 42, 62],
  G: [55, -48, 32],
  B: [32, 28, -52],
};

const COLOR_CALIBRATION_STORAGE_KEY = 'makemecubemaster-color-calibration';

let learnedLabs: Partial<Record<StickerColor, [number, number, number]>> = {};
let calibrated = false;

export interface ColorLearnSample {
  r: number;
  g: number;
  b: number;
  lab: [number, number, number];
  ready: boolean;
}

export function isColorsCalibrated(): boolean {
  return calibrated && COLOR_LEARN_ORDER.every((c) => learnedLabs[c]);
}

export function getLearnedLabRefs(): Record<StickerColor, [number, number, number]> {
  const refs = { ...DEFAULT_LAB };
  for (const color of COLOR_LEARN_ORDER) {
    if (learnedLabs[color]) refs[color] = learnedLabs[color]!;
  }
  return refs;
}

export function clearInMemoryColorReferences(): void {
  learnedLabs = {};
  calibrated = false;
}

export function resetColorReferences(): void {
  clearInMemoryColorReferences();
  try {
    localStorage.removeItem(COLOR_CALIBRATION_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

/** True when a full saved calibration exists in localStorage. */
export function hasPersistedColorCalibration(): boolean {
  try {
    const raw = localStorage.getItem(COLOR_CALIBRATION_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<Record<StickerColor, [number, number, number]>>;
    return COLOR_LEARN_ORDER.every((c) => parsed[c]);
  } catch {
    return false;
  }
}

/** Restore saved LAB refs from a previous session. */
export function loadPersistedColorReferences(): boolean {
  try {
    const raw = localStorage.getItem(COLOR_CALIBRATION_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<Record<StickerColor, [number, number, number]>>;
    if (!COLOR_LEARN_ORDER.every((c) => parsed[c])) return false;
    learnedLabs = parsed;
    calibrated = true;
    return true;
  } catch {
    return false;
  }
}

export function persistColorReferences(): void {
  if (!isColorsCalibrated()) return;
  try {
    localStorage.setItem(COLOR_CALIBRATION_STORAGE_KEY, JSON.stringify(learnedLabs));
  } catch {
    // ignore storage errors
  }
}

export function saveLearnedColor(color: StickerColor, lab: [number, number, number]): void {
  learnedLabs[color] = lab;
  if (COLOR_LEARN_ORDER.every((c) => learnedLabs[c])) {
    calibrated = true;
    persistColorReferences();
  }
}

function pivot(v: number): number {
  return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92;
}

function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const sr = pivot(r / 255);
  const sg = pivot(g / 255);
  const sb = pivot(b / 255);
  const x = sr * 0.4124564 + sg * 0.3575761 + sb * 0.1804375;
  const y = sr * 0.2126729 + sg * 0.7151522 + sb * 0.072175;
  const z = sr * 0.0193339 + sg * 0.119192 + sb * 0.9503041;
  const fx = x / 0.95047 > 0.008856 ? (x / 0.95047) ** (1 / 3) : 7.787 * (x / 0.95047) + 16 / 116;
  const fy = y > 0.008856 ? y ** (1 / 3) : 7.787 * y + 16 / 116;
  const fz = z / 1.08883 > 0.008856 ? (z / 1.08883) ** (1 / 3) : 7.787 * (z / 1.08883) + 16 / 116;
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function dominantChannel(r: number, g: number, b: number): StickerColor {
  if (Math.max(r, g, b) - Math.min(r, g, b) < 28) return 'W';
  if (r >= g && r >= b) return g > r * 0.92 ? 'O' : 'R';
  if (g >= r && g >= b) return 'G';
  return 'B';
}

function isPlausibleForColor(
  r: number,
  g: number,
  b: number,
  expected: StickerColor,
): boolean {
  const max = Math.max(r, g, b);
  if (max < 45) return false;

  const brightness = (r + g + b) / 3;
  const chroma = max - Math.min(r, g, b);

  switch (expected) {
    case 'W':
      return chroma < 55 && brightness > 95;
    case 'Y':
      return r > 75 && g > 65 && brightness > 80;
    case 'R':
      return r > 65 && r >= b;
    case 'O':
      return r > 70 && g > 55 && r >= b - 5;
    case 'G':
      // Warm light pulls green toward yellow — allow g ≈ r if g leads
      return g > 45 && g >= r - 12 && g >= b - 5;
    case 'B':
      return b > 40 && b >= r - 8 && b >= g - 15;
    default:
      return true;
  }
}

function medianMatchesExpected(
  r: number,
  g: number,
  b: number,
  expected: StickerColor,
): boolean {
  if (expected === 'W') {
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    return chroma < 60;
  }
  if (expected === 'Y') return r > 70 && g > 60;
  const dom = dominantChannel(r, g, b);
  if (expected === 'O') return dom === 'O' || dom === 'R' || dom === 'Y';
  if (expected === 'R') return dom === 'R' || dom === 'O';
  return dom === expected;
}

export function measureColorLearnSpot(
  sourceCanvas: HTMLCanvasElement,
  frameWidth: number,
  frameHeight: number,
  expected: StickerColor,
  guideRatio = GUIDE_SIZE_RATIO,
): ColorLearnSample | null {
  const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const guide = getGuideSquare(frameWidth, frameHeight, guideRatio);
  const spot = getColorSampleSpot(guide);
  const x0 = Math.floor(spot.x);
  const y0 = Math.floor(spot.y);
  const w = Math.floor(spot.size);
  const h = Math.floor(spot.size);
  if (w <= 0 || h <= 0) return null;

  const data = ctx.getImageData(x0, y0, w, h).data;
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const allRs: number[] = [];
  const allGs: number[] = [];
  const allBs: number[] = [];

  for (let i = 0; i < data.length; i += 8) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const max = Math.max(r, g, b);
    if (max < 40) continue;

    allRs.push(r);
    allGs.push(g);
    allBs.push(b);

    if (isPlausibleForColor(r, g, b, expected)) {
      rs.push(r);
      gs.push(g);
      bs.push(b);
    }
  }

  const useRs = rs.length >= 4 ? rs : allRs;
  const useGs = rs.length >= 4 ? gs : allGs;
  const useBs = rs.length >= 4 ? bs : allBs;

  if (useRs.length < 4) return null;

  const r = median(useRs);
  const g = median(useGs);
  const b = median(useBs);
  const lab = rgbToLab(r, g, b);
  const pixelCount = useRs.length;

  return {
    r,
    g,
    b,
    lab,
    ready: pixelCount >= 6 && medianMatchesExpected(r, g, b, expected),
  };
}

export function calibrateLearnedColor(
  sourceCanvas: HTMLCanvasElement,
  frameWidth: number,
  frameHeight: number,
  expected: StickerColor,
): ColorLearnSample | null {
  const sample = measureColorLearnSpot(sourceCanvas, frameWidth, frameHeight, expected);
  if (!sample?.ready) return null;
  saveLearnedColor(expected, sample.lab);
  return sample;
}
