import type { FaceId, ReadColor, StickerColor } from '../types';
import { FACE_COLOR_NAME } from '../lib/cube/colors';
import { COLOR_HEX } from '../lib/vision/colorReference';
import { FaceColorGrid } from './FaceColorGrid';

interface FaceGridMiniProps {
  faceId: FaceId;
  colors: ReadColor[] | null;
  centerColor?: StickerColor;
  empty?: boolean;
  onClick?: (faceId: FaceId) => void;
  selected?: boolean;
  highlightNext?: boolean;
  clickable?: boolean;
}

export function FaceGridMini({
  faceId,
  colors,
  centerColor,
  empty = false,
  onClick,
  selected = false,
  highlightNext = false,
  clickable = false,
}: FaceGridMiniProps) {
  const hasColors = colors && colors.length === 9;
  const isInteractive = clickable && hasColors && Boolean(onClick);

  const className = [
    'face-grid-mini',
    empty ? 'face-grid-mini--empty' : '',
    empty && centerColor ? 'face-grid-mini--guide' : '',
    isInteractive ? 'face-grid-mini--clickable' : '',
    selected ? 'face-grid-mini--selected' : '',
    highlightNext ? 'face-grid-mini--next' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const content = hasColors ? (
    <FaceColorGrid colors={colors} variant="mini" orientation="real" />
  ) : (
    <div className="face-color-grid face-color-grid--mini face-color-grid--placeholder">
      {Array.from({ length: 9 }, (_, i) => {
        const isCenter = i === 4 && centerColor;
        return (
          <span
            key={i}
            className={[
              'face-grid-mini-cell',
              'face-grid-mini-cell--placeholder',
              isCenter ? 'face-grid-mini-cell--guide-center' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={isCenter ? { background: COLOR_HEX[centerColor] } : undefined}
          />
        );
      })}
    </div>
  );

  if (isInteractive) {
    return (
      <button
        type="button"
        className={className}
        data-face={faceId}
        onClick={() => onClick?.(faceId)}
        aria-label={`Re-scan ${FACE_COLOR_NAME[faceId]} face`}
        aria-pressed={selected}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={className} data-face={faceId} aria-label={FACE_COLOR_NAME[faceId]}>
      {content}
    </div>
  );
}
