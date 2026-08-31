import { getGuideSquare, getColorSampleSpot, getGuideSizeRatio } from './roi';
import { SELFIE_CAMERA_MODE } from './selfieView';

export interface GuideOverlayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** object-fit: cover 기준으로 프레임 좌표 → 화면 좌표 변환 */
export function getCoverTransform(
  frameWidth: number,
  frameHeight: number,
  containerWidth: number,
  containerHeight: number,
) {
  const scale = Math.max(containerWidth / frameWidth, containerHeight / frameHeight);
  const displayW = frameWidth * scale;
  const displayH = frameHeight * scale;
  return {
    scale,
    offsetX: (containerWidth - displayW) / 2,
    offsetY: (containerHeight - displayH) / 2,
  };
}

/** Map a frame-space rectangle to viewport pixels (object-fit: cover + selfie mirror). */
export function mapFrameRectToViewport(
  frameX: number,
  frameY: number,
  frameW: number,
  frameH: number,
  frameWidth: number,
  frameHeight: number,
  containerWidth: number,
  containerHeight: number,
): GuideOverlayRect {
  const { scale, offsetX, offsetY } = getCoverTransform(
    frameWidth,
    frameHeight,
    containerWidth,
    containerHeight,
  );
  const left = offsetX + frameX * scale;
  const top = offsetY + frameY * scale;
  const width = frameW * scale;
  const height = frameH * scale;

  if (SELFIE_CAMERA_MODE) {
    return {
      left: containerWidth - left - width,
      top,
      width,
      height,
    };
  }

  return { left, top, width, height };
}

/** 실제 색상 샘플링 영역과 일치하는 점선 가이드 위치 */
export function getGuideOverlayRect(
  frameWidth: number,
  frameHeight: number,
  containerWidth: number,
  containerHeight: number,
): GuideOverlayRect | null {
  if (!frameWidth || !frameHeight || !containerWidth || !containerHeight) {
    return null;
  }

  const guide = getGuideSquare(frameWidth, frameHeight, getGuideSizeRatio(containerWidth));
  return mapFrameRectToViewport(
    guide.x,
    guide.y,
    guide.size,
    guide.size,
    frameWidth,
    frameHeight,
    containerWidth,
    containerHeight,
  );
}

/** 풀이 단계 — 면 스캔과 동일한 가이드 영역 사용 */
export function getSolvingScanOverlayRect(
  frameWidth: number,
  frameHeight: number,
  containerWidth: number,
  containerHeight: number,
): GuideOverlayRect | null {
  return getGuideOverlayRect(frameWidth, frameHeight, containerWidth, containerHeight);
}

/** Viewports at or below this width use compact touch-first layout. */
export const COMPACT_VIEWPORT_MAX = 520;

export function isCompactViewport(width: number): boolean {
  return width > 0 && width <= COMPACT_VIEWPORT_MAX;
}

/** Center a panel inside the guide frame (scan-ready controls, etc.). */
export function getPanelInsideGuideStyle(
  guideRect: GuideOverlayRect,
): { left: string; top: string; width: string; height: string } {
  return {
    left: `${guideRect.left}px`,
    top: `${guideRect.top}px`,
    width: `${guideRect.width}px`,
    height: `${guideRect.height}px`,
  };
}

/** Place controls directly below the guide frame (colour calibration, etc.). */
export function getPanelBelowGuideStyle(
  guideRect: GuideOverlayRect,
  gap = 10,
): { left: string; top: string; width: string } {
  return {
    left: `${guideRect.left}px`,
    top: `${guideRect.top + guideRect.height + gap}px`,
    width: `${guideRect.width}px`,
  };
}

/** Scan-ready / calibration panels: below guide on phones, inside on larger screens. */
export function getGuideActionPanelStyle(
  guideRect: GuideOverlayRect,
  viewportWidth: number,
  gap = 10,
): ReturnType<typeof getPanelInsideGuideStyle> | ReturnType<typeof getPanelBelowGuideStyle> {
  if (isCompactViewport(viewportWidth)) {
    return getPanelBelowGuideStyle(guideRect, gap);
  }
  return getPanelInsideGuideStyle(guideRect);
}

/** Solving hint panel — top sheet on phones, right rail on larger screens. */
export function getSolvingMoveHintPanelStyle(
  viewportWidth: number,
  viewportHeight: number,
): {
  left: string;
  top?: string;
  bottom?: string;
  transform: string;
  maxWidth: string;
  width: string;
} {
  if (isCompactViewport(viewportWidth)) {
    const sidePad = 8;
    const width = Math.max(0, viewportWidth - sidePad * 2);
    return {
      left: `${sidePad}px`,
      top: 'calc(max(8px, env(safe-area-inset-top)) + var(--app-title-height) + 8px)',
      transform: 'none',
      maxWidth: `${width}px`,
      width: `${width}px`,
    };
  }
  return getCenterRightPanelStyle(viewportWidth, viewportHeight);
}

/** Live-scan preview panel — docked below the guide (compact fixed width). */
export function getLiveScanPanelStyle(
  guideRect: GuideOverlayRect,
  viewportWidth: number,
  _viewportHeight: number,
): ReturnType<typeof getPanelBesideGuideStyle> {
  const sidePad = 12;
  const width = Math.min(guideRect.width, Math.max(0, viewportWidth - sidePad * 2));
  const left = Math.max(sidePad, (viewportWidth - width) / 2);
  return {
    left: `${left}px`,
    top: `${guideRect.top + guideRect.height + 12}px`,
    transform: 'none',
    maxWidth: `${width}px`,
    width: `${width}px`,
  };
}

/** Place a side panel to the right of the guide frame, vertically centered in viewport. */
export function getPanelBesideGuideStyle(
  guideRect: GuideOverlayRect,
  viewportWidth: number,
  viewportHeight: number,
  panelMaxWidth = 168,
  gap = 10,
  minWidth = 148,
  widthRatio = 0.36,
): { left: string; top: string; transform: string; maxWidth: string; width: string } {
  const width = Math.min(panelMaxWidth, Math.max(minWidth, viewportWidth * widthRatio));
  const left = Math.min(guideRect.left + guideRect.width + gap, viewportWidth - width - 8);
  const panelHeight = 200;
  const idealTop = guideRect.top + guideRect.height / 2;
  const minTop = panelHeight / 2 + 56;
  const maxTop = Math.max(minTop, viewportHeight - panelHeight / 2 - 72);
  const top = Math.max(minTop, Math.min(idealTop, maxTop));
  return {
    left: `${left}px`,
    top: `${top}px`,
    transform: 'translateY(-50%)',
    maxWidth: `${width}px`,
    width: `${width}px`,
  };
}

/** Solving hint panel — vertically centered on the right edge of the viewport. */
export function getCenterRightPanelStyle(
  viewportWidth: number,
  viewportHeight: number,
  panelMaxWidth = 360,
  gap = 10,
): { left: string; top: string; transform: string; maxWidth: string; width: string } {
  const width = Math.min(panelMaxWidth, Math.max(300, viewportWidth * 0.38));
  const left = Math.max(gap, viewportWidth - width - gap);
  const panelHeight = 320;
  const minTop = panelHeight / 2 + 48;
  const maxTop = Math.max(minTop, viewportHeight - panelHeight / 2 - 24);
  const top = Math.max(minTop, Math.min(viewportHeight / 2, maxTop));
  return {
    left: `${left}px`,
    top: `${top}px`,
    transform: 'translateY(-50%)',
    maxWidth: `${width}px`,
    width: `${width}px`,
  };
}

/** Solving hint panel — top center, below the title bar. */
export function getTopCenterPanelStyle(
  viewportWidth: number,
  panelMaxWidth = 280,
): { left: string; top: string; transform: string; maxWidth: string; width: string } {
  const width = Math.min(panelMaxWidth, Math.max(200, viewportWidth * 0.88));
  return {
    left: '50%',
    top: 'calc(max(8px, env(safe-area-inset-top)) + var(--app-title-height) + 8px)',
    transform: 'translateX(-50%)',
    maxWidth: `${width}px`,
    width: `${width}px`,
  };
}

/** @deprecated Use getTopCenterPanelStyle */
export function getCenterPanelStyle(
  viewportWidth: number,
  panelMaxWidth = 300,
): { left: string; top: string; transform: string; maxWidth: string; width: string } {
  return getTopCenterPanelStyle(viewportWidth, panelMaxWidth);
}

/** White-balance spot (viewport coordinates) */
export function getWhiteSpotOverlayRect(
  frameWidth: number,
  frameHeight: number,
  containerWidth: number,
  containerHeight: number,
): GuideOverlayRect | null {
  if (!frameWidth || !frameHeight || !containerWidth || !containerHeight) {
    return null;
  }

  const guide = getGuideSquare(frameWidth, frameHeight, getGuideSizeRatio(containerWidth));
  const spot = getColorSampleSpot(guide);
  return mapFrameRectToViewport(
    spot.x,
    spot.y,
    spot.size,
    spot.size,
    frameWidth,
    frameHeight,
    containerWidth,
    containerHeight,
  );
}
