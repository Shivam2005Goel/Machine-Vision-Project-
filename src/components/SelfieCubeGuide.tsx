import { useEffect, useRef } from 'react';
import type { Move } from '../types';
import { CubeHintRenderer } from '../lib/three/cubeHintRenderer';

interface SelfieCubeGuideProps {
  move: Move;
  facelet: string;
}

export function SelfieCubeGuide({ move, facelet }: SelfieCubeGuideProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CubeHintRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new CubeHintRenderer(canvas);
    rendererRef.current = renderer;

    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.setScene(move, facelet);
  }, [move, facelet]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const sync = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w < 8 || h < 8) return;
      rendererRef.current?.resize(w, h);
      rendererRef.current?.render();
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="selfie-cube-guide">
      <canvas ref={canvasRef} className="selfie-cube-guide-canvas" />
    </div>
  );
}
