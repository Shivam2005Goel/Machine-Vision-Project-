import type { CSSProperties } from 'react';
import type { GuideOverlayRect } from '../lib/vision/guideOverlay';

interface GuideOverlayProps {
  rect: GuideOverlayRect | null;
  viewportWidth: number;
  viewportHeight: number;
  visible: boolean;
  showSpot?: boolean;
  spotRect?: GuideOverlayRect | null;
  spotColor?: string;
}

function fallbackRect(viewportWidth: number, viewportHeight: number): GuideOverlayRect {
  const size = Math.min(viewportWidth, viewportHeight) * 0.3;
  return {
    left: (viewportWidth - size) / 2,
    top: (viewportHeight - size) / 2,
    width: size,
    height: size,
  };
}

function frameStyle(rect: GuideOverlayRect): CSSProperties {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    transform: 'none',
  };
}

function DimPanels({
  rect,
  viewportWidth,
  viewportHeight,
}: {
  rect: GuideOverlayRect;
  viewportWidth: number;
  viewportHeight: number;
}) {
  const dim: CSSProperties = {
    position: 'absolute',
    background: 'rgba(0, 0, 0, 0.38)',
    pointerEvents: 'none',
  };

  const { left, top, width, height } = rect;
  const right = left + width;
  const bottom = top + height;

  return (
    <>
      <div style={{ ...dim, top: 0, left: 0, width: viewportWidth, height: top }} />
      <div
        style={{
          ...dim,
          top: bottom,
          left: 0,
          width: viewportWidth,
          height: Math.max(0, viewportHeight - bottom),
        }}
      />
      <div style={{ ...dim, top, left: 0, width: left, height }} />
      <div
        style={{
          ...dim,
          top,
          left: right,
          width: Math.max(0, viewportWidth - right),
          height,
        }}
      />
    </>
  );
}

export function GuideOverlay({
  rect,
  viewportWidth,
  viewportHeight,
  visible,
  showSpot = false,
  spotRect = null,
  spotColor = '#ffffff',
}: GuideOverlayProps) {
  if (!visible || !viewportWidth || !viewportHeight) return null;

  const resolved = rect ?? fallbackRect(viewportWidth, viewportHeight);
  const resolvedSpot = showSpot ? (spotRect ?? resolved) : null;

  return (
    <div className="guide-overlay-root" aria-hidden="true">
      <DimPanels
        rect={resolved}
        viewportWidth={viewportWidth}
        viewportHeight={viewportHeight}
      />
      <div className="guide-frame-css" style={frameStyle(resolved)} />
      {resolvedSpot && (
        <div
          className="guide-spot-css"
          style={{
            ...frameStyle(resolvedSpot),
            borderColor: spotColor,
            boxShadow: `0 0 0 2px rgba(0, 0, 0, 0.45), 0 0 14px ${spotColor}88`,
          }}
        />
      )}
    </div>
  );
}
