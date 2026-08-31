import * as THREE from 'three';
import type { StickerColor } from '../../types';
import { COLOR_HEX } from '../vision/colorReference';

const TEX_SIZE = 96;
const CELL = TEX_SIZE / 3;

export function createFaceColorTexture(
  colors: StickerColor[],
  highlightIndices: number[] = [],
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  const highlight = new Set(highlightIndices);

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const index = row * 3 + col;
      const color = colors[row * 3 + col] ?? 'W';
      ctx.fillStyle = COLOR_HEX[color];
      ctx.fillRect(col * CELL, (2 - row) * CELL, CELL, CELL);
      if (highlight.has(index)) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
      } else {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.lineWidth = 1;
      }
      ctx.strokeRect(col * CELL + 1, (2 - row) * CELL + 1, CELL - 2, CELL - 2);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function updateFaceColorTexture(
  texture: THREE.CanvasTexture,
  colors: StickerColor[],
  highlightIndices: number[] = [],
): void {
  const canvas = texture.image as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const highlight = new Set(highlightIndices);

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const index = row * 3 + col;
      const color = colors[row * 3 + col] ?? 'W';
      ctx.fillStyle = COLOR_HEX[color];
      ctx.fillRect(col * CELL, (2 - row) * CELL, CELL, CELL);
      if (highlight.has(index)) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
      } else {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.lineWidth = 1;
      }
      ctx.strokeRect(col * CELL + 1, (2 - row) * CELL + 1, CELL - 2, CELL - 2);
    }
  }
  texture.needsUpdate = true;
}
