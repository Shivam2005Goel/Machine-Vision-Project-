import Cube from 'cubejs';
import { describe, expect, it } from 'vitest';
import type { Move } from '../../types';
import { buildFaceletFromMap, faceletToFaceMap } from './state';
import { detectWrongMoveFromColors } from './detectWrongMove';
import { getMoveHoldFace } from './moveGuidanceView';
import {
  applyMoveToFacelet,
  createMoveColorTrackerState,
  evaluateThreeFaceMoveProgress,
  getFaceletFaceColors,
} from './moveColorProgress';
import {
  createSolvingStepState,
  evaluateSolvingFrame,
  type SolvingFrameInput,
} from './solvingStepPolicy';
import {
  computeDeformationScore,
  isLayerTurnDeformation,
  isRigidCubeReposition,
} from '../vision/quadShapeMetrics';
import type { CubePose, Point2D } from '../../types';

function squareCorners(cx: number, cy: number, size: number): [Point2D, Point2D, Point2D, Point2D] {
  const h = size / 2;
  return [
    { x: cx - h, y: cy - h },
    { x: cx + h, y: cy - h },
    { x: cx + h, y: cy + h },
    { x: cx - h, y: cy + h },
  ];
}

function skewedCorners(cx: number, cy: number, size: number): [Point2D, Point2D, Point2D, Point2D] {
  const h = size / 2;
  return [
    { x: cx - h, y: cy - h },
    { x: cx + h * 0.75, y: cy - h * 1.15 },
    { x: cx + h * 1.2, y: cy + h * 0.9 },
    { x: cx - h * 0.85, y: cy + h },
  ];
}

function deformScore(corners: [Point2D, Point2D, Point2D, Point2D]): number {
  return metricsFromCorners(corners, [
    { x: 2, y: 0 },
    { x: 8, y: 1 },
    { x: 1, y: 7 },
    { x: -3, y: 2 },
  ]).deformationScore;
}

function metricsFromCorners(
  corners: [Point2D, Point2D, Point2D, Point2D],
  flow: Point2D[],
) {
  const pose: CubePose = {
    corners,
    center: { x: 200, y: 200 },
    size: 120,
    rotationMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    translation: [0, 0, 360],
    confidence: 0.9,
    visibleFace: 'R',
  };
  return computeDeformationScore(corners, pose, 400, 400, flow);
}

function rigidRepositionFrame(): Pick<
  SolvingFrameInput,
  'deformationScore' | 'rigidReposition' | 'layerTurnDeform'
> {
  const metrics = metricsFromCorners(squareCorners(200, 200, 140), [
    { x: 5, y: 2 },
    { x: 5, y: 2 },
    { x: 5, y: 2 },
    { x: 5, y: 2 },
  ]);
  return {
    deformationScore: metrics.deformationScore,
    rigidReposition: isRigidCubeReposition(metrics),
    layerTurnDeform: isLayerTurnDeformation(metrics),
  };
}

function layerTurnFrame(): Pick<
  SolvingFrameInput,
  'deformationScore' | 'rigidReposition' | 'layerTurnDeform'
> {
  const metrics = metricsFromCorners(skewedCorners(200, 200, 140), [
    { x: 2, y: 0 },
    { x: 9, y: 1 },
    { x: 0, y: 8 },
    { x: -4, y: 2 },
  ]);
  return {
    deformationScore: metrics.deformationScore,
    rigidReposition: isRigidCubeReposition(metrics),
    layerTurnDeform: isLayerTurnDeformation(metrics),
  };
}

function runSequence(inputs: SolvingFrameInput[]) {
  const state = createSolvingStepState();
  const results = inputs.map((input) => evaluateSolvingFrame(state, input));
  return { state, results, last: results[results.length - 1]! };
}

function colorEvalFor(
  facelet: string,
  expected: Move,
  holdFace: 'U' | 'R' | 'F' | 'D' | 'L' | 'B',
  applied: Move | null,
  tracker = createMoveColorTrackerState(),
) {
  tracker.requiredHoldFace = getMoveHoldFace(expected);
  tracker.stepAnchorFace = holdFace;
  const colors = getFaceletFaceColors(
    applied ? applyMoveToFacelet(facelet, applied) : facelet,
    holdFace,
  );
  return evaluateThreeFaceMoveProgress(
    facelet,
    expected,
    { [holdFace]: colors },
    holdFace,
    tracker,
  );
}

describe('move guidance view', () => {
  it('uses side hold face instead of turning face', () => {
    expect(getMoveHoldFace('R')).toBe('F');
    expect(getMoveHoldFace('U')).toBe('F');
    expect(getMoveHoldFace('F')).toBe('R');
    expect(getMoveHoldFace('B')).toBe('L');
  });
});

describe('layer deformation metrics', () => {
  it('scores rigid square lower than skewed layer-turn quad', () => {
    const rigid = deformScore(squareCorners(200, 200, 140));
    const skewed = deformScore(skewedCorners(200, 200, 140));
    expect(skewed).toBeGreaterThan(rigid + 0.08);
  });

  it('classifies uniform flow as rigid reposition, divergent flow as layer turn', () => {
    const rigid = rigidRepositionFrame();
    const layer = layerTurnFrame();
    expect(rigid.rigidReposition).toBe(true);
    expect(rigid.layerTurnDeform).toBe(false);
    expect(layer.layerTurnDeform).toBe(true);
    expect(layer.rigidReposition).toBe(false);
  });
});

describe('solving step policy simulation', () => {
  const facelet = Cube.random().asString();
  const expected: Move = 'R';
  const holdFace = getMoveHoldFace(expected);
  const tracker = createMoveColorTrackerState();

  it('1. completes step after shape break + correct colors with hold face aligned', () => {
    const before = colorEvalFor(facelet, expected, holdFace, null, tracker);
    const alignedFrames: SolvingFrameInput[] = Array.from({ length: 4 }, () => ({
      colorEval: before,
      scanMatch: 0.82,
      deformationScore: deformScore(squareCorners(200, 200, 140)),
      sawPreMoveAlignment: tracker.sawPreMoveAlignment,
      rejectedWholeCube: false,
      wrongMove: null,
      rigidReposition: false,
      layerTurnDeform: false,
      holdFaceAligned: true,
    }));

    const breakingFrames: SolvingFrameInput[] = Array.from({ length: 4 }, () => ({
      colorEval: colorEvalFor(facelet, expected, holdFace, null, tracker),
      scanMatch: 0.72,
      ...layerTurnFrame(),
      sawPreMoveAlignment: true,
      rejectedWholeCube: false,
      wrongMove: null,
      holdFaceAligned: true,
    }));

    const after = colorEvalFor(facelet, expected, holdFace, expected, tracker);
    expect(after.progress).toBeGreaterThan(0.55);

    const settleFrames: SolvingFrameInput[] = Array.from({ length: 6 }, () => ({
      colorEval: after,
      scanMatch: 0.78,
      deformationScore: 0.06,
      sawPreMoveAlignment: true,
      rejectedWholeCube: false,
      wrongMove: null,
      rigidReposition: false,
      layerTurnDeform: false,
      holdFaceAligned: true,
    }));

    const { last } = runSequence([...alignedFrames, ...breakingFrames, ...settleFrames]);
    expect(last.sawShapeBreak).toBe(true);
    expect(last.layerTurnValidated).toBe(true);
    expect(last.colorReady).toBe(true);
    expect(last.moveComplete).toBe(true);
  });

  it('2. does not complete when only repositioning whole cube (no shape break)', () => {
    const noTurnEval = {
      progress: 0,
      completed: false,
      visibleFace: holdFace,
      comparisonFace: null,
      rejectedWholeCube: true,
    };

    const frames: SolvingFrameInput[] = Array.from({ length: 12 }, () => ({
      colorEval: noTurnEval,
      scanMatch: 0.35,
      ...rigidRepositionFrame(),
      sawPreMoveAlignment: false,
      rejectedWholeCube: true,
      wrongMove: null,
      holdFaceAligned: false,
    }));

    const { last } = runSequence(frames);
    expect(last.sawShapeBreak).toBe(false);
    expect(last.moveComplete).toBe(false);
    expect(last.handMotionDetected).toBe(true);
  });

  it('3. blocks completion and flags wrong move for opposite turn', () => {
    const wrongColors = {
      R: getFaceletFaceColors(applyMoveToFacelet(facelet, "R'"), 'R'),
      U: getFaceletFaceColors(applyMoveToFacelet(facelet, "R'"), 'U'),
      F: getFaceletFaceColors(applyMoveToFacelet(facelet, "R'"), 'F'),
    };

    const wrongMove = detectWrongMoveFromColors(
      facelet,
      expected,
      wrongColors,
      holdFace,
      true,
    );
    expect(wrongMove).toBe("R'");

    const tracker3 = createMoveColorTrackerState();
    const wrongEval = colorEvalFor(facelet, expected, holdFace, "R'", tracker3);

    const frames: SolvingFrameInput[] = [
      ...Array.from({ length: 3 }, () => ({
        colorEval: colorEvalFor(facelet, expected, holdFace, null, tracker3),
        scanMatch: 0.8,
        deformationScore: deformScore(squareCorners(200, 200, 140)),
        sawPreMoveAlignment: tracker3.sawPreMoveAlignment,
        rejectedWholeCube: false,
        wrongMove: null,
        rigidReposition: false,
        layerTurnDeform: false,
        holdFaceAligned: true,
      })),
      ...Array.from({ length: 4 }, () => ({
        colorEval: wrongEval,
        scanMatch: 0.7,
        ...layerTurnFrame(),
        sawPreMoveAlignment: true,
        rejectedWholeCube: false,
        wrongMove: "R'" as Move,
        holdFaceAligned: true,
      })),
      ...Array.from({ length: 5 }, () => ({
        colorEval: wrongEval,
        scanMatch: 0.75,
        deformationScore: deformScore(squareCorners(200, 200, 140)),
        sawPreMoveAlignment: true,
        rejectedWholeCube: false,
        wrongMove: "R'" as Move,
        rigidReposition: false,
        layerTurnDeform: false,
        holdFaceAligned: true,
      })),
    ];

    const { last } = runSequence(frames);
    expect(last.sawShapeBreak).toBe(true);
    expect(last.moveComplete).toBe(false);
  });

  it('4. shows 0% turn progress when idle (no hold-face alignment)', () => {
    const noisyEval = {
      progress: 0.32,
      completed: false,
      visibleFace: 'R' as const,
      comparisonFace: null,
      rejectedWholeCube: false,
    };

    const { last } = runSequence(
      Array.from({ length: 5 }, () => ({
        colorEval: noisyEval,
        scanMatch: 0.55,
        deformationScore: 0.05,
        sawPreMoveAlignment: false,
        rejectedWholeCube: false,
        wrongMove: null,
        rigidReposition: false,
        layerTurnDeform: false,
        holdFaceAligned: false,
      })),
    );

    expect(last.rotationProgress).toBe(0);
    expect(last.sawShapeBreak).toBe(false);
  });

  it('5. does not flag rigid reposition when cube is still', () => {
    const metrics = metricsFromCorners(squareCorners(200, 200, 140), [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect(metrics.flowMagnitude).toBe(0);
    expect(isRigidCubeReposition(metrics)).toBe(false);
  });

  it('6. does not complete when hold face is wrong even with high color progress', () => {
    const after = colorEvalFor(facelet, expected, holdFace, expected, tracker);
    const frames: SolvingFrameInput[] = Array.from({ length: 8 }, () => ({
      colorEval: after,
      scanMatch: 0.8,
      deformationScore: 0.06,
      sawPreMoveAlignment: true,
      rejectedWholeCube: false,
      wrongMove: null,
      rigidReposition: false,
      layerTurnDeform: false,
      holdFaceAligned: false,
    }));

    const { last } = runSequence(frames);
    expect(last.moveComplete).toBe(false);
    expect(last.rotationProgress).toBe(0);
  });

  it('7. faceletToFaceMap round-trips buildFaceletFromMap', () => {
    const scrambled = Cube.random().asString();
    const map = faceletToFaceMap(scrambled);
    expect(buildFaceletFromMap(map)).toBe(scrambled);

    const afterMove = applyMoveToFacelet(scrambled, 'R');
    const movedMap = faceletToFaceMap(afterMove);
    expect(buildFaceletFromMap(movedMap)).toBe(afterMove);
  });
});
