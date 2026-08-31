import type { CubePose, DetectedFace, FrameResult, Move, StickerColor } from '../../types';
import { identifyFaceFromCenter } from '../cube/colors';
import { createGrayMat, detectCubeCorners, detectCubeFace } from './cubeDetector';
import { OpticalFlowTracker } from './opticalFlowTracker';
import { estimatePoseFromCorners } from './poseTracker';
import { PoseSmoother } from './poseSmoother';
import { RotationDetector } from './rotationDetector';
import { measureColorLearnSpot } from './colorReference';
import { sampleVisibleFaceColors } from './multiFaceSampler';
import { getVisibleFaces } from './visibleFaces';
import { alignPoseToTrackedQuad } from './poseAlign';
import { sampleColorsFromQuad } from './quadColorSampler';
import { computeDeformationScore } from './quadShapeMetrics';
import { drawCameraFrame } from './selfieView';
import { GUIDE_SIZE_RATIO } from './roi';
import { isKnownColor, toStickerColors } from './readColorUtils';

const LOST_TRACKING_THRESHOLD = 30;

const EMPTY_RESULT: FrameResult = {
  pose: null,
  detectedFace: null,
  rotationMove: null,
  rotationProgress: 0,
  wrongMove: null,
  visibleFaceColors: {},
  shapeMetrics: null,
};

export class FrameProcessor {
  private rotationDetector = new RotationDetector();
  private flowTracker = new OpticalFlowTracker();
  private poseSmoother = new PoseSmoother();
  private trackingEnabled = false;
  private processCanvas: HTMLCanvasElement;
  private processCtx: CanvasRenderingContext2D;
  private lastColors: import('../../types').ReadColor[] | null = null;
  private expectedMove: Move | null = null;
  private solvingScanMode = false;
  private scanGuideRatio = GUIDE_SIZE_RATIO;
  private lastSolvingPose: CubePose | null = null;
  private solvingLostFrames = 0;
  private solvingReseedPending = false;

  constructor() {
    this.processCanvas = document.createElement('canvas');
    const ctx = this.processCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.processCtx = ctx;
  }

  enableTracking(): void {
    this.trackingEnabled = true;
    this.rotationDetector.reset();
    this.flowTracker.reset();
    this.poseSmoother.reset();
  }

  disableTracking(): void {
    this.trackingEnabled = false;
    this.rotationDetector.reset();
    this.flowTracker.reset();
    this.poseSmoother.reset();
    this.lastColors = null;
  }

  setSolvingScanMode(on: boolean): void {
    this.solvingScanMode = on;
    if (!on) {
      this.lastSolvingPose = null;
      this.solvingLostFrames = 0;
    }
  }

  setScanGuideRatio(ratio: number): void {
    this.scanGuideRatio = ratio;
  }

  /** @deprecated use enableSolvingTracking */
  enableSolvingTracking(pose: CubePose): void {
    this.lastSolvingPose = pose;
    this.solvingLostFrames = 0;
    this.lastColors = null;
    this.poseSmoother.reset();
    this.poseSmoother.update(pose);
    this.rotationDetector.sync(pose.rotationMatrix);
    this.flowTracker.seed(pose.corners);
    this.solvingReseedPending = true;
  }

  /** @deprecated use enableSolvingTracking */
  seedSolvingPose(pose: CubePose): void {
    this.enableSolvingTracking(pose);
  }

  private guideRatio(): number {
    return this.solvingScanMode ? GUIDE_SIZE_RATIO : this.scanGuideRatio;
  }

  setExpectedMove(move: Move | null): void {
    if (move === this.expectedMove) return;
    this.expectedMove = move;
    this.rotationDetector.setExpectedMove(move);
  }

  syncPose(pose: CubePose): void {
    this.rotationDetector.sync(pose.rotationMatrix);
  }

  getFrameCanvas(): HTMLCanvasElement {
    return this.processCanvas;
  }

  private buildShapeMetrics(
    pose: CubePose,
    width: number,
    height: number,
  ): import('../../types').QuadShapeMetrics {
    return computeDeformationScore(
      pose.corners,
      pose,
      width,
      height,
      this.flowTracker.getLastFlowVectors(),
    );
  }

  captureFrame(video: HTMLVideoElement): boolean {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return false;
    this.processCanvas.width = width;
    this.processCanvas.height = height;
    drawCameraFrame(this.processCtx, video, width, height);
    return true;
  }

  getColorLearnSample(
    frameWidth: number,
    frameHeight: number,
    expected: import('../../types').StickerColor,
  ) {
    return measureColorLearnSpot(
      this.processCanvas,
      frameWidth,
      frameHeight,
      expected,
      this.scanGuideRatio,
    );
  }

  process(video: HTMLVideoElement): FrameResult {
    const width = video.videoWidth;
    const height = video.videoHeight;

    if (!width || !height) {
      return { ...EMPTY_RESULT };
    }

    this.processCanvas.width = width;
    this.processCanvas.height = height;
    drawCameraFrame(this.processCtx, video, width, height);

    try {
      if (this.solvingScanMode) {
        return this.processSolving(width, height);
      }
      if (this.trackingEnabled) {
        const tracked = this.processWithTracking(width, height);
        return tracked;
      }
      return this.processDetectionOnly(width, height);
    } catch {
      return { ...EMPTY_RESULT };
    }
  }

  private processSolving(width: number, height: number): FrameResult {
    if (this.solvingReseedPending) {
      const fresh = detectCubeFace(this.processCanvas, width, height, GUIDE_SIZE_RATIO, true);
      if (fresh) this.flowTracker.seed(fresh.pose.corners);
      this.solvingReseedPending = false;
    }

    const guideFace = detectCubeFace(this.processCanvas, width, height, GUIDE_SIZE_RATIO, true);
    const guideCorners = guideFace?.pose.corners ?? null;
    const gray = createGrayMat(this.processCanvas);
    const detectedCorners =
      guideCorners ?? detectCubeCorners(this.processCanvas, width, height, GUIDE_SIZE_RATIO);
    const corners = this.flowTracker.update(gray, detectedCorners);
    gray.delete();

    if (corners) {
      const quadColors =
        guideFace?.colors ??
        sampleColorsFromQuad(this.processCanvas, width, height, corners);
      const hintFace = isKnownColor(quadColors?.[4] ?? '?')
        ? identifyFaceFromCenter(quadColors![4] as StickerColor)
        : guideFace?.pose.visibleFace ?? this.lastSolvingPose?.visibleFace ?? null;

      let pose = guideFace
        ? this.poseSmoother.update({ ...guideFace.pose, corners })
        : estimatePoseFromCorners(corners, width, height, hintFace);
      if (hintFace) pose = { ...pose, visibleFace: hintFace };
      if (!pose.visibleFace) {
        const visible = getVisibleFaces(pose);
        if (visible[0]) pose = { ...pose, visibleFace: visible[0] };
      }
      const lostFrames = this.flowTracker.getLostFrames();
      pose.confidence = guideFace ? 0.88 : Math.max(0.45, 0.85 - lostFrames * 0.012);
      pose = this.poseSmoother.update(pose);
      pose = alignPoseToTrackedQuad(pose, width, height);

      if (quadColors) this.lastColors = quadColors;
      this.lastSolvingPose = pose;
      this.solvingLostFrames = 0;

      const aligned = alignPoseToTrackedQuad(pose, width, height);
      const visibleFaceColors = sampleVisibleFaceColors(
        this.processCanvas,
        aligned,
        width,
        height,
      );
      if (quadColors && pose.visibleFace) {
        visibleFaceColors[pose.visibleFace] = toStickerColors(quadColors);
      }
      const rotation = this.rotationDetector.update(pose.rotationMatrix);
      const detectedFace: DetectedFace | null = quadColors
        ? { colors: quadColors, pose: aligned }
        : this.lastColors
          ? { colors: this.lastColors, pose: aligned }
          : null;

      return {
        pose: aligned,
        detectedFace,
        rotationMove: rotation.completedMove,
        rotationProgress: rotation.progress,
        wrongMove: rotation.wrongMove,
        visibleFaceColors,
        shapeMetrics: this.buildShapeMetrics(aligned, width, height),
      };
    }

    const fallbackFace = detectCubeFace(this.processCanvas, width, height, GUIDE_SIZE_RATIO, true);
    if (fallbackFace) {
      this.lastColors = fallbackFace.colors;
      let pose = this.poseSmoother.update(fallbackFace.pose);
      pose = alignPoseToTrackedQuad(pose, width, height);
      this.flowTracker.seed(pose.corners);
      this.lastSolvingPose = pose;
      this.solvingLostFrames = 0;

      const aligned = alignPoseToTrackedQuad(pose, width, height);
      const visibleFaceColors = sampleVisibleFaceColors(
        this.processCanvas,
        aligned,
        width,
        height,
      );
      const rotation = this.rotationDetector.update(pose.rotationMatrix);

      return {
        pose: aligned,
        detectedFace: fallbackFace,
        rotationMove: rotation.completedMove,
        rotationProgress: rotation.progress,
        wrongMove: rotation.wrongMove,
        visibleFaceColors,
        shapeMetrics: this.buildShapeMetrics(aligned, width, height),
      };
    }

    if (this.lastSolvingPose) {
      this.solvingLostFrames++;
      if (this.solvingLostFrames <= 90) {
        const rotation = this.rotationDetector.update(this.lastSolvingPose.rotationMatrix);
        return {
          pose: this.lastSolvingPose,
          detectedFace: null,
          rotationMove: rotation.completedMove,
          rotationProgress: rotation.progress,
          wrongMove: rotation.wrongMove,
          visibleFaceColors: {},
          shapeMetrics: this.buildShapeMetrics(this.lastSolvingPose, width, height),
        };
      }
      this.lastSolvingPose = null;
    }

    return { ...EMPTY_RESULT };
  }

  private processDetectionOnly(width: number, height: number): FrameResult {
    const ratio = this.guideRatio();
    const relaxed = this.solvingScanMode;
    const detectedFace = detectCubeFace(this.processCanvas, width, height, ratio, relaxed);
    if (!detectedFace) {
      return { ...EMPTY_RESULT };
    }
    this.lastColors = detectedFace.colors;
    const visibleFaceColors = sampleVisibleFaceColors(
      this.processCanvas,
      detectedFace.pose,
      width,
      height,
    );
    return {
      pose: detectedFace.pose,
      detectedFace,
      rotationMove: null,
      rotationProgress: 0,
      wrongMove: null,
      visibleFaceColors,
      shapeMetrics: null,
    };
  }

  private processWithTracking(width: number, height: number): FrameResult {
    const detectedCorners = detectCubeCorners(
      this.processCanvas,
      width,
      height,
      this.guideRatio(),
    );
    const gray = createGrayMat(this.processCanvas);
    const corners = this.flowTracker.update(gray, detectedCorners);
    gray.delete();

    if (!corners) {
      return { ...EMPTY_RESULT };
    }

    let colors = this.lastColors;
    if (detectedCorners) {
      const face = detectCubeFace(this.processCanvas, width, height);
      if (face) {
        colors = face.colors;
        this.lastColors = colors;
      }
    }

    const hintFace =
      colors?.[4] !== undefined && isKnownColor(colors[4])
        ? identifyFaceFromCenter(colors[4])
        : null;
    let pose = estimatePoseFromCorners(corners, width, height, hintFace);
    if (hintFace) pose = { ...pose, visibleFace: hintFace };
    const lostFrames = this.flowTracker.getLostFrames();
    pose.confidence = detectedCorners
      ? 0.85
      : Math.max(0.35, 0.85 - lostFrames * 0.01);
    pose = this.poseSmoother.update(pose);

    const detectedFace: DetectedFace | null = colors ? { colors, pose } : null;

    const rotation = this.rotationDetector.update(pose.rotationMatrix);
    const visibleFaceColors = sampleVisibleFaceColors(
      this.processCanvas,
      pose,
      width,
      height,
    );

    return {
      pose,
      detectedFace,
      rotationMove: rotation.completedMove,
      rotationProgress: rotation.progress,
      wrongMove: rotation.wrongMove,
      visibleFaceColors,
      shapeMetrics: this.buildShapeMetrics(pose, width, height),
    };
  }

  isTrackingLost(): boolean {
    return this.flowTracker.getLostFrames() > LOST_TRACKING_THRESHOLD;
  }

  readStableFace(
    video: HTMLVideoElement,
    samples = 5,
  ): { colors: StickerColor[]; pose: CubePose } | null {
    const readings: StickerColor[][] = [];
    let lastPose: CubePose | null = null;

    for (let i = 0; i < samples; i++) {
      const result = this.process(video);
      if (!result.detectedFace) return null;
      readings.push(toStickerColors(result.detectedFace.colors));
      lastPose = result.detectedFace.pose;
    }

    if (!lastPose) return null;

    const colors = majorityVote(readings);
    return { colors, pose: lastPose };
  }
}

function majorityVote(readings: StickerColor[][]): StickerColor[] {
  const result: StickerColor[] = [];
  for (let i = 0; i < 9; i++) {
    const counts = new Map<StickerColor, number>();
    for (const reading of readings) {
      const c = reading[i]!;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    let best: StickerColor = 'W';
    let bestCount = 0;
    for (const [color, count] of counts) {
      if (count > bestCount) {
        bestCount = count;
        best = color;
      }
    }
    result.push(best);
  }
  return result;
}
