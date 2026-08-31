import type { Move, StickerColor } from '../types';
import { getMoveRotationDisplay } from '../lib/cube/moveRotationDisplay';
import { FaceColorGrid } from './FaceColorGrid';

interface SolvingGuideOverlayProps {
  visible: boolean;
  move: Move;
  faceColors: StickerColor[];
  wrongMove: Move | null;
  onSkip?: () => void;
}

export function SolvingGuideOverlay({
  visible,
  move,
  faceColors,
  wrongMove,
  onSkip,
}: SolvingGuideOverlayProps) {
  if (!visible) return null;

  const display = getMoveRotationDisplay(move, true);
  const wrong = Boolean(wrongMove);

  return (
    <div className="solving-guide-overlay" aria-hidden="true">
      {onSkip && (
        <button type="button" className="solving-skip" onClick={onSkip}>
          Skip
        </button>
      )}

      <div className={`solving-guide-card${wrong ? ' solving-guide-card--wrong' : ''}`}>
        <div className="solving-guide-stage">
          <FaceColorGrid colors={faceColors} variant="solving" orientation="mirror" />
          <div className={`solving-guide-rotation-badge${wrong ? ' solving-guide-rotation-badge--wrong' : ''}`}>
            <span className="solving-guide-rotation-symbol">{display.symbol}</span>
            <span className="solving-guide-rotation-turns">{display.turns}</span>
            <span className="solving-guide-rotation-direction">{display.direction}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
