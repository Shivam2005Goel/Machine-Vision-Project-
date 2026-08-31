import type { EdgeRotationSpec, EdgePivot } from '../cube/moveGuidanceView';

function pivotPoint(
  width: number,
  height: number,
  pad: number,
  pivot: EdgePivot,
): { x: number; y: number } {
  switch (pivot) {
    case 'top':
      return { x: width / 2, y: pad };
    case 'bottom':
      return { x: width / 2, y: height - pad };
    case 'left':
      return { x: pad, y: height / 2 };
    case 'right':
      return { x: width - pad, y: height / 2 };
  }
}

function inwardVector(pivot: EdgePivot): { x: number; y: number } {
  switch (pivot) {
    case 'top':
      return { x: 0, y: 1 };
    case 'bottom':
      return { x: 0, y: -1 };
    case 'left':
      return { x: 1, y: 0 };
    case 'right':
      return { x: -1, y: 0 };
  }
}

function pointOnArc(
  pivot: { x: number; y: number },
  inward: { x: number; y: number },
  radius: number,
  angle: number,
): { x: number; y: number } {
  const perp = { x: -inward.y, y: inward.x };
  return {
    x: pivot.x + inward.x * radius * 0.15 + radius * (Math.cos(angle) * perp.x + Math.sin(angle) * inward.x),
    y: pivot.y + inward.y * radius * 0.15 + radius * (Math.cos(angle) * perp.y + Math.sin(angle) * inward.y),
  };
}

function strokeArc(
  ctx: CanvasRenderingContext2D,
  pivot: { x: number; y: number },
  inward: { x: number; y: number },
  radius: number,
  start: number,
  end: number,
): void {
  const steps = 24;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = start + ((end - start) * i) / steps;
    const p = pointOnArc(pivot, inward, radius, t);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  tip: { x: number; y: number },
  prev: { x: number; y: number },
  size: number,
): void {
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

/** Draw rotation arc around a face edge (not face center). */
export function drawEdgeRotationArrow(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  spec: EdgeRotationSpec,
  progress: number,
  isDouble = false,
): void {
  const pad = Math.min(width, height) * 0.08;
  const pivot = pivotPoint(width, height, pad, spec.pivot);
  const inward = inwardVector(spec.pivot);
  const radius = Math.min(width, height) * 0.34;
  const clamped = Math.max(0, Math.min(1, progress));
  const currentEnd = spec.startAngle + (spec.endAngle - spec.startAngle) * clamped;
  const lineW = Math.max(4, radius * 0.14);
  const headSize = Math.max(12, radius * 0.28);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = lineW + 3;
  strokeArc(ctx, pivot, inward, radius, spec.startAngle, spec.endAngle);

  ctx.strokeStyle = 'rgba(255, 45, 45, 0.55)';
  ctx.lineWidth = lineW;
  strokeArc(ctx, pivot, inward, radius, spec.startAngle, spec.endAngle);

  ctx.strokeStyle = '#ff2d2d';
  const tipAngle = isDouble ? spec.endAngle : spec.endAngle;
  const tip = pointOnArc(pivot, inward, radius, tipAngle);
  const prev = pointOnArc(pivot, inward, radius, tipAngle - 0.2);
  drawHead(ctx, tip, prev, headSize);

  if (clamped > 0.04) {
    ctx.strokeStyle = '#ffeb3b';
    ctx.lineWidth = Math.max(5, lineW * 0.9);
    strokeArc(ctx, pivot, inward, radius, spec.startAngle, currentEnd);
    const progTip = pointOnArc(pivot, inward, radius, currentEnd);
    const progPrev = pointOnArc(pivot, inward, radius, currentEnd - 0.2);
    drawHead(ctx, progTip, progPrev, headSize * 0.85);
  }

  if (isDouble) {
    ctx.fillStyle = '#ff2d2d';
    ctx.font = `bold ${Math.max(14, radius * 0.35)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('180°', width / 2, height / 2);
  }

  ctx.restore();
}
