import { applyWhiteBalance, getWhiteReference, isWhiteBalanceCalibrated } from './whiteBalance';

/** WB 보정 후 캘리브레이션된 흰색에 가까운 픽셀 (노란 방 조명용) */
export function isCalibratedWhitePixel(r: number, g: number, b: number): boolean {
  if (!isWhiteBalanceCalibrated()) return false;

  const [cr, cg, cb] = applyWhiteBalance(r, g, b);
  const max = Math.max(cr, cg, cb);
  const min = Math.min(cr, cg, cb);
  const chroma = max - min;
  const brightness = (cr + cg + cb) / 3;

  if (brightness < 165 || chroma > 52) return false;

  const ref = getWhiteReference();
  if (!ref) {
    return brightness > 200 && chroma < 32;
  }

  const [wr, wg, wb] = applyWhiteBalance(ref.r, ref.g, ref.b);
  const dist = Math.hypot(cr - wr, cg - wg, cb - wb);
  return dist < 58;
}

/** 노란 스티커 — WB 후에도 채도가 남아 있는 따뜻한 색 */
export function isLikelyYellowPixel(r: number, g: number, b: number): boolean {
  const [cr, cg, cb] = applyWhiteBalance(r, g, b);
  const chroma = Math.max(cr, cg, cb) - Math.min(cr, cg, cb);
  if (chroma < 35) return false;
  return cr > 150 && cg > 130 && cb < cr - 25 && cb < cg - 15;
}

export function warmLightYellowPenalty(r: number, g: number, b: number): number {
  if (!isWhiteBalanceCalibrated()) return 0;
  if (isCalibratedWhitePixel(r, g, b)) return 0.85;
  if (isLikelyYellowPixel(r, g, b)) return -0.25;
  return 0;
}
