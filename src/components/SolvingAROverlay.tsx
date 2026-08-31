import { useEffect, useRef } from 'react';
import type { CubePose, FaceId, Move } from '../types';
import { moveFace } from '../lib/cube/moves';
import { drawSolvingAR } from '../lib/vision/solvingArDraw';

interface SolvingAROverlayProps {
  pose: CubePose | null;
  move: Move | null;
  rotationProgress: number;
  recognizedFaces: FaceId[];
  frameWidth: number;
  frameHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  active: boolean;
}

export function SolvingAROverlay({
  pose,
  move,
  rotationProgress,
  recognizedFaces,
  frameWidth,
  frameHeight,
  viewportWidth,
  viewportHeight,
  active,
}: SolvingAROverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseRef = useRef(pose);
  const progressRef = useRef(rotationProgress);
  const moveRef = useRef(move);
  const recognizedRef = useRef(recognizedFaces);
  const heldPoseRef = useRef<CubePose | null>(null);
  const lostFramesRef = useRef(0);

  poseRef.current = pose;
  progressRef.current = rotationProgress;
  moveRef.current = move;
  recognizedRef.current = recognizedFaces;

  if (pose) {
    heldPoseRef.current = pose;
    lostFramesRef.current = 0;
  } else if (heldPoseRef.current) {
    lostFramesRef.current++;
    if (lostFramesRef.current > 90) heldPoseRef.current = null;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = Math.max(1, Math.floor(viewportWidth * dpr));
      canvas.height = Math.max(1, Math.floor(viewportHeight * dpr));
      canvas.style.width = `${viewportWidth}px`;
      canvas.style.height = `${viewportHeight}px`;
    };
    resize();

    if (!active) return;

    let raf = 0;
    const tick = () => {
      const ctx = canvas.getContext('2d');
      const currentMove = moveRef.current;
      const currentPose = poseRef.current ?? heldPoseRef.current;
      if (ctx && viewportWidth && viewportHeight) {
        const dpr = Math.min(window.devicePixelRatio, 2);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, viewportWidth, viewportHeight);
        if (currentPose && currentMove && frameWidth && frameHeight) {
          drawSolvingAR(
            ctx,
            currentPose,
            currentMove,
            progressRef.current,
            moveFace(currentMove),
            recognizedRef.current,
            frameWidth,
            frameHeight,
            viewportWidth,
            viewportHeight,
          );
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, frameWidth, frameHeight, viewportWidth, viewportHeight, recognizedFaces]);

  return (
    <canvas
      ref={canvasRef}
      className={`solving-ar-overlay${active ? ' active' : ''}`}
      aria-hidden="true"
    />
  );
}
