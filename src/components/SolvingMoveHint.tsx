import { useEffect, useMemo, useState } from 'react';
import type { Move } from '../types';
import { getMoveAngleLabel } from '../lib/cube/moveRotationDisplay';
import { getSolvingMoveHintPanelStyle, isCompactViewport } from '../lib/vision/guideOverlay';
import { useConfirmKey } from '../hooks/useConfirmKey';
import { SolvingCubeGuide } from './SolvingCubeGuide';

const AUTO_PLAY_INTERVAL_MS = 3000;
const AUTO_PLAY_STORAGE_KEY = 'makemecubemaster-solution-autoplay';

function clearLegacyAutoPlayPreference(): void {
  try {
    localStorage.removeItem(AUTO_PLAY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

interface SolvingMoveHintProps {
  visible: boolean;
  move: Move;
  facelet: string;
  moves: Move[];
  currentIndex: number;
  wrongMove: Move | null;
  currentStep: number;
  totalSteps: number;
  viewportWidth: number;
  viewportHeight: number;
  autoPlaySessionKey: string;
  onAutoPlayChange?: (enabled: boolean) => void;
  onNext?: () => void;
  onPrev?: () => void;
  canGoPrev?: boolean;
}

export function SolvingMoveHint({
  visible,
  move,
  facelet,
  moves,
  currentIndex,
  wrongMove,
  currentStep,
  totalSteps,
  viewportWidth,
  viewportHeight,
  autoPlaySessionKey,
  onAutoPlayChange,
  onNext,
  onPrev,
  canGoPrev = false,
}: SolvingMoveHintProps) {
  const angleLabel = useMemo(() => getMoveAngleLabel(move), [move]);
  const [autoPlay, setAutoPlay] = useState(false);
  const wrong = Boolean(wrongMove);

  const compact = isCompactViewport(viewportWidth);

  useEffect(() => {
    clearLegacyAutoPlayPreference();
  }, []);

  useEffect(() => {
    setAutoPlay(false);
  }, [autoPlaySessionKey]);

  useEffect(() => {
    onAutoPlayChange?.(autoPlay);
  }, [autoPlay, onAutoPlayChange]);

  useEffect(() => {
    if (!visible || !autoPlay || !onNext || wrong) return undefined;

    const timer = window.setTimeout(() => {
      onNext();
    }, AUTO_PLAY_INTERVAL_MS);

    return () => window.clearTimeout(timer);
  }, [visible, autoPlay, onNext, wrong, currentIndex, move]);

  const panelStyle = useMemo(() => {
    if (!viewportWidth || !viewportHeight) return undefined;
    return getSolvingMoveHintPanelStyle(viewportWidth, viewportHeight);
  }, [viewportWidth, viewportHeight]);

  useConfirmKey(onNext ?? (() => undefined), visible && Boolean(onNext));

  if (!visible) return null;

  const autoplayToggle = (
    <label className="solving-move-hint-autoplay-toggle">
      <span className="solving-move-hint-autoplay-label">Auto-play</span>
      <input
        type="checkbox"
        className="solving-move-hint-autoplay-input"
        checked={autoPlay}
        onChange={(e) => {
          setAutoPlay(e.target.checked);
        }}
      />
      <span className="solving-move-hint-autoplay-switch" aria-hidden="true" />
    </label>
  );

  return (
    <div
      className={`solving-move-hint${compact ? ' solving-move-hint--compact' : ''}`}
      style={panelStyle}
      aria-live="polite"
    >
      <div className={`solving-move-hint-card${wrong ? ' solving-move-hint-card--wrong' : ''}`}>
        <div className="solving-move-hint-header">
          <div className="solving-move-hint-header-row">
            <div className="solving-move-hint-step-badge" aria-label={`Step ${currentStep} of ${totalSteps}`}>
              <span className="solving-move-hint-step-current">{currentStep}</span>
              <span className="solving-move-hint-step-sep">/</span>
              <span className="solving-move-hint-step-total">{totalSteps}</span>
            </div>
            <div className="solving-move-hint-toolbar">
              {autoplayToggle}
              {(onPrev || onNext) && (
                <div className="solving-move-hint-nav">
                  {onPrev && (
                    <button
                      type="button"
                      className="solving-move-hint-prev"
                      onClick={onPrev}
                      disabled={!canGoPrev}
                    >
                      Prev
                    </button>
                  )}
                  {onNext && (
                    <button type="button" className="solving-move-hint-next" onClick={onNext}>
                      Next
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={`solving-move-hint-stage${compact ? ' solving-move-hint-stage--compact' : ''}`}>
          {compact ? (
            <div className="solving-move-hint-stage-body">
              <div className="solving-move-hint-stage-side solving-move-hint-stage-side--balance" aria-hidden="true" />
              <div className="solving-move-hint-stage-center">
                <div className="solving-cube-guide-shell solving-cube-guide-shell--compact">
                  <div className="solving-cube-guide-viewport">
                    <SolvingCubeGuide
                      facelet={facelet}
                      moves={moves}
                      currentIndex={currentIndex}
                      wrongMove={wrongMove}
                      compact
                    />
                  </div>
                </div>
              </div>
              <div className="solving-move-hint-stage-side solving-move-hint-stage-side--move">
                <p
                  className="solving-move-hint-move solving-move-hint-move--side"
                  aria-label={`${move} ${angleLabel}`}
                >
                  {move} {angleLabel}
                </p>
              </div>
            </div>
          ) : (
            <div className="solving-cube-guide-shell">
              <div className="solving-cube-guide-viewport">
                <SolvingCubeGuide
                  facelet={facelet}
                  moves={moves}
                  currentIndex={currentIndex}
                  wrongMove={wrongMove}
                  compact={false}
                />
              </div>
              <div className="solving-cube-guide-move-slot solving-cube-guide-move-slot--overlay-top">
                <p className="solving-move-hint-move" aria-label={`${move} ${angleLabel}`}>
                  {move} {angleLabel}
                </p>
              </div>
            </div>
          )}
        </div>

        {wrong && (
          <p className="solving-move-hint-status">Wrong turn — need {move}</p>
        )}
      </div>
    </div>
  );
}
