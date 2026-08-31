import type { Move, Point2D, StickerColor } from '../../types';
import { COLOR_HEX } from './colorReference';
import { drawFaceArrow, mapFramePointToScreen } from './faceArrow';

function lerpPoint(a: Point2D, b: Point2D, t: number): Point2D {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function bilinearOnQuad(
  tl: Point2D,
  tr: Point2D,
  br: Point2D,
  bl: Point2D,
  u: number,
  v: number,
): Point2D {
  const top = lerpPoint(tl, tr, u);
  const bottom = lerpPoint(bl, br, u);
  return lerpPoint(top, bottom, v);
}

function cellQuad(
  tl: Point2D,
  tr: Point2D,
  br: Point2D,
  bl: Point2D,
  row: number,
  col: number,
): [Point2D, Point2D, Point2D, Point2D] {
  const u0 = col / 3;
  const u1 = (col + 1) / 3;
  const v0 = row / 3;
  const v1 = (row + 1) / 3;
  return [
    bilinearOnQuad(tl, tr, br, bl, u0, v0),
    bilinearOnQuad(tl, tr, br, bl, u1, v0),
    bilinearOnQuad(tl, tr, br, bl, u1, v1),
    bilinearOnQuad(tl, tr, br, bl, u0, v1),
  ];
}

function fillQuad(
  ctx: CanvasRenderingContext2D,
  quad: [Point2D, Point2D, Point2D, Point2D],
  fill: string,
): void {
  const [a, b, c, d] = quad;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function strokeQuad(
  ctx: CanvasRenderingContext2D,
  quad: [Point2D, Point2D, Point2D, Point2D],
  stroke: string,
  width: number,
): void {
  const [a, b, c, d] = quad;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
}

export function drawLiveFaceColors(
  ctx: CanvasRenderingContext2D,
  corners: [Point2D, Point2D, Point2D, Point2D],
  colors: StickerColor[],
  frameWidth: number,
  frameHeight: number,
  containerWidth: number,
  containerHeight: number,
): void {
  if (colors.length !== 9) return;

  const [tl, tr, br, bl] = corners.map((p) =>
    mapFramePointToScreen(p, frameWidth, frameHeight, containerWidth, containerHeight),
  ) as [Point2D, Point2D, Point2D, Point2D];

  const edge = Math.min(
    Math.hypot(tr.x - tl.x, tr.y - tl.y),
    Math.hypot(bl.x - tl.x, bl.y - tl.y),
  );
  const lineW = Math.max(1.5, edge * 0.018);

  ctx.save();
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const quad = cellQuad(tl, tr, br, bl, row, col);
      const color = colors[row * 3 + col]!;
      fillQuad(ctx, quad, `${COLOR_HEX[color]}99`);
      strokeQuad(ctx, quad, 'rgba(0, 0, 0, 0.35)', lineW);
    }
  }

  strokeQuad(ctx, [tl, tr, br, bl], 'rgba(255, 255, 255, 0.85)', Math.max(2, lineW * 1.4));
  ctx.restore();
}

export function drawTargetCenterHint(
  ctx: CanvasRenderingContext2D,
  corners: [Point2D, Point2D, Point2D, Point2D],
  targetColor: StickerColor,
  frameWidth: number,
  frameHeight: number,
  containerWidth: number,
  containerHeight: number,
): void {
  const [tl, tr, br, bl] = corners.map((p) =>
    mapFramePointToScreen(p, frameWidth, frameHeight, containerWidth, containerHeight),
  ) as [Point2D, Point2D, Point2D, Point2D];

  const cx = (tl.x + tr.x + br.x + bl.x) / 4;
  const cy = (tl.y + tr.y + br.y + bl.y) / 4;
  const edge = Math.min(
    Math.hypot(tr.x - tl.x, tr.y - tl.y),
    Math.hypot(bl.x - tl.x, bl.y - tl.y),
  );
  const radius = edge * 0.14;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = COLOR_HEX[targetColor];
  ctx.fill();
  ctx.lineWidth = Math.max(3, radius * 0.22);
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.restore();
}

export function drawLiveAR(
  ctx: CanvasRenderingContext2D,
  corners: [Point2D, Point2D, Point2D, Point2D],
  colors: StickerColor[] | null,
  move: Move | null,
  rotationProgress: number,
  faceMatchesMove: boolean,
  targetCenterColor: StickerColor | null,
  frameWidth: number,
  frameHeight: number,
  containerWidth: number,
  containerHeight: number,
): void {
  if (!frameWidth || !frameHeight || !containerWidth || !containerHeight) return;

  if (colors && colors.length === 9) {
    drawLiveFaceColors(
      ctx,
      corners,
      colors,
      frameWidth,
      frameHeight,
      containerWidth,
      containerHeight,
    );
  }

  if (move && faceMatchesMove) {
    drawFaceArrow(
      ctx,
      corners,
      move,
      rotationProgress,
      frameWidth,
      frameHeight,
      containerWidth,
      containerHeight,
    );
  } else if (targetCenterColor) {
    drawTargetCenterHint(
      ctx,
      corners,
      targetCenterColor,
      frameWidth,
      frameHeight,
      containerWidth,
      containerHeight,
    );
  }
}
