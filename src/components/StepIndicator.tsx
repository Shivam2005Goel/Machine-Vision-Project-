import type { AppPhase } from '../types';

interface StepIndicatorProps {
  phase: AppPhase;
  currentStep: number;
  totalSteps: number;
}

export function StepIndicator({ phase, currentStep, totalSteps }: StepIndicatorProps) {
  if (phase !== 'solving' || totalSteps === 0) return null;

  return (
    <div className="step-indicator" aria-live="polite">
      Step {currentStep} / {totalSteps}
    </div>
  );
}
