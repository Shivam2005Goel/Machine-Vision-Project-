import type { FaceId } from '../../types';
import type { CornerCubeModel, IsoArrow, IsoCell, Point2 } from './isometricGuide';

const FRAME_BLACK = '#0a0a0a';
const OUTLINE_WHITE = 'rgba(255, 255, 255, 0.92)';
const SVG_BG = '#111827';
const FACE_INFLATE_PX = 1.5;

export interface CanvasCellStyle {
  fill: string;
}

export type CanvasCellStyleFn = (
  faceId: FaceId,
  index: number,
  cell: IsoCell,
) => CanvasCellStyle;

export interface DrawPerspectiveCubeOptions {
  faceBaseFill?: string;
  arrow?: IsoArrow | null;
}

function inflatePolygon(points: Point2[], amount: number): Point2[] {
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  return points.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * amount, y: p.y + (dy / len) * amount };
  });
}

function fillPolygon(ctx: CanvasRenderingContext2D, points: Point2[], fill: string): void {
  if (points.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i]!.x, points[i]!.y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function strokePolygon(
  ctx: CanvasRenderingContext2D,
  points: Point2[],
  stroke: string,
  lineWidth: number,
): void {
  if (points.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i]!.x, points[i]!.y);
  }
  ctx.closePath();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function strokeSvgPath(ctx: CanvasRenderingContext2D, path: string): void {
  const tokens = path.match(/[ML]|-?\d*\.?\d+/g);
  if (!tokens || tokens.length < 3) return;
  ctx.beginPath();
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i++];
    const x = Number(tokens[i++]);
    const y = Number(tokens[i++]);
    if (cmd === 'M') ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawArrow(ctx: CanvasRenderingContext2D, arrow: IsoArrow): void {
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  strokeSvgPath(ctx, arrow.path);

  const tip = arrow.head;
  const angle = arrow.headAngle;
  const size = 11;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const px = -uy;
  const py = ux;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(tip.x - ux * size + px * size * 0.55, tip.y - uy * size + py * size * 0.55);
  ctx.lineTo(tip.x - ux * size - px * size * 0.55, tip.y - uy * size - py * size * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Opaque 2D canvas paint — avoids SVG fill / clipPath issues on mobile. */
export function drawPerspectiveCube(
  ctx: CanvasRenderingContext2D,
  model: CornerCubeModel,
  cellStyle: CanvasCellStyleFn,
  options: DrawPerspectiveCubeOptions = {},
): void {
  const size = model.size;
  const faceBaseFill = options.faceBaseFill ?? '#f8fafc';

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = SVG_BG;
  ctx.fillRect(0, 0, size, size);

  for (const group of model.faceGroups) {
    fillPolygon(ctx, inflatePolygon(group.outline.points, FACE_INFLATE_PX), faceBaseFill);
    for (const cell of group.cells) {
      const { fill } = cellStyle(group.faceId, cell.index, cell);
      fillPolygon(ctx, cell.points, fill);
    }
  }

  ctx.strokeStyle = FRAME_BLACK;
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'square';
  for (const group of model.faceGroups) {
    for (const line of group.gridLines) {
      strokeSvgPath(ctx, line);
    }
  }

  for (const group of model.faceGroups) {
    strokePolygon(ctx, group.outline.points, OUTLINE_WHITE, 2);
  }

  if (options.arrow) {
    drawArrow(ctx, options.arrow);
  }
}
