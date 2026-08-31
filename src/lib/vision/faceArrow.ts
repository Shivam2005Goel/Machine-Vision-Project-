import type { Move, Point2D } from '../../types';
import { isDoubleMove, isPrimeMove, moveAngle, moveFace } from '../cube/moves';
import { getSelfieDisplayMove } from '../cube/moveRotationDisplay';
import { getCoverTransform } from './guideOverlay';

export function mapFramePointToScreen(
  point: Point2D,
  frameWidth: number,
  frameHeight: number,
  containerWidth: number,
  containerHeight: number,
): Point2D {
  const { scale, offsetX, offsetY } = getCoverTransform(
    frameWidth,
    frameHeight,
    containerWidth,
    containerHeight,
  );
  return {
    x: offsetX + point.x * scale,
    y: offsetY + point.y * scale,
  };
}

export function drawCubeRotationArrow(
  ctx: CanvasRenderingContext2D,
  corners: [Point2D, Point2D, Point2D, Point2D],
  move: Move,
  progress: number,
  frameWidth: number,
  frameHeight: number,
  containerWidth: number,
  containerHeight: number,
): void {
  drawFaceArrow(
    ctx,
    corners,
    getSelfieDisplayMove(move),
    progress,
    frameWidth,
    frameHeight,
    containerWidth,
    containerHeight,
    { guide: true, faceLabel: moveFace(move) },
  );
}

export function drawFaceArrow(
  ctx: CanvasRenderingContext2D,
  corners: [Point2D, Point2D, Point2D, Point2D],
  move: Move,
  progress: number,
  frameWidth: number,
  frameHeight: number,
  containerWidth: number,
  containerHeight: number,
  options: { dimmed?: boolean; guide?: boolean; faceLabel?: string } = {},
): void {
  if (!frameWidth || !frameHeight || !containerWidth || !containerHeight) return;

  const [tl, tr, br, bl] = corners.map((p) =>
    mapFramePointToScreen(p, frameWidth, frameHeight, containerWidth, containerHeight),
  ) as [Point2D, Point2D, Point2D, Point2D];

  const cx = (tl.x + tr.x + br.x + bl.x) / 4;
  const cy = (tl.y + tr.y + br.y + bl.y) / 4;

  const ux = tr.x - tl.x;
  const uy = tr.y - tl.y;
  const vx = bl.x - tl.x;
  const vy = bl.y - tl.y;
  const uLen = Math.hypot(ux, uy) || 1;
  const vLen = Math.hypot(vx, vy) || 1;
  const ru = { x: ux / uLen, y: uy / uLen };
  const rv = { x: vx / vLen, y: vy / vLen };

  const guide = options.guide ?? false;
  const dimmed = options.dimmed ?? false;
  const radius = Math.min(uLen, vLen) * (guide ? 0.38 : 0.3);
  const guideLine = guide ? Math.max(8, radius * 0.22, Math.min(uLen, vLen) * 0.06) : 0;
  const totalAngle = Math.abs(moveAngle(move));
  const startAngle = isPrimeMove(move) ? totalAngle : 0;
  const endAngle = isPrimeMove(move) ? 0 : totalAngle;
  const clamped = Math.max(0, Math.min(1, progress));
  const currentAngle = startAngle + (endAngle - startAngle) * clamped;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (guide) {
    const guideWidth = Math.max(guideLine, 8);
    const headSize = Math.max(14, radius * 0.32, guideWidth * 1.4);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = guideWidth + 4;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 8;
    strokeArc(ctx, cx, cy, ru, rv, radius, startAngle, endAngle);

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 45, 45, 0.55)';
    ctx.lineWidth = guideWidth;
    strokeArc(ctx, cx, cy, ru, rv, radius, startAngle, endAngle);

    ctx.strokeStyle = '#ff2d2d';
    ctx.lineWidth = Math.max(4, guideWidth * 0.75);
    drawArrowHead(ctx, cx, cy, ru, rv, radius, endAngle, headSize);

    if (clamped > 0.04) {
      ctx.strokeStyle = '#ffeb3b';
      ctx.lineWidth = Math.max(5, guideWidth * 0.85);
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = 6;
      strokeArc(ctx, cx, cy, ru, rv, radius, startAngle, currentAngle);
      drawArrowHead(ctx, cx, cy, ru, rv, radius, currentAngle, headSize * 0.85);
    }

    if (options.faceLabel) {
      ctx.shadowBlur = 0;
      const labelSize = Math.max(18, radius * 0.45);
      ctx.font = `bold ${labelSize}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillText(options.faceLabel, cx + 1, cy + 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(options.faceLabel, cx, cy);
    }

    if (isDoubleMove(move)) {
      ctx.fillStyle = '#ff2d2d';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.font = `bold ${Math.max(16, radius * 0.42)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeText('180°', cx, cy);
      ctx.fillText('180°', cx, cy);
    }

    ctx.restore();
    return;
  }

  const outlineAlpha = dimmed ? 0.45 : 0.7;
  const trackAlpha = dimmed ? 0.25 : 0.4;

  ctx.strokeStyle = `rgba(255, 255, 255, ${outlineAlpha})`;
  ctx.lineWidth = Math.max(3, radius * 0.14);
  strokeArc(ctx, cx, cy, ru, rv, radius, startAngle, endAngle);

  ctx.strokeStyle = `rgba(255, 255, 255, ${trackAlpha})`;
  ctx.lineWidth = Math.max(2, radius * 0.1);
  strokeQuad(ctx, tl, tr, br, bl);

  if (currentAngle > 0.02) {
    ctx.strokeStyle = dimmed ? 'rgba(255, 220, 120, 0.85)' : '#ffffff';
    ctx.lineWidth = Math.max(5, radius * 0.18);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 6;
    strokeArc(ctx, cx, cy, ru, rv, radius, startAngle, currentAngle);
    drawArrowHead(ctx, cx, cy, ru, rv, radius, currentAngle, Math.max(5, radius * 0.18));
  }

  if (isDoubleMove(move)) {
    ctx.fillStyle = dimmed ? 'rgba(255, 220, 120, 0.9)' : '#ffffff';
    ctx.font = `bold ${Math.max(14, radius * 0.45)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('2', cx, cy);
  }

  ctx.restore();
}

function pointOnArc(
  cx: number,
  cy: number,
  ru: Point2D,
  rv: Point2D,
  radius: number,
  angle: number,
): Point2D {
  return {
    x: cx + radius * (Math.cos(angle) * ru.x + Math.sin(angle) * rv.x),
    y: cy + radius * (Math.cos(angle) * ru.y + Math.sin(angle) * rv.y),
  };
}

function strokeArc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  ru: Point2D,
  rv: Point2D,
  radius: number,
  start: number,
  end: number,
): void {
  const steps = 28;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = start + ((end - start) * i) / steps;
    const p = pointOnArc(cx, cy, ru, rv, radius, t);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

function strokeQuad(
  ctx: CanvasRenderingContext2D,
  tl: Point2D,
  tr: Point2D,
  br: Point2D,
  bl: Point2D,
): void {
  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(tr.x, tr.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(bl.x, bl.y);
  ctx.closePath();
  ctx.stroke();
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  ru: Point2D,
  rv: Point2D,
  radius: number,
  angle: number,
  size: number,
): void {
  const tip = pointOnArc(cx, cy, ru, rv, radius, angle);
  const prev = pointOnArc(cx, cy, ru, rv, radius, angle - 0.2);
  const dir = { x: tip.x - prev.x, y: tip.y - prev.y };
  const len = Math.hypot(dir.x, dir.y) || 1;
  const ux = dir.x / len;
  const uy = dir.y / len;
  const px = -uy;
  const py = ux;
  const wing = size * 0.9;

  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(tip.x - ux * wing + px * wing * 0.55, tip.y - uy * wing + py * wing * 0.55);
  ctx.lineTo(tip.x - ux * wing - px * wing * 0.55, tip.y - uy * wing - py * wing * 0.55);
  ctx.closePath();
  ctx.fillStyle = ctx.strokeStyle as string;
  ctx.fill();
}
