import { useMemo } from 'react';
import { useConfirmKey } from '../hooks/useConfirmKey';
import { getGuideOverlayRect, getGuideActionPanelStyle, isCompactViewport } from '../lib/vision/guideOverlay';
import { KeyboardHint } from './KeyboardHint';

interface ScanReadyOverlayProps {
  visible: boolean;
  savedColors?: boolean;
  frameWidth: number;
  frameHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  onStart: () => void;
}

export function ScanReadyOverlay({
  visible,
  savedColors = false,
  frameWidth,
  frameHeight,
  viewportWidth,
  viewportHeight,
  onStart,
}: ScanReadyOverlayProps) {
  useConfirmKey(onStart, visible);

  const compact = isCompactViewport(viewportWidth);

  const panelStyle = useMemo(() => {
    const guideRect = getGuideOverlayRect(
      frameWidth,
      frameHeight,
      viewportWidth,
      viewportHeight,
    );
    if (!guideRect) return undefined;
    return getGuideActionPanelStyle(guideRect, viewportWidth);
  }, [frameWidth, frameHeight, viewportWidth, viewportHeight]);

  if (!visible) return null;

  return (
    <div className="scan-ready-overlay" aria-live="polite">
      <div
        className={`guide-action-panel scan-ready-panel${compact ? ' scan-ready-panel--below' : ' scan-ready-panel--in-guide'}`}
        style={panelStyle}
      >
        {savedColors && (
          <p className="scan-ready-sub">Using saved colour calibration</p>
        )}
        <button type="button" className="capture-button capture-button--primary" onClick={onStart}>
          Start scan
        </button>
        <KeyboardHint action="start scanning" />
      </div>
    </div>
  );
}
