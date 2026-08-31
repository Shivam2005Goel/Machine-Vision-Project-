import { useEffect, useMemo, useRef } from 'react';
import type { CubePose, FaceId, Move, StickerColor } from '../types';
import { CubeARRenderer } from '../lib/three/cubeArRenderer';
import { getCoverTransform } from '../lib/vision/guideOverlay';

interface CubeAROverlayProps {
  pose: CubePose | null;
  move: Move | null;
  rotationProgress: number;
  faceMatchesMove: boolean;
  visibleFaceColors: Partial<Record<FaceId, StickerColor[]>>;
  scannedFaceColors: Partial<Record<FaceId, StickerColor[]>>;
  frameWidth: number;
  frameHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  active: boolean;
}

export function CubeAROverlay({
  pose,
  move,
  rotationProgress,
  faceMatchesMove,
  visibleFaceColors,
  scannedFaceColors,
  frameWidth,
  frameHeight,
  viewportWidth,
  viewportHeight,
  active,
}: CubeAROverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CubeARRenderer | null>(null);

  const coverRect = useMemo(() => {
    if (!frameWidth || !frameHeight || !viewportWidth || !viewportHeight) {
      return null;
    }
    const { scale, offsetX, offsetY } = getCoverTransform(
      frameWidth,
      frameHeight,
      viewportWidth,
      viewportHeight,
    );
    return {
      left: offsetX,
      top: offsetY,
      width: frameWidth * scale,
      height: frameHeight * scale,
    };
  }, [frameWidth, frameHeight, viewportWidth, viewportHeight]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new CubeARRenderer(canvas);
    rendererRef.current = renderer;

    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!coverRect) return;
    rendererRef.current?.resize(coverRect.width, coverRect.height, frameWidth, frameHeight);
  }, [coverRect, frameWidth, frameHeight]);

  useEffect(() => {
    rendererRef.current?.setMove(move);
  }, [move]);

  useEffect(() => {
    rendererRef.current?.setRotationProgress(rotationProgress);
  }, [rotationProgress]);

  useEffect(() => {
    rendererRef.current?.setFaceColors(visibleFaceColors, scannedFaceColors);
  }, [visibleFaceColors, scannedFaceColors]);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const tick = () => {
      rendererRef.current?.render(pose, faceMatchesMove);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pose, active, faceMatchesMove]);

  const style = coverRect
    ? {
        left: `${coverRect.left}px`,
        top: `${coverRect.top}px`,
        width: `${coverRect.width}px`,
        height: `${coverRect.height}px`,
      }
    : undefined;

  return (
    <canvas
      ref={canvasRef}
      className={`cube-ar-overlay${active ? ' active' : ''}`}
      style={style}
      aria-hidden="true"
    />
  );
}
