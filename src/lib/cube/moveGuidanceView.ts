import type { FaceId, Move } from '../../types';
import { getFaceLayerName } from './faceLayerNames';
import { getMoveRotationDisplay } from './moveRotationDisplay';
import { isDoubleMove, moveFace } from './moves';

/** Which face should face the camera — never the turning face (face-center axis is ambiguous). */
export function getMoveHoldFace(move: Move): FaceId {
  const layer = moveFace(move);
  switch (layer) {
    case 'R':
    case 'L':
    case 'U':
    case 'D':
      return 'F';
    case 'F':
      return 'R';
    case 'B':
      return 'L';
  }
}

export type EdgePivot = 'top' | 'bottom' | 'left' | 'right';

export interface EdgeRotationSpec {
  pivot: EdgePivot;
  startAngle: number;
  endAngle: number;
}

export interface MoveGuidanceView {
  move: Move;
  holdFace: FaceId;
  turnLayer: FaceId;
  holdFaceName: string;
  turnLayerName: string;
  axisLabel: string;
  edgeSpec: EdgeRotationSpec;
  symbol: string;
  direction: string;
  turns: string;
}

function sweepQuarter(clockwise: boolean): Pick<EdgeRotationSpec, 'startAngle' | 'endAngle'> {
  const span = Math.PI / 2;
  return clockwise
    ? { startAngle: -span, endAngle: 0 }
    : { startAngle: 0, endAngle: span };
}

function sweepHalf(): Pick<EdgeRotationSpec, 'startAngle' | 'endAngle'> {
  return { startAngle: -Math.PI / 2, endAngle: Math.PI / 2 };
}

/** Edge-pivot arc on the hold face — rotation axis lies on the face edge, not its center. */
export function getEdgeRotationSpec(move: Move, holdFace: FaceId): EdgeRotationSpec {
  const layer = moveFace(move);
  const effective = getMoveRotationDisplay(move, true);
  const clockwise = effective.direction === 'Clockwise';

  if (isDoubleMove(move)) {
    if (holdFace === 'F') {
      if (layer === 'R' || layer === 'L') return { pivot: layer === 'R' ? 'right' : 'left', ...sweepHalf() };
      return { pivot: layer === 'U' ? 'top' : 'bottom', ...sweepHalf() };
    }
    return { pivot: layer === 'F' ? 'left' : 'right', ...sweepHalf() };
  }

  if (holdFace === 'F') {
    switch (layer) {
      case 'R':
        return { pivot: 'right', ...sweepQuarter(clockwise) };
      case 'L':
        return { pivot: 'left', ...sweepQuarter(!clockwise) };
      case 'U':
        return { pivot: 'top', ...sweepQuarter(!clockwise) };
      case 'D':
        return { pivot: 'bottom', ...sweepQuarter(clockwise) };
    }
  }

  if (holdFace === 'R') {
    const cw = layer === 'F' ? clockwise : !clockwise;
    return { pivot: layer === 'F' ? 'left' : 'right', ...sweepQuarter(cw) };
  }

  if (holdFace === 'L') {
    const cw = layer === 'F' ? !clockwise : clockwise;
    return { pivot: layer === 'F' ? 'right' : 'left', ...sweepQuarter(cw) };
  }

  return { pivot: 'right', ...sweepQuarter(clockwise) };
}

function axisLabelFor(move: Move, holdFace: FaceId): string {
  const layer = moveFace(move);
  if (holdFace === 'F') {
    if (layer === 'R' || layer === 'L') return layer === 'R' ? 'right edge' : 'left edge';
    return layer === 'U' ? 'top edge' : 'bottom edge';
  }
  if (holdFace === 'R') return layer === 'F' ? 'left edge' : 'right edge';
  if (holdFace === 'L') return layer === 'F' ? 'right edge' : 'left edge';
  return 'edge';
}

export function getMoveGuidanceView(move: Move): MoveGuidanceView {
  const turnLayer = moveFace(move);
  const holdFace = getMoveHoldFace(move);
  const display = getMoveRotationDisplay(move, true);
  const edgeSpec = getEdgeRotationSpec(move, holdFace);

  return {
    move,
    holdFace,
    turnLayer,
    holdFaceName: getFaceLayerName(holdFace),
    turnLayerName: getFaceLayerName(turnLayer),
    axisLabel: axisLabelFor(move, holdFace),
    edgeSpec,
    symbol: display.symbol,
    direction: display.direction,
    turns: display.turns,
  };
}

/** True when the camera-facing face matches the required hold orientation. */
export function isHoldFaceAligned(
  visibleFace: FaceId | null,
  holdFace: FaceId,
  scanMatch: number,
): boolean {
  return visibleFace === holdFace && scanMatch >= 0.48;
}
