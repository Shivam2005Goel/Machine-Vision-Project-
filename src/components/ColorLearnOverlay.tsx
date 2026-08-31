import { useMemo } from 'react';
import type { StickerColor } from '../types';
import {
  COLOR_HEX,
  COLOR_LABELS,
  COLOR_LEARN_ORDER,
  type ColorLearnSample,
} from '../lib/vision/colorReference';
import { useConfirmKey } from '../hooks/useConfirmKey';
import { getGuideOverlayRect, getPanelBelowGuideStyle, isCompactViewport } from '../lib/vision/guideOverlay';
import { KeyboardHint } from './KeyboardHint';

interface ColorLearnOverlayProps {
  visible: boolean;
  stepIndex: number;
  sample: ColorLearnSample | null;
  ready: boolean;
  error: string | null;
  frameWidth: number;
  frameHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  onConfirm: () => void;
}

function scanPromptForColor(color: StickerColor): string {
  return `Scan ${COLOR_LABELS[color].toLowerCase()}`;
}

export function ColorLearnOverlay({
  visible,
  stepIndex,
  sample,
  ready,
  error,
  frameWidth,
  frameHeight,
  viewportWidth,
  viewportHeight,
  onConfirm,
}: ColorLearnOverlayProps) {
  const target: StickerColor = COLOR_LEARN_ORDER[stepIndex] ?? 'R';
  const compact = isCompactViewport(viewportWidth);
  useConfirmKey(onConfirm, visible && ready);

  const panelStyle = useMemo(() => {
    const guideRect = getGuideOverlayRect(
      frameWidth,
      frameHeight,
      viewportWidth,
      viewportHeight,
    );
    if (!guideRect) return undefined;
    return getPanelBelowGuideStyle(guideRect);
  }, [frameWidth, frameHeight, viewportWidth, viewportHeight]);

  if (!visible) return null;

  return (
    <div className="color-learn-overlay" aria-live="polite">
      <div className="guide-action-panel color-learn-below-guide" style={panelStyle}>
        <div className="color-learn-header">
          <p className="color-learn-prompt" style={{ color: COLOR_HEX[target] }}>
            {scanPromptForColor(target)}
          </p>
          <p className="color-learn-step">
            {stepIndex + 1} / {COLOR_LEARN_ORDER.length}
          </p>
        </div>

        {sample && (
          <div
            className="color-learn-swatch"
            style={{ background: `rgb(${sample.r},${sample.g},${sample.b})` }}
          />
        )}

        <button type="button" className="capture-button capture-button--primary" disabled={!ready} onClick={onConfirm}>
          {compact || ready ? 'Confirm' : 'Hold steady…'}
        </button>
        <KeyboardHint action="confirm" />
        {error && <p className="color-learn-error">{error}</p>}
      </div>
    </div>
  );
}
