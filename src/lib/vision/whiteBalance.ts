import { getGuideSquare, getColorSampleSpot } from './roi';

export interface WhiteBalanceGains {
  r: number;
  g: number;
  b: number;
}

export interface WhiteReference {
  r: number;
  g: number;
  b: number;
}

const DEFAULT_GAINS: WhiteBalanceGains = { r: 1, g: 1, b: 1 };
const MIN_GAIN = 0.45;
const MAX_GAIN = 2.2;
const WHITE_TARGET = 240;

let activeGains: WhiteBalanceGains = { ...DEFAULT_GAINS };
let whiteReference: WhiteReference | null = null;
let calibrated = false;

export function getWhiteBalance(): WhiteBalanceGains {
  return activeGains;
}

export function getWhiteReference(): WhiteReference | null {
  return whiteReference;
}

export function isWhiteBalanceCalibrated(): boolean {
  return calibrated;
}

export function setWhiteBalance(gains: WhiteBalanceGains): void {
  activeGains = {
    r: clampGain(gains.r),
    g: clampGain(gains.g),
    b: clampGain(gains.b),
  };
}

export function setWhiteBalanceFromSample(sample: WhiteBalanceSample): void {
  whiteReference = { r: sample.r, g: sample.g, b: sample.b };
  let rGain = clampGain(WHITE_TARGET / Math.max(sample.r, 1));
  let gGain = clampGain(WHITE_TARGET / Math.max(sample.g, 1));
  let bGain = clampGain(WHITE_TARGET / Math.max(sample.b, 1));

  // 노란 방 조명: 파란 채널을 조금 더 올려 흰색/노란색 혼동 완화
  if (sample.warmth > 10) {
    const warmBoost = 1 + Math.min(0.14, sample.warmth / 180);
    bGain = clampGain(bGain * warmBoost);
    gGain = clampGain(gGain * (1 + Math.min(0.04, sample.warmth / 400)));
  }

  activeGains = { r: rGain, g: gGain, b: bGain };
  calibrated = true;
}

export function resetWhiteBalance(): void {
  activeGains = { ...DEFAULT_GAINS };
  whiteReference = null;
  calibrated = false;
}

function clampGain(value: number): number {
  return Math.min(MAX_GAIN, Math.max(MIN_GAIN, value));
}

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

export function applyWhiteBalance(r: number, g: number, b: number): [number, number, number] {
  return [
    clampByte(r * activeGains.r),
    clampByte(g * activeGains.g),
    clampByte(b * activeGains.b),
  ];
}

export interface WhiteBalanceSample {
  r: number;
  g: number;
  b: number;
  brightness: number;
  warmth: number;
  ready: boolean;
}

export function measureWhiteBalanceSample(
  sourceCanvas: HTMLCanvasElement,
  frameWidth: number,
  frameHeight: number,
): WhiteBalanceSample | null {
  const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const guide = getGuideSquare(frameWidth, frameHeight);
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

  for (let i = 0; i < data.length; i += 8) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const brightness = (r + g + b) / 3;
    if (brightness < 105) continue;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (chroma > 38) continue;
    rs.push(r);
    gs.push(g);
    bs.push(b);
  }

  if (rs.length < 8) return null;

  const r = median(rs);
  const g = median(gs);
  const b = median(bs);
  const brightness = (r + g + b) / 3;
  const warmth = (r + g) / 2 - b;

  return {
    r,
    g,
    b,
    brightness,
    warmth,
    ready: brightness > 125 && rs.length >= 14,
  };
}

export function calibrateWhiteBalanceFromCanvas(
  sourceCanvas: HTMLCanvasElement,
  frameWidth: number,
  frameHeight: number,
): { gains: WhiteBalanceGains; sample: WhiteBalanceSample } | null {
  const sample = measureWhiteBalanceSample(sourceCanvas, frameWidth, frameHeight);
  if (!sample || !sample.ready) return null;

  setWhiteBalanceFromSample(sample);

  return { gains: getWhiteBalance(), sample };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}
