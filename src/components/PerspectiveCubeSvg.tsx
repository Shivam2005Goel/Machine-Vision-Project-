import { useEffect, useRef } from 'react';
import type { FaceId, StickerColor } from '../types';
import { COLOR_HEX } from '../lib/vision/colorReference';
import type { CornerCubeModel, IsoArrow, IsoCell } from '../lib/cube/isometricGuide';
import { drawPerspectiveCube } from '../lib/cube/perspectiveCubeCanvas';

const WHITE_FACE = '#f8fafc';

export interface PerspectiveCellStyle {
  fill: string;
  className: string;
}

export type CellStyleFn = (faceId: FaceId, index: number, cell: IsoCell) => PerspectiveCellStyle;

interface PerspectiveCubeSvgProps {
  model: CornerCubeModel;
  cellStyle: CellStyleFn;
  className?: string;
  ariaLabel?: string;
  arrow?: IsoArrow | null;
  faceBaseFill?: string;
}

export function PerspectiveCubeSvg({
  model,
  cellStyle,
  className = 'iso-cube-guide-svg',
  ariaLabel,
  arrow = null,
  faceBaseFill = WHITE_FACE,
}: PerspectiveCubeSvgProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = model.size;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPerspectiveCube(ctx, model, (faceId, index, cell) => cellStyle(faceId, index, cell), {
      faceBaseFill,
      arrow,
    });
  }, [model, cellStyle, faceBaseFill, arrow]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      width={model.size}
      height={model.size}
      role="img"
      aria-label={ariaLabel}
    />
  );
}

export function scanCellStyle(
  faceId: FaceId,
  index: number,
  scanned: Partial<Record<FaceId, StickerColor[]>>,
  previewFace: FaceId | null,
  previewColors: StickerColor[] | null,
): PerspectiveCellStyle {
  const saved = scanned[faceId];
  if (saved && saved.length === 9) {
    return {
      fill: COLOR_HEX[saved[index]!] ?? WHITE_FACE,
      className: 'iso-cube-guide-cell iso-cube-guide-cell--scanned',
    };
  }
  if (previewFace === faceId && previewColors && previewColors.length === 9) {
    return {
      fill: COLOR_HEX[previewColors[index]!] ?? WHITE_FACE,
      className: 'iso-cube-guide-cell iso-cube-guide-cell--preview',
    };
  }
  return {
    fill: WHITE_FACE,
    className: 'iso-cube-guide-cell iso-cube-guide-cell--empty',
  };
}

export function solveCellStyle(
  faceId: FaceId,
  index: number,
  cell: IsoCell,
  faceColors: Partial<Record<FaceId, StickerColor[]>>,
): PerspectiveCellStyle {
  const colors = faceColors[faceId];
  const color = colors?.[index];
  return {
    fill: color ? COLOR_HEX[color] : '#475569',
    className: cell.isTurning
      ? 'iso-cube-guide-cell iso-cube-guide-cell--turn'
      : 'iso-cube-guide-cell',
  };
}
