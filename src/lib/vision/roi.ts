import type { Point2D } from '../../types';

/** 화면 중앙 정사각형 가이드 비율 (카메라 프레임 대비) */
export const GUIDE_SIZE_RATIO = 0.3;

/** Larger guide on narrow portrait screens. */
export const COMPACT_GUIDE_SIZE_RATIO = 0.38;

export const COMPACT_VIEWPORT_MAX = 520;

export function getGuideSizeRatio(viewportWidth: number): number {
  return viewportWidth > 0 && viewportWidth <= COMPACT_VIEWPORT_MAX
    ? COMPACT_GUIDE_SIZE_RATIO
    : GUIDE_SIZE_RATIO;
}

/** @deprecated Use GUIDE_SIZE_RATIO — solving now shares the live-scan guide. */
export const SOLVING_GUIDE_SIZE_RATIO = GUIDE_SIZE_RATIO;

/** 흰색 기준용 중앙 스팟 (가이드 대비 한 변 비율) — 옆 색 번짐 회피 */
export const WB_SPOT_RATIO = 1 / 3;

/** 화면 중앙 정사각형 가이드 (카메라 프레임 좌표) */
export function getGuideSquare(
  frameWidth: number,
  frameHeight: number,
  sizeRatio = GUIDE_SIZE_RATIO,
) {
  const size = Math.min(frameWidth, frameHeight) * sizeRatio;
  return {
    x: (frameWidth - size) / 2,
    y: (frameHeight - size) / 2,
    size,
  };
}

/** Center spot for single-sticker color sampling */
export function getColorSampleSpot(guide: { x: number; y: number; size: number }) {
  const spotSize = guide.size * WB_SPOT_RATIO;
  return {
    x: guide.x + (guide.size - spotSize) / 2,
    y: guide.y + (guide.size - spotSize) / 2,
    size: spotSize,
  };
}

export function guideToCorners(guide: {
  x: number;
  y: number;
  size: number;
}): [Point2D, Point2D, Point2D, Point2D] {
  const { x, y, size } = guide;
  return [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ];
}

export function isQuadInsideGuide(
  corners: [Point2D, Point2D, Point2D, Point2D],
  frameWidth: number,
  frameHeight: number,
  margin = 0.15,
): boolean {
  const guide = getGuideSquare(frameWidth, frameHeight);
  const cx = corners.reduce((s, p) => s + p.x, 0) / 4;
  const cy = corners.reduce((s, p) => s + p.y, 0) / 4;
  const m = guide.size * margin;
  return (
    cx >= guide.x + m &&
    cx <= guide.x + guide.size - m &&
    cy >= guide.y + m &&
    cy <= guide.y + guide.size - m
  );
}

export function translateCorners(
  corners: [Point2D, Point2D, Point2D, Point2D],
  dx: number,
  dy: number,
): [Point2D, Point2D, Point2D, Point2D] {
  return corners.map((p) => ({ x: p.x + dx, y: p.y + dy })) as [
    Point2D,
    Point2D,
    Point2D,
    Point2D,
  ];
}

/** 미러된 비디오 표시에 맞춰 X 좌표 반전 */
export function mirrorCornersX(
  corners: [Point2D, Point2D, Point2D, Point2D],
  frameWidth: number,
): [Point2D, Point2D, Point2D, Point2D] {
  return corners.map((p) => ({ x: frameWidth - p.x, y: p.y })) as [
    Point2D,
    Point2D,
    Point2D,
    Point2D,
  ];
}
