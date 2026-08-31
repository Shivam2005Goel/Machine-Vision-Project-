import type { CubePose, Point2D } from '../../types';
import { projectFaceCorners } from './projectFace';

function hypot(dx: number, dy: number): number {
  return Math.hypot(dx, dy);
}

function cornerAngle(p0: Point2D, p1: Point2D, p2: Point2D): number {
  const v1x = p0.x - p1.x;
  const v1y = p0.y - p1.y;
  const v2x = p2.x - p1.x;
  const v2y = p2.y - p1.y;
  const m1 = hypot(v1x, v1y);
  const m2 = hypot(v2x, v2y);
  if (m1 < 1e-6 || m2 < 1e-6) return 90;
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (m1 * m2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function quadEdges(corners: [Point2D, Point2D, Point2D, Point2D]): number[] {
  const [tl, tr, br, bl] = corners;
  return [
    hypot(tr.x - tl.x, tr.y - tl.y),
    hypot(br.x - tr.x, br.y - tr.y),
    hypot(bl.x - br.x, bl.y - br.y),
    hypot(tl.x - bl.x, tl.y - bl.y),
  ];
}

export interface QuadShapeMetrics {
  aspectRatio: number;
  angleDeviation: number;
  projectedResidual: number;
  flowDivergence: number;
  flowMagnitude: number;
  deformationScore: number;
}

export function measureQuadShape(
  corners: [Point2D, Point2D, Point2D, Point2D],
): Pick<QuadShapeMetrics, 'aspectRatio' | 'angleDeviation'> {
  const edges = quadEdges(corners);
  const minEdge = Math.min(...edges);
  const maxEdge = Math.max(...edges);
  const aspectRatio = minEdge > 1 ? maxEdge / minEdge : 1;

  const [tl, tr, br, bl] = corners;
  const angles = [
    cornerAngle(bl, tl, tr),
    cornerAngle(tl, tr, br),
    cornerAngle(tr, br, bl),
    cornerAngle(br, bl, tl),
  ];
  const angleDeviation =
    angles.reduce((sum, angle) => sum + Math.abs(angle - 90), 0) / angles.length / 90;

  return { aspectRatio, angleDeviation };
}

export function projectedCornerResidual(
  pose: CubePose,
  trackedCorners: [Point2D, Point2D, Point2D, Point2D],
  frameWidth: number,
  frameHeight: number,
): number {
  const faceId = pose.visibleFace;
  if (!faceId) return 0;

  const projected = projectFaceCorners(faceId, pose, frameWidth, frameHeight);
  if (!projected) return 0;

  const scale = Math.max(12, pose.size);
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    sum += hypot(trackedCorners[i]!.x - projected[i]!.x, trackedCorners[i]!.y - projected[i]!.y);
  }
  return sum / 4 / scale;
}

function flowMagnitudes(vectors: Point2D[] | null): number[] {
  if (!vectors || vectors.length < 4) return [];
  return vectors.map((v) => hypot(v.x, v.y));
}

export function flowMeanMagnitude(vectors: Point2D[] | null): number {
  const magnitudes = flowMagnitudes(vectors);
  if (magnitudes.length === 0) return 0;
  return magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
}

export function flowDivergence(vectors: Point2D[] | null): number {
  const magnitudes = flowMagnitudes(vectors);
  if (magnitudes.length < 4) return 0;

  const mean = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
  if (mean < 0.35) return 0;

  const variance =
    magnitudes.reduce((sum, m) => sum + (m - mean) ** 2, 0) / magnitudes.length;
  const std = Math.sqrt(variance);
  return Math.min(1, std / Math.max(mean, 0.5));
}

export function computeDeformationScore(
  corners: [Point2D, Point2D, Point2D, Point2D],
  pose: CubePose | null,
  frameWidth: number,
  frameHeight: number,
  flowVectors: Point2D[] | null,
): QuadShapeMetrics {
  const { aspectRatio, angleDeviation } = measureQuadShape(corners);
  const projectedResidual = pose
    ? projectedCornerResidual(pose, corners, frameWidth, frameHeight)
    : 0;
  const divergence = flowDivergence(flowVectors);
  const magnitude = flowMeanMagnitude(flowVectors);

  const aspectTerm = Math.min(1, Math.max(0, aspectRatio - 1) / 0.45);
  const angleTerm = Math.min(1, angleDeviation / 0.35);
  const residualTerm = Math.min(1, projectedResidual / 0.22);
  const flowTerm = divergence;

  const deformationScore = Math.min(
    1,
    aspectTerm * 0.32 + angleTerm * 0.32 + residualTerm * 0.22 + flowTerm * 0.14,
  );

  return {
    aspectRatio,
    angleDeviation,
    projectedResidual,
    flowDivergence: divergence,
    flowMagnitude: magnitude,
    deformationScore,
  };
}

/** Whole-cube reposition: corners move together, quad stays roughly square. */
export function isRigidCubeReposition(metrics: QuadShapeMetrics): boolean {
  if (metrics.flowMagnitude < 0.4) return false;

  const uniformFlow = metrics.flowDivergence < 0.2;
  const mildDeform = metrics.deformationScore >= 0.08;
  const squareish = metrics.aspectRatio < 1.18 && metrics.angleDeviation < 0.14;
  const poseDrift = metrics.projectedResidual >= 0.08;
  return uniformFlow && squareish && (mildDeform || poseDrift);
}

/**
 * Layer turn: corners shear unevenly — high flow divergence and/or visible quad skew.
 * Residual-only spikes (PnP drift during rigid spin) do not count.
 */
export function isLayerTurnDeformation(metrics: QuadShapeMetrics): boolean {
  if (metrics.deformationScore < 0.13) return false;
  if (metrics.flowMagnitude < 0.3) return false;

  const squareish = metrics.aspectRatio < 1.15 && metrics.angleDeviation < 0.12;
  if (metrics.flowDivergence < 0.15 && squareish) return false;

  const shear =
    metrics.aspectRatio >= 1.1 ||
    metrics.angleDeviation >= 0.08 ||
    metrics.projectedResidual >= 0.13;
  const divergentFlow = metrics.flowDivergence >= 0.12;

  return (
    divergentFlow ||
    (shear && metrics.flowMagnitude >= 0.3) ||
    (metrics.deformationScore >= 0.2 && metrics.flowMagnitude >= 0.3 && !squareish)
  );
}
