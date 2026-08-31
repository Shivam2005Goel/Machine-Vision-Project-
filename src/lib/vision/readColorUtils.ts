import type { ReadColor, StickerColor } from '../../types';

export function isKnownColor(c: ReadColor): c is StickerColor {
  return c !== '?';
}

export function countUncertain(cells: ReadColor[]): number {
  return cells.filter((c) => c === '?').length;
}

export function toStickerColors(cells: ReadColor[], fallback: StickerColor = 'W'): StickerColor[] {
  return cells.map((c) => (c === '?' ? fallback : c));
}
