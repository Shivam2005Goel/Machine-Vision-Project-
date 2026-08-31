import type { Move, Point2D } from '../../types';
import { drawFaceArrow } from './faceArrow';
import { getSelfieDisplayMove } from '../cube/moveRotationDisplay';
import { isDoubleMove, moveFace } from '../cube/moves';

/** Draw a rotation arrow directly on a square grid (hint panel). */
export function drawGridRotationHint(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  move: Move,
  progress: number,
): void {
  const pad = Math.min(width, height) * 0.06;
  const corners: [Point2D, Point2D, Point2D, Point2D] = [
    { x: pad, y: pad },
    { x: width - pad, y: pad },
    { x: width - pad, y: height - pad },
    { x: pad, y: height - pad },
  ];

  drawFaceArrow(
    ctx,
    corners,
    getSelfieDisplayMove(move),
    progress,
    width,
    height,
    width,
    height,
    { guide: true, faceLabel: moveFace(move) },
  );

  if (isDoubleMove(move)) {
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(width, height) * 0.14;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 45, 45, 0.7)';
    ctx.fillStyle = '#ffeb3b';
    ctx.lineWidth = Math.max(3, r * 0.2);
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI * 0.75, Math.PI * 0.75);
    ctx.stroke();

    for (const angle of [-Math.PI * 0.75, Math.PI * 0.75]) {
      const tx = cx + r * Math.cos(angle);
      const ty = cy + r * Math.sin(angle);
      const dir = angle + Math.PI / 2;
      drawMiniHead(ctx, tx, ty, dir, r * 0.55);
    }
    ctx.restore();
  }
}

function drawMiniHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size: number,
): void {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const px = -uy;
  const py = ux;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - ux * size + px * size * 0.5, y - uy * size + py * size * 0.5);
  ctx.lineTo(x - ux * size - px * size * 0.5, y - uy * size - py * size * 0.5);
  ctx.closePath();
  ctx.fill();
}
