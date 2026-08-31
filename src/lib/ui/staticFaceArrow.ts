import type { Move } from '../../types';
import { isDoubleMove, isPrimeMove, moveFace } from '../cube/moves';

export interface RotationGuideGraphic {
  trackPath: string;
  headX: number;
  headY: number;
  headAngle: number;
  symbol: 'cw' | 'ccw' | 'double';
}

function pointOnArc(
  cx: number,
  cy: number,
  radius: number,
  angle: number,
): { x: number; y: number } {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

function arcPath(
  cx: number,
  cy: number,
  radius: number,
  start: number,
  end: number,
  steps = 40,
): string {
  const parts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = start + ((end - start) * i) / steps;
    const p = pointOnArc(cx, cy, radius, t);
    parts.push(`${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
  }
  return parts.join(' ');
}

function mirrorMoveForSelfie(move: Move): Move {
  if (isDoubleMove(move)) return move;
  const face = moveFace(move);
  return isPrimeMove(move) ? (face as Move) : (`${face}'` as Move);
}

/**
 * Single large arc around the face with one arrowhead — unambiguous CW/CCW on screen.
 * Screen Y grows downward; positive angle sweep = clockwise on screen.
 */
export function buildRotationGuide(
  viewSize: number,
  _gridPadding: number,
  gridSize: number,
  move: Move,
  mirror = false,
): RotationGuideGraphic {
  const effectiveMove = mirror ? mirrorMoveForSelfie(move) : move;
  const cx = viewSize / 2;
  const cy = viewSize / 2;
  const radius = gridSize * 0.46;
  const clockwise = !isPrimeMove(effectiveMove);
  const sweep = isDoubleMove(effectiveMove) ? Math.PI : Math.PI / 2;

  // Start from top of face, sweep clockwise or counter-clockwise on screen.
  const start = -Math.PI / 2;
  const end = start + (clockwise ? sweep : -sweep);

  const head = pointOnArc(cx, cy, radius, end);
  const prev = pointOnArc(cx, cy, radius, end - (clockwise ? 0.2 : -0.2));
  const headAngle = Math.atan2(head.y - prev.y, head.x - prev.x);

  return {
    trackPath: arcPath(cx, cy, radius, start, end),
    headX: head.x,
    headY: head.y,
    headAngle,
    symbol: isDoubleMove(move) ? 'double' : clockwise ? 'cw' : 'ccw',
  };
}

export function rotationSymbolLabel(symbol: RotationGuideGraphic['symbol']): string {
  if (symbol === 'double') return '180°';
  if (symbol === 'cw') return '↻';
  return '↺';
}

export function doubleMoveLabel(move: Move): string | null {
  return isDoubleMove(move) ? '180°' : null;
}

// Legacy export
export function buildOuterRotationArrows(
  gridSize: number,
  padding: number,
  move: Move,
  mirror = false,
) {
  const viewSize = gridSize + padding * 2;
  const guide = buildRotationGuide(viewSize, padding, gridSize, move, mirror);
  return {
    arrows: [
      {
        d: guide.trackPath,
        headX: guide.headX,
        headY: guide.headY,
        headAngle: guide.headAngle,
      },
    ],
    doubleLabel: guide.symbol === 'double' ? '180°' : null,
  };
}

export function buildFaceArcPaths(
  size: number,
  move: Move,
  _progress: number,
  mirror = false,
) {
  const guide = buildRotationGuide(size, size * 0.1, size * 0.8, move, mirror);
  return {
    track: guide.trackPath,
    active: guide.trackPath,
    headX: guide.headX,
    headY: guide.headY,
    headAngle: guide.headAngle,
  };
}
