import type { AppPhase } from '../types';

const STEPS = [
  { label: 'Colour Calibration', phases: ['colorLearn'] as const },
  { label: 'Scanning', phases: ['scanReady', 'liveScan', 'computing'] as const },
  { label: 'Solution', phases: ['solving', 'solved'] as const },
] as const;

const HIDDEN_PHASES = new Set<AppPhase>(['loading', 'camera', 'error']);

function stepIndexForPhase(phase: AppPhase): number {
  const index = STEPS.findIndex((step) =>
    (step.phases as readonly AppPhase[]).includes(phase),
  );
  return index;
}

interface AppPhaseBarProps {
  phase: AppPhase;
  onGoToCalibration?: () => void;
  onGoToScanning?: () => void;
  /** Saved calibration exists — allow skipping back to scan from colour learn. */
  canReturnToScanning?: boolean;
}

export function AppPhaseBar({
  phase,
  onGoToCalibration,
  onGoToScanning,
  canReturnToScanning = false,
}: AppPhaseBarProps) {
  if (HIDDEN_PHASES.has(phase)) return null;

  const activeIndex = stepIndexForPhase(phase);
  if (activeIndex < 0) return null;

  return (
    <nav className="app-phase-bar" aria-label="Progress">
      <ol className="app-phase-bar-list">
        {STEPS.map((step, index) => {
          const state =
            index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending';
          const isCalibrationLink = index === 0 && activeIndex > 0 && Boolean(onGoToCalibration);
          const isScanningLink =
            index === 1 &&
            Boolean(onGoToScanning) &&
            (activeIndex === 2 || (activeIndex === 0 && canReturnToScanning));
          const isLink = isCalibrationLink || isScanningLink;

          const content = (
            <>
              <span className="app-phase-bar-num" aria-hidden="true">
                {index + 1}
              </span>
              <span className="app-phase-bar-label">{step.label}</span>
            </>
          );

          return (
            <li key={step.label} className="app-phase-bar-item">
              {isLink ? (
                <button
                  type="button"
                  className={`app-phase-bar-step app-phase-bar-step--${state} app-phase-bar-step--link`}
                  onClick={isScanningLink ? onGoToScanning : onGoToCalibration}
                  aria-current={state === 'active' ? 'step' : undefined}
                >
                  {content}
                </button>
              ) : (
                <div
                  className={`app-phase-bar-step app-phase-bar-step--${state}`}
                  aria-current={state === 'active' ? 'step' : undefined}
                >
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
