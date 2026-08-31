import type { DetectedFace, Point2D, StickerColor } from '../../types';
import type { OpenCVMat } from '../../types/opencv';
import {
  isRegionCubeLike,
  measureColorVariance,
  sampleGuideRegionCapture,
  sampleGuideRegionColors,
} from './guidedDetector';
import { estimatePoseFromCorners, orderCorners } from './poseTracker';
import { identifyFaceFromCenter } from '../cube/colors';
import { isKnownColor, toStickerColors } from './readColorUtils';
import { getGuideSquare, guideToCorners, translateCorners, GUIDE_SIZE_RATIO } from './roi';
import { sampleColorsFromQuad } from './quadColorSampler';

function isSquareLike(corners: [Point2D, Point2D, Point2D, Point2D]): boolean {
  const d = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y);
  const sides = [
    d(corners[0], corners[1]),
    d(corners[1], corners[2]),
    d(corners[2], corners[3]),
    d(corners[3], corners[0]),
  ];
  const avg = sides.reduce((a, b) => a + b, 0) / 4;
  if (avg < 1) return false;
  return sides.every((s) => Math.abs(s - avg) / avg < 0.55);
}

function findBestQuad(
  contours: { size(): number; get(i: number): OpenCVMat; delete(): void },
  cv: typeof window.cv,
  frameWidth: number,
  frameHeight: number,
): [Point2D, Point2D, Point2D, Point2D] | null {
  const frameArea = frameWidth * frameHeight;
  let bestCorners: [Point2D, Point2D, Point2D, Point2D] | null = null;
  let bestScore = 0;

  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const area = cv.contourArea(contour);
    if (area < frameArea * 0.02) {
      contour.delete();
      continue;
    }

    const peri = cv.arcLength(contour, true);
    for (const eps of [0.02, 0.035, 0.05, 0.08]) {
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, eps * peri, true);

      if (approx.rows === 4) {
        const points: Point2D[] = [];
        for (let j = 0; j < 4; j++) {
          points.push({ x: approx.data32S[j * 2]!, y: approx.data32S[j * 2 + 1]! });
        }
        const ordered = orderCorners(points);
        if (ordered && isSquareLike(ordered) && area > bestScore) {
          bestScore = area;
          bestCorners = ordered;
        }
      }
      approx.delete();
    }
    contour.delete();
  }

  return bestCorners;
}

function tryOpenCVDetect(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): [Point2D, Point2D, Point2D, Point2D] | null {
  if (!window.cv?.Mat) return null;

  try {
    const cv = window.cv;
    const src = cv.imread(canvas);
    const rgb = new cv.Mat();
    const gray = new cv.Mat();
    const blurred = new cv.Mat();
    const edges = new cv.Mat();
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();

    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
    cv.cvtColor(rgb, gray, cv.COLOR_RGB2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 20, 80);
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const result = findBestQuad(contours, cv, width, height);

    src.delete();
    rgb.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();

    return result;
  } catch {
    return null;
  }
}

/** 가이드 사각형 기반 검출 — OpenCV 실패 시 항상 시도 */
function tryGuidedDetect(
  sourceCanvas: HTMLCanvasElement,
  frameWidth: number,
  frameHeight: number,
): { corners: [Point2D, Point2D, Point2D, Point2D]; colors: StickerColor[] } | null {
  const guide = getGuideSquare(frameWidth, frameHeight);
  const colors = sampleGuideRegionColors(sourceCanvas, guide);
  const variance = measureColorVariance(sourceCanvas, guide);

  if (!isRegionCubeLike(colors, variance)) {
    return null;
  }

  return { corners: guideToCorners(guide), colors: toStickerColors(colors) };
}

export function detectCubeCorners(
  sourceCanvas: HTMLCanvasElement,
  frameWidth: number,
  frameHeight: number,
  guideRatio?: number,
): [Point2D, Point2D, Point2D, Point2D] | null {
  const guide = getGuideSquare(frameWidth, frameHeight, guideRatio);

  const roiCanvas = document.createElement('canvas');
  roiCanvas.width = guide.size;
  roiCanvas.height = guide.size;
  const roiCtx = roiCanvas.getContext('2d');
  if (roiCtx) {
    roiCtx.drawImage(
      sourceCanvas,
      guide.x,
      guide.y,
      guide.size,
      guide.size,
      0,
      0,
      guide.size,
      guide.size,
    );
    const roiCorners = tryOpenCVDetect(roiCanvas, guide.size, guide.size);
    if (roiCorners) {
      return translateCorners(roiCorners, guide.x, guide.y);
    }
  }

  const fullCorners = tryOpenCVDetect(sourceCanvas, frameWidth, frameHeight);
  if (fullCorners) return fullCorners;

  const guided = tryGuidedDetect(sourceCanvas, frameWidth, frameHeight);
  return guided?.corners ?? null;
}

const SOLVING_CORNER_RATIOS = [GUIDE_SIZE_RATIO, 0.35, 0.42];

/** 풀이 단계 — 여러 스케일 + 전체 프레임에서 코너 검출 */
export function detectSolvingCorners(
  sourceCanvas: HTMLCanvasElement,
  frameWidth: number,
  frameHeight: number,
): [Point2D, Point2D, Point2D, Point2D] | null {
  for (const ratio of SOLVING_CORNER_RATIOS) {
    const corners = detectCubeCorners(sourceCanvas, frameWidth, frameHeight, ratio);
    if (corners) return corners;
  }
  return tryOpenCVDetect(sourceCanvas, frameWidth, frameHeight);
}

export function detectCubeFace(
  sourceCanvas: HTMLCanvasElement,
  frameWidth: number,
  frameHeight: number,
  guideRatio?: number,
  relaxed = false,
): DetectedFace | null {
  const guide = getGuideSquare(frameWidth, frameHeight, guideRatio);
  const capture = sampleGuideRegionCapture(sourceCanvas, guide);
  const colors = capture.colors;
  const variance = measureColorVariance(sourceCanvas, guide);

  const cubeLike = isRegionCubeLike(colors, variance);
  const center = colors[4];
  const centerOk = isKnownColor(center) && Boolean(identifyFaceFromCenter(center));
  const uniqueColors = new Set(colors.filter((c) => c !== '?')).size;
  const relaxedOk =
    relaxed &&
    colors.length === 9 &&
    (centerOk || uniqueColors >= 3) &&
    variance >= 40;
  if (!cubeLike && !relaxedOk) {
    return null;
  }

  const corners = detectCubeCorners(sourceCanvas, frameWidth, frameHeight, guideRatio);
  const hintFace = isKnownColor(colors[4]) ? identifyFaceFromCenter(colors[4]) : null;
  const pose = estimatePoseFromCorners(
    corners ?? guideToCorners(guide),
    frameWidth,
    frameHeight,
    hintFace,
  );
  pose.confidence = corners ? 0.85 : 0.7;

  return { colors, medians: capture.medians, pose };
}

/** 풀이 단계 — 실제 코너 쿼드에서 색 샘플링 (가이드 워프 대신) */
export function detectSolvingFace(
  sourceCanvas: HTMLCanvasElement,
  frameWidth: number,
  frameHeight: number,
): DetectedFace | null {
  const corners = detectSolvingCorners(sourceCanvas, frameWidth, frameHeight);
  if (!corners) return null;

  const colors = sampleColorsFromQuad(sourceCanvas, frameWidth, frameHeight, corners);
  if (!colors || colors.length !== 9) return null;

  const hintFace = isKnownColor(colors[4]) ? identifyFaceFromCenter(colors[4]) : null;
  const pose = estimatePoseFromCorners(corners, frameWidth, frameHeight, hintFace);
  pose.confidence = 0.8;
  if (hintFace) pose.visibleFace = hintFace;

  return { colors, pose };
}

export function createGrayMat(sourceCanvas: HTMLCanvasElement): import('../../types/opencv').OpenCVMat {
  const cv = window.cv;
  const src = cv.imread(sourceCanvas);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  src.delete();
  return gray;
}
