import { useEffect, useRef } from 'react';
import { runConfetti } from '../lib/ui/confetti';

interface SolvedCelebrationProps {
  visible: boolean;
  onScanAgain?: () => void;
}

export function SolvedCelebration({ visible, onScanAgain }: SolvedCelebrationProps) {
  const confettiRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!visible) return;
    const canvas = confettiRef.current;
    if (!canvas) return undefined;
    return runConfetti(canvas, { continuous: true });
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="solved-celebration" aria-live="polite">
      <canvas ref={confettiRef} className="solved-celebration-confetti" aria-hidden />
      <div className="solved-celebration-content">
        <p className="solved-celebration-title">You made it!</p>
        {onScanAgain && (
          <button type="button" className="error-button secondary" onClick={onScanAgain}>
            Scan again
          </button>
        )}
      </div>
    </div>
  );
}
