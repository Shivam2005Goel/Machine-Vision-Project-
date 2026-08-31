import { useEffect, useRef } from 'react';
import type { CubePose, Move, StickerColor } from '../types';
import { drawLiveAR } from '../lib/vision/liveArDraw';

interface LiveAROverlayProps {
  pose: CubePose | null;
  colors: StickerColor[] | null;
  move: Move | null;
  rotationProgress: number;
  faceMatchesMove: boolean;
  targetCenterColor: StickerColor | null;
  frameWidth: number;
  frameHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  active: boolean;
}

export function LiveAROverlay({
  pose,
  colors,
  move,
  rotationProgress,
  faceMatchesMove,
  targetCenterColor,
  frameWidth,
  frameHeight,
  viewportWidth,
  viewportHeight,
  active,
}: LiveAROverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = Math.max(1, Math.floor(viewportWidth * dpr));
    canvas.height = Math.max(1, Math.floor(viewportHeight * dpr));
    canvas.style.width = `${viewportWidth}px`;
    canvas.style.height = `${viewportHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewportWidth, viewportHeight);

    if (!active || !pose) return;

    drawLiveAR(
      ctx,
      pose.corners,
      colors,
      move,
      rotationProgress,
      faceMatchesMove,
      faceMatchesMove ? null : targetCenterColor,
      frameWidth,
      frameHeight,
      viewportWidth,
      viewportHeight,
    );
  }, [
    active,
    pose,
    colors,
    move,
    rotationProgress,
    faceMatchesMove,
    targetCenterColor,
    frameWidth,
    frameHeight,
    viewportWidth,
    viewportHeight,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className={`live-ar-overlay${active ? ' active' : ''}`}
      aria-hidden="true"
    />
  );
}
