import { useEffect, useRef } from 'react';
import type { CubePose, Move } from '../types';
import { drawFaceArrow } from '../lib/vision/faceArrow';

interface FaceArrowOverlayProps {
  pose: CubePose | null;
  move: Move | null;
  rotationProgress: number;
  frameWidth: number;
  frameHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  active: boolean;
  faceMatchesMove: boolean;
}

export function FaceArrowOverlay({
  pose,
  move,
  rotationProgress,
  frameWidth,
  frameHeight,
  viewportWidth,
  viewportHeight,
  active,
  faceMatchesMove,
}: FaceArrowOverlayProps) {
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

    if (!active || !pose || !move) return;

    drawFaceArrow(
      ctx,
      pose.corners,
      move,
      rotationProgress,
      frameWidth,
      frameHeight,
      viewportWidth,
      viewportHeight,
      { dimmed: !faceMatchesMove },
    );
  }, [
    active,
    pose,
    move,
    rotationProgress,
    frameWidth,
    frameHeight,
    viewportWidth,
    viewportHeight,
    faceMatchesMove,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className={`face-arrow-overlay${active ? ' active' : ''}`}
      aria-hidden="true"
    />
  );
}
