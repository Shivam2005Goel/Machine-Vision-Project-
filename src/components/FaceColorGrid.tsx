import type { ReadColor } from '../types';
import { COLOR_HEX } from '../lib/vision/colorReference';
import { mirrorFaceCellsHorizontally } from '../lib/vision/selfieView';
import { isKnownColor } from '../lib/vision/readColorUtils';

export type FaceGridOrientation = 'mirror' | 'real';

interface FaceColorGridProps {
  colors: ReadColor[];
  cellClassName?: string;
  variant?: 'mini' | 'overlay' | 'solving';
  /** mirror = selfie preview; real = physical world (stored sensor order). */
  orientation?: FaceGridOrientation;
}

export function FaceColorGrid({
  colors,
  cellClassName,
  variant = 'overlay',
  orientation = 'real',
}: FaceColorGridProps) {
  const resolvedCellClass =
    cellClassName ??
    (variant === 'mini'
      ? 'face-grid-mini-cell'
      : variant === 'solving'
        ? 'solving-face-cell'
        : 'cell-grid-item');
  const displayColors =
    orientation === 'mirror' ? mirrorFaceCellsHorizontally(colors) : colors;

  return (
    <div className={`face-color-grid face-color-grid--${variant}`}>
      {displayColors.map((color, i) => (
        <span
          key={i}
          className={`${resolvedCellClass}${!isKnownColor(color) ? ' face-cell--uncertain' : ''}`}
          style={
            isKnownColor(color)
              ? { background: COLOR_HEX[color] }
              : undefined
          }
        />
      ))}
    </div>
  );
}
