import type { Move, SolvingFeedback, StickerColor } from '../types';
import { getFaceCenterColor } from '../lib/cube/colors';
import { isDoubleMove, isPrimeMove, moveFace } from '../lib/cube/moves';
import { COLOR_HEX, COLOR_LABELS } from '../lib/vision/colorReference';

interface SolvingOverlayProps {
  visible: boolean;
  currentMove: Move;
  feedback: SolvingFeedback;
  onSkip?: () => void;
}

function rotationLabel(move: Move): string {
  if (isDoubleMove(move)) return 'Turn 180°';
  if (isPrimeMove(move)) return 'Turn counter-clockwise';
  return 'Turn clockwise';
}

function trackingHint(
  feedback: SolvingFeedback,
  targetCenter: StickerColor,
): string {
  const { tracking, rotationProgress, wrongMove, faceMatchesMove } = feedback;

  if (wrongMove) return 'Wrong direction — follow the arrow on the cube';
  if (!faceMatchesMove) {
    return `Show the ${COLOR_LABELS[targetCenter]} center to the camera`;
  }
  if (tracking === 'lost') return 'Cube lost — hold it steady in view';
  if (tracking === 'searching') return 'Hold the cube steady — follow the yellow arrow';
  if (rotationProgress > 0.15) return 'Keep turning…';
  return 'Follow the arrow on the cube';
}

export function SolvingOverlay({
  visible,
  currentMove,
  feedback,
  onSkip,
}: SolvingOverlayProps) {
  if (!visible) return null;

  const { tracking, rotationProgress, wrongMove, faceMatchesMove } = feedback;
  const targetFace = moveFace(currentMove);
  const targetCenter = getFaceCenterColor(targetFace);
  const hint = trackingHint(feedback, targetCenter);

  return (
    <div className="solving-overlay" aria-live="polite">
      <div className="solving-banner">
        <div className="solving-visual-hint">
          <span
            className="solving-center-swatch"
            style={{ background: COLOR_HEX[targetCenter] }}
            aria-hidden="true"
          />
          <p className="solving-rotation">{rotationLabel(currentMove)}</p>
        </div>
        <p className={`solving-hint${wrongMove ? ' solving-hint--wrong' : ''}`}>{hint}</p>
        {tracking === 'locked' && faceMatchesMove && (
          <div className="solving-progress" aria-hidden="true">
            <div
              className="solving-progress-fill"
              style={{ width: `${Math.round(rotationProgress * 100)}%` }}
            />
          </div>
        )}
      </div>
      {onSkip && (
        <button type="button" className="solving-skip" onClick={onSkip}>
          Skip step
        </button>
      )}
    </div>
  );
}
