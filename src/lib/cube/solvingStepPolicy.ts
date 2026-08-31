import type { Move } from '../../types';
import type { MoveColorEvaluation } from './moveColorProgress';
import {
  createLayerTurnShapeState,
  resetLayerTurnShapeState,
  updateLayerTurnShape,
  type LayerTurnShapeState,
} from '../vision/layerTurnShape';

export interface SolvingStepState {
  layerTurnShape: LayerTurnShapeState;
  colorCompleteStable: number;
  progressHighStable: number;
}

export function createSolvingStepState(): SolvingStepState {
  return {
    layerTurnShape: createLayerTurnShapeState(),
    colorCompleteStable: 0,
    progressHighStable: 0,
  };
}

export function resetSolvingStepState(state: SolvingStepState): void {
  resetLayerTurnShapeState(state.layerTurnShape);
  state.colorCompleteStable = 0;
  state.progressHighStable = 0;
}

export interface SolvingFrameInput {
  colorEval: MoveColorEvaluation | null;
  scanMatch: number;
  deformationScore: number;
  sawPreMoveAlignment: boolean;
  rejectedWholeCube: boolean;
  wrongMove: Move | null;
  rigidReposition: boolean;
  layerTurnDeform: boolean;
  holdFaceAligned: boolean;
}

export interface SolvingFrameResult {
  moveComplete: boolean;
  rotationProgress: number;
  handMotionDetected: boolean;
  layerTurnValidated: boolean;
  sawShapeBreak: boolean;
  layerTurnInProgress: boolean;
  colorReady: boolean;
  colorCompleteStable: number;
}

const STABLE_FRAMES_TO_ADVANCE = 2;
const HIGH_PROGRESS_FRAMES = 4;

export function evaluateSolvingFrame(
  state: SolvingStepState,
  input: SolvingFrameInput,
): SolvingFrameResult {
  const colorProgress = input.colorEval?.progress ?? 0;

  const alignedForBaseline =
    input.scanMatch >= 0.42 &&
    colorProgress < 0.25 &&
    !input.sawPreMoveAlignment;

  const shapeUpdate = updateLayerTurnShape(state.layerTurnShape, {
    deformationScore: input.deformationScore,
    aligned: alignedForBaseline,
    layerTurnDeform: input.layerTurnDeform,
    rigidReposition: input.rigidReposition,
  });

  const handMotionDetected = Boolean(
    input.rigidReposition ||
      (input.rejectedWholeCube &&
        colorProgress < 0.35 &&
        !shapeUpdate.sawShapeBreak),
  );

  const highTurnProgress =
    input.holdFaceAligned &&
    shapeUpdate.sawShapeBreak &&
    input.sawPreMoveAlignment &&
    (input.layerTurnDeform || colorProgress >= 0.5) &&
    !input.rigidReposition &&
    colorProgress >= 0.65;

  if (highTurnProgress) {
    state.progressHighStable++;
  } else {
    state.progressHighStable = 0;
  }

  const colorReady =
    input.holdFaceAligned &&
    !input.rigidReposition &&
    !input.rejectedWholeCube &&
    (Boolean(input.colorEval?.completed) ||
      (highTurnProgress && state.progressHighStable >= HIGH_PROGRESS_FRAMES));

  const layerTurnValidated =
    input.holdFaceAligned &&
    shapeUpdate.sawShapeBreak &&
    shapeUpdate.settledAfterBreak &&
    (Boolean(input.colorEval?.completed) || colorProgress >= 0.68);

  const blockedByWrongMove = Boolean(input.wrongMove);
  const moveComplete = layerTurnValidated && colorReady && !blockedByWrongMove;

  const turnActivity =
    input.holdFaceAligned &&
    (shapeUpdate.sawShapeBreak ||
      input.sawPreMoveAlignment ||
      shapeUpdate.deformationActive);

  const rotationProgress = moveComplete
    ? Math.max(colorProgress, 0.95)
    : layerTurnValidated
      ? colorProgress
      : shapeUpdate.sawShapeBreak
        ? Math.min(colorProgress, 0.88)
        : turnActivity
          ? Math.min(colorProgress, 0.28)
          : 0;

  if (moveComplete) {
    state.colorCompleteStable++;
  } else {
    state.colorCompleteStable = 0;
  }

  const shouldAdvance =
    moveComplete && state.colorCompleteStable >= STABLE_FRAMES_TO_ADVANCE;

  return {
    moveComplete: shouldAdvance,
    rotationProgress,
    handMotionDetected,
    layerTurnValidated,
    sawShapeBreak: shapeUpdate.sawShapeBreak,
    layerTurnInProgress: shapeUpdate.deformationActive,
    colorReady,
    colorCompleteStable: state.colorCompleteStable,
  };
}
