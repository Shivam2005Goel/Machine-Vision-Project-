import { useMemo } from 'react';
import type { DetectionFeedback } from '../types';
import { getGuideOverlayRect, getLiveScanPanelStyle } from '../lib/vision/guideOverlay';
import { FaceColorGrid } from './FaceColorGrid';

interface DetectionOverlayProps {
  feedback: DetectionFeedback;
  visible: boolean;
  knownFaceCount: number;
  liveScanProgress: number;
  frameWidth: number;
  frameHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}

export function DetectionOverlay({
  feedback,
  visible,
  knownFaceCount,
  liveScanProgress,
  frameWidth,
  frameHeight,
  viewportWidth,
  viewportHeight,
}: DetectionOverlayProps) {
  const panelStyle = useMemo(() => {
    const guideRect = getGuideOverlayRect(
      frameWidth,
      frameHeight,
      viewportWidth,
      viewportHeight,
    );
    if (!guideRect || !viewportWidth) return undefined;
    return getLiveScanPanelStyle(guideRect, viewportWidth, viewportHeight);
  }, [frameWidth, frameHeight, viewportWidth, viewportHeight]);

  if (!visible) return null;

  const previewColors =
    feedback.cellColors.length === 9 ? feedback.cellColors : null;

  return (
    <div className="detection-overlay" aria-live="polite">
      <div
        className="scan-ui-panel scan-ui-panel--live scan-ui-panel--dock"
        style={panelStyle}
      >
        <div className="live-scan-dock-meta">
          <p className="live-scan-dock-count">{knownFaceCount} / 6</p>
          <div className="calibration-bar live-scan-dock-bar">
            <div className="calibration-fill" style={{ width: `${liveScanProgress * 100}%` }} />
          </div>
        </div>

        <div className="scan-live-preview">
          {previewColors ? (
            <FaceColorGrid
              colors={previewColors}
              variant="overlay"
              orientation="mirror"
            />
          ) : (
            <div className="scan-live-preview-empty" aria-hidden="true" />
          )}
        </div>
      </div>
    </div>
  );
}
