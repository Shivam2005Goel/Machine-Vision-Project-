import { useEffect, useMemo, useRef } from 'react';
import type { CubePose, FaceId, Move, StickerColor } from '../types';
import { CubeARRenderer } from '../lib/three/cubeArRenderer';
import { getCoverTransform } from '../lib/vision/guideOverlay';
import { alignPoseToTrackedQuad } from '../lib/vision/poseAlign';

interface SolvingCubeAROverlayProps {
  pose: CubePose | null;
  move: Move | null;
  rotationProgress: number;
  liveFaceColors: Partial<Record<FaceId, StickerColor[]>>;
  scannedFaceColors: Partial<Record<FaceId, StickerColor[]>>;
  frameWidth: number;
  frameHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  active: boolean;
}

export function SolvingCubeAROverlay({
  pose,
  move,
  rotationProgress,
  liveFaceColors,
  scannedFaceColors,
  frameWidth,
  frameHeight,
  viewportWidth,
  viewportHeight,
  active,
}: SolvingCubeAROverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CubeARRenderer | null>(null);
  const poseRef = useRef(pose);
  const moveRef = useRef(move);
  const progressRef = useRef(rotationProgress);
  const liveColorsRef = useRef(liveFaceColors);
  const scannedColorsRef = useRef(scannedFaceColors);
  const heldPoseRef = useRef<CubePose | null>(null);
  const lostFramesRef = useRef(0);

  poseRef.current = pose;
  moveRef.current = move;
  progressRef.current = rotationProgress;
  liveColorsRef.current = liveFaceColors;
  scannedColorsRef.current = scannedFaceColors;

  if (pose) {
    heldPoseRef.current = pose;
    lostFramesRef.current = 0;
  } else if (heldPoseRef.current) {
    lostFramesRef.current++;
    if (lostFramesRef.current > 90) heldPoseRef.current = null;
  }

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

    const renderer = new CubeARRenderer(canvas, { mode: 'solving' });
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
    if (!active) return;
    let raf = 0;
    const tick = () => {
      const currentPose = poseRef.current ?? heldPoseRef.current;
      const renderer = rendererRef.current;
      if (renderer) {
        renderer.setRotationProgress(progressRef.current);
      }
      if (currentPose && frameWidth && frameHeight && renderer) {
        const aligned = alignPoseToTrackedQuad(currentPose, frameWidth, frameHeight);
        renderer.setFaceColors(liveColorsRef.current, scannedColorsRef.current);
        renderer.render(aligned, true);
      } else {
        renderer?.render(null);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, frameWidth, frameHeight]);

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
      className={`solving-cube-ar-overlay${active ? ' active' : ''}`}
      style={style}
      aria-hidden="true"
    />
  );
}
