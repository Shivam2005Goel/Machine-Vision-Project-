import type { ReadColor } from '../../types';
import { sampleFaceCapture, type FaceCaptureSample } from './colorClassifier';
import { isKnownColor } from './readColorUtils';

const WARP = 256;

export function sampleGuideRegionCapture(
  sourceCanvas: HTMLCanvasElement,
  guide: { x: number; y: number; size: number },
): FaceCaptureSample {
  const temp = document.createElement('canvas');
  temp.width = WARP;
  temp.height = WARP;
  const ctx = temp.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { colors: [], medians: [] };

  ctx.drawImage(
    sourceCanvas,
    guide.x,
    guide.y,
    guide.size,
    guide.size,
    0,
    0,
    WARP,
    WARP,
  );

  return sampleFaceCapture(ctx, WARP, WARP);
}

export function sampleGuideRegionColors(
  sourceCanvas: HTMLCanvasElement,
  guide: { x: number; y: number; size: number },
): ReadColor[] {
  return sampleGuideRegionCapture(sourceCanvas, guide).colors;
}

export function measureColorVariance(
  sourceCanvas: HTMLCanvasElement,
  guide: { x: number; y: number; size: number },
): number {
  const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0;

  const { x, y, size } = guide;
  const data = ctx.getImageData(Math.floor(x), Math.floor(y), Math.floor(size), Math.floor(size))
    .data;
  let sum = 0;
  let sumSq = 0;
  let n = 0;

  for (let i = 0; i < data.length; i += 32) {
    const v = (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
    sum += v;
    sumSq += v * v;
    n++;
  }

  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** 풀이 단계 — 코너 뷰·손 가림 허용 (가이드 색 검증 완화) */
export function isRegionCubeLikeSolving(
  colors: ReadColor[],
  variance: number,
): boolean {
  if (colors.length !== 9) return false;
  const known = colors.filter(isKnownColor);
  const unique = new Set(known);
  if (variance < 25) return false;
  if (unique.size >= 2 && variance >= 40) return true;
  if (unique.size >= 3) return true;
  return isRegionCubeLike(colors, variance);
}

/** 큐브 스티커가 가이드 안에 있을 때만 true (얼굴/배경만 있으면 false) */
export function isRegionCubeLike(
  colors: ReadColor[],
  variance: number,
): boolean {
  if (colors.length !== 9) return false;
  const known = colors.filter(isKnownColor);
  const unique = new Set(known);
  const nonWhite = known.filter((c) => c !== 'W').length;

  if (variance < 120) return false;

  // 단색 면 (풀린 큐브 한 면)
  if (unique.size === 1) return true;

  // 얼굴/피부: 색이 2종류뿐이고 채도가 낮은 경우 제외
  if (unique.size === 2 && nonWhite <= 3 && variance < 300) return false;

  if (unique.size >= 3 && nonWhite >= 2) return true;
  if (unique.size >= 2 && nonWhite >= 4 && variance > 220) return true;

  return false;
}
