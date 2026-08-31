import { useEffect, useRef } from 'react';
import type { CubePose, Move } from '../types';
import { ARRenderer } from '../lib/three/arRenderer';

interface AROverlayProps {
  pose: CubePose | null;
  move: Move | null;
  rotationProgress: number;
  width: number;
  height: number;
  active: boolean;
}

export function AROverlay({
  pose,
  move,
  rotationProgress,
  width,
  height,
  active,
}: AROverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ARRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new ARRenderer(canvas);
    rendererRef.current = renderer;

    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.resize(width, height);
  }, [width, height]);

  useEffect(() => {
    rendererRef.current?.setMove(move);
  }, [move]);

  useEffect(() => {
    rendererRef.current?.setRotationProgress(rotationProgress);
  }, [rotationProgress]);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const tick = () => {
      rendererRef.current?.tick();
      rendererRef.current?.render(pose);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pose, active]);

  return (
    <canvas
      ref={canvasRef}
      className={`ar-overlay${active ? ' active' : ''}`}
      aria-hidden="true"
    />
  );
}
