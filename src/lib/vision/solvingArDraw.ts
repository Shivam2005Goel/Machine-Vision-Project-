import type { CubePose, FaceId, Move } from '../../types';
import { drawCubeRotationArrow, mapFramePointToScreen } from './faceArrow';
import { alignPoseToTrackedQuad, pickArrowCorners } from './poseAlign';
import { projectFaceCorners } from './projectFace';
import { getVisibleFaces } from './visibleFaces';

const FACE_TRACE_COLORS: Record<FaceId, string> = {
  U: 'rgba(120, 220, 255, 0.95)',
  D: 'rgba(255, 220, 80, 0.95)',
  F: 'rgba(120, 255, 160, 0.95)',
  B: 'rgba(255, 140, 140, 0.95)',
  R: 'rgba(255, 120, 200, 0.95)',
  L: 'rgba(180, 140, 255, 0.95)',
};

function strokeTrackedQuad(
  ctx: CanvasRenderingContext2D,
  corners: [import('../../types').Point2D, import('../../types').Point2D, import('../../types').Point2D, import('../../types').Point2D],
  frameWidth: number,
  frameHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): void {
  const [tl, tr, br, bl] = corners.map((p) =>
    mapFramePointToScreen(p, frameWidth, frameHeight, viewportWidth, viewportHeight),
  ) as typeof corners;

  const edge = Math.min(
    Math.hypot(tr.x - tl.x, tr.y - tl.y),
    Math.hypot(bl.x - tl.x, bl.y - tl.y),
  );

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(tr.x, tr.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(bl.x, bl.y);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(0, 255, 180, 0.9)';
  ctx.lineWidth = Math.max(2, edge * 0.035);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 4;
  ctx.stroke();
  ctx.restore();
}

function strokeFaceOutline(
  ctx: CanvasRenderingContext2D,
  corners: [import('../../types').Point2D, import('../../types').Point2D, import('../../types').Point2D, import('../../types').Point2D],
  frameWidth: number,
  frameHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): void {
  const [tl, tr, br, bl] = corners.map((p) =>
    mapFramePointToScreen(p, frameWidth, frameHeight, viewportWidth, viewportHeight),
  ) as typeof corners;

  const edge = Math.min(
    Math.hypot(tr.x - tl.x, tr.y - tl.y),
    Math.hypot(bl.x - tl.x, bl.y - tl.y),
  );

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(tr.x, tr.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(bl.x, bl.y);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(255, 45, 45, 0.85)';
  ctx.lineWidth = Math.max(3, edge * 0.04);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 6;
  ctx.stroke();
  ctx.restore();
}

/** Project and stroke up to three visible face quads for live tracing feedback. */
export function drawVisibleFaceTraces(
  ctx: CanvasRenderingContext2D,
  pose: CubePose,
  recognizedFaces: FaceId[],
  frameWidth: number,
  frameHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): void {
  const aligned = alignPoseToTrackedQuad(pose, frameWidth, frameHeight);
  const visible = getVisibleFaces(aligned).slice(0, 3);

  for (const faceId of visible) {
    const corners = projectFaceCorners(faceId, aligned, frameWidth, frameHeight);
    if (!corners) continue;

    const [tl, tr, br, bl] = corners.map((p) =>
      mapFramePointToScreen(p, frameWidth, frameHeight, viewportWidth, viewportHeight),
    ) as typeof corners;

    const edge = Math.min(
      Math.hypot(tr.x - tl.x, tr.y - tl.y),
      Math.hypot(bl.x - tl.x, bl.y - tl.y),
    );
    const recognized = recognizedFaces.includes(faceId);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.strokeStyle = recognized ? FACE_TRACE_COLORS[faceId] : 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = Math.max(2, edge * (recognized ? 0.045 : 0.03));
    if (!recognized) ctx.setLineDash([Math.max(4, edge * 0.06), Math.max(4, edge * 0.04)]);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = recognized ? 6 : 2;
    ctx.stroke();
    ctx.setLineDash([]);

    const labelX = (tl.x + tr.x + br.x + bl.x) / 4;
    const labelY = (tl.y + tr.y + br.y + bl.y) / 4;
    ctx.font = `600 ${Math.max(11, edge * 0.14)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = recognized ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.55)';
    ctx.fillText(faceId, labelX, labelY);
    ctx.restore();
  }
}

/** AR guide: tracked red rotation arrow on the move face. */
export function drawSolvingAR(
  ctx: CanvasRenderingContext2D,
  pose: CubePose,
  move: Move | null,
  rotationProgress: number,
  moveFaceId: FaceId | null,
  recognizedFaces: FaceId[],
  frameWidth: number,
  frameHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): void {
  if (!frameWidth || !frameHeight || !viewportWidth || !viewportHeight) return;

  drawVisibleFaceTraces(
    ctx,
    pose,
    recognizedFaces,
    frameWidth,
    frameHeight,
    viewportWidth,
    viewportHeight,
  );

  if (!move || !moveFaceId) return;

  strokeTrackedQuad(
    ctx,
    pose.corners,
    frameWidth,
    frameHeight,
    viewportWidth,
    viewportHeight,
  );

  const arrowCorners = pickArrowCorners(pose, moveFaceId, frameWidth, frameHeight);
  strokeFaceOutline(
    ctx,
    arrowCorners,
    frameWidth,
    frameHeight,
    viewportWidth,
    viewportHeight,
  );

  drawCubeRotationArrow(
    ctx,
    arrowCorners,
    move,
    Math.max(0.05, rotationProgress),
    frameWidth,
    frameHeight,
    viewportWidth,
    viewportHeight,
  );
}
