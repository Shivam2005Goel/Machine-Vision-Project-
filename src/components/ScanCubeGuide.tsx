import { useEffect, useRef } from 'react';
import type { FaceId, ReadColor } from '../types';
import { ScanCubeRenderer } from '../lib/three/scanCubeRenderer';

interface ScanCubeGuideProps {
  scannedFaces: Partial<Record<FaceId, ReadColor[]>>;
  previewFace: FaceId | null;
  previewColors: ReadColor[] | null;
}

export function ScanCubeGuide({
  scannedFaces,
  previewFace,
  previewColors,
}: ScanCubeGuideProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ScanCubeRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new ScanCubeRenderer(canvas);
    rendererRef.current = renderer;
    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.setFaces(scannedFaces, previewFace, previewColors);
  }, [scannedFaces, previewFace, previewColors]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

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
    <div ref={wrapRef} className="scan-cube-guide">
      <canvas ref={canvasRef} className="scan-cube-guide-canvas" />
    </div>
  );
}
