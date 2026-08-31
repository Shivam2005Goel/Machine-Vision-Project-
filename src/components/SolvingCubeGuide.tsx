import { useEffect, useRef } from 'react';
import type { Move } from '../types';
import { inverseMove } from '../lib/cube/moves';
import { applyMoveToFacelet } from '../lib/cube/moveColorProgress';
import { SolveCubeRenderer } from '../lib/three/solveCubeRenderer';

interface SolvingCubeGuideProps {
  /** Cube state BEFORE the current expected move. */
  facelet: string;
  /** Full solution and progress — a completed physical move animates the cube. */
  moves: Move[];
  currentIndex: number;
  wrongMove: Move | null;
  compact?: boolean;
}

function faceletBeforeMoves(facelet: string, completed: Move[]): string {
  let result = facelet;
  for (let i = completed.length - 1; i >= 0; i--) {
    result = applyMoveToFacelet(result, inverseMove(completed[i]!));
  }
  return result;
}

/**
 * Solid 3D cube guide for the solving phase. Uses the solver facelet so
 * cubie stickers stay globally consistent (scan-layout facelets break edges).
 */
export function SolvingCubeGuide({
  facelet,
  moves,
  currentIndex,
  wrongMove,
  compact = false,
}: SolvingCubeGuideProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<SolveCubeRenderer | null>(null);
  const playedIndexRef = useRef(currentIndex);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new SolveCubeRenderer(canvas);
    renderer.setGuideView(compact);
    rendererRef.current = renderer;
    playedIndexRef.current = -1;

    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.setGuideView(compact);
  }, [compact]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const sync = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w < 8 || h < 8) return;
      rendererRef.current?.resize(w, h);
      rendererRef.current?.renderFrame();
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    const currentMove = moves[currentIndex] ?? null;
    const prevIndex = playedIndexRef.current;
    const delta = currentIndex - prevIndex;
    playedIndexRef.current = currentIndex;
    const wrong = Boolean(wrongMove);

    // Drop stale queued animations so auto-play / rapid Next cannot backlog work.
    renderer.cancelAnimations();
    queueRef.current = Promise.resolve();

    const showMoveGuide = async (move: Move | null) => {
      if (rendererRef.current !== renderer) return;
      renderer.setFacelet(facelet);
      if (move) {
        renderer.setMoveArrow(move, wrong);
        await renderer.animateOrientForMove(move);
      } else {
        renderer.setMoveArrow(null);
      }
      renderer.renderFrame();
    };

    if (prevIndex >= 0 && delta > 0 && delta <= 2) {
      const completed = moves.slice(prevIndex, currentIndex);
      queueRef.current = queueRef.current.then(async () => {
        if (rendererRef.current !== renderer) return;
        renderer.setFacelet(faceletBeforeMoves(facelet, completed));
        for (const move of completed) {
          renderer.setMoveArrow(move, wrong);
          await renderer.animateMove(move);
        }
        renderer.setFacelet(facelet);
        if (currentMove) {
          renderer.setMoveArrow(currentMove, wrong);
          await renderer.animateOrientForMove(currentMove);
        } else {
          renderer.setMoveArrow(null);
        }
        renderer.renderFrame();
      });
      return;
    }

    if (delta < 0) {
      queueRef.current = queueRef.current.then(() => showMoveGuide(currentMove));
      return;
    }

    queueRef.current = queueRef.current.then(() => showMoveGuide(currentMove));
  }, [facelet, moves, currentIndex]);

  useEffect(() => {
    const renderer = rendererRef.current;
    const currentMove = moves[currentIndex] ?? null;
    if (!renderer || !currentMove) return;
    queueRef.current = queueRef.current.then(() => {
      if (rendererRef.current !== renderer) return;
      renderer.setMoveArrow(currentMove, Boolean(wrongMove));
      renderer.renderFrame();
    });
  }, [wrongMove, moves, currentIndex]);

  return (
    <div ref={wrapRef} className="solving-cube-guide">
      <canvas ref={canvasRef} className="solving-cube-guide-canvas" />
    </div>
  );
}
