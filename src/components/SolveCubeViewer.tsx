import { useCallback, useEffect, useRef, useState } from 'react';
import type { Move } from '../types';
import { solvedFacelet } from '../lib/cube/faceletColors';
import { SolveCubeRenderer } from '../lib/three/solveCubeRenderer';

interface SolveCubeViewerProps {
  visible: boolean;
  facelet: string | null;
  moves: Move[];
  /** Moves completed on the physical cube (AR tracking). */
  currentIndex: number;
  solved: boolean;
}

export function SolveCubeViewer({
  visible,
  facelet,
  moves,
  currentIndex,
  solved,
}: SolveCubeViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<SolveCubeRenderer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const faceletRef = useRef(facelet ?? solvedFacelet());
  const autoPlayedKeyRef = useRef('');
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const [playing, setPlaying] = useState(false);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const enqueue = useCallback((fn: () => Promise<void>) => {
    queueRef.current = queueRef.current.then(fn).catch(() => undefined);
    return queueRef.current;
  }, []);

  const resetCube = useCallback(() => {
    const initial = facelet ?? solvedFacelet();
    faceletRef.current = initial;
    rendererRef.current?.setFacelet(initial);
    setPlaybackIndex(0);
  }, [facelet]);

  const playMoveAt = useCallback(
    (index: number) =>
      enqueue(async () => {
        const move = moves[index];
        const renderer = rendererRef.current;
        if (!move || !renderer) return;
        setPlaying(true);
        await renderer.animateMove(move);
        setPlaybackIndex(index + 1);
        setPlaying(false);
      }),
    [enqueue, moves],
  );

  const playRange = useCallback(
    async (from: number, to: number) => {
      for (let i = from; i < to; i++) {
        await playMoveAt(i);
        if (i < to - 1) {
          await new Promise((r) => setTimeout(r, 140));
        }
      }
    },
    [playMoveAt],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !visible) return;

    const renderer = new SolveCubeRenderer(canvas);
    rendererRef.current = renderer;
    renderer.setFacelet(faceletRef.current);
    renderer.startIdleSpin();

    const ro = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      renderer.resize(rect.width, rect.height);
    });
    ro.observe(container);
    const rect = container.getBoundingClientRect();
    renderer.resize(rect.width, rect.height);

    return () => {
      ro.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || !facelet) return;
    faceletRef.current = facelet;
    queueRef.current = Promise.resolve();
    autoPlayedKeyRef.current = '';
    resetCube();
  }, [facelet, visible, resetCube]);

  useEffect(() => {
    if (!visible || moves.length === 0 || !autoPlay || !facelet) return;
    const key = `${facelet}:${moves.join(' ')}`;
    if (autoPlayedKeyRef.current === key) return;
    autoPlayedKeyRef.current = key;
    void playRange(0, moves.length);
  }, [visible, moves, autoPlay, facelet, playRange]);

  useEffect(() => {
    if (!visible || currentIndex <= playbackIndex) return;
    void playRange(playbackIndex, currentIndex);
  }, [currentIndex, playbackIndex, visible, playRange]);

  const handleMoveClick = (index: number) => {
    if (playing) return;
    if (index < playbackIndex) {
      resetCube();
      void playRange(0, index + 1);
      return;
    }
    if (index >= playbackIndex) {
      void playRange(playbackIndex, index + 1);
    }
  };

  if (!visible || moves.length === 0) return null;

  const activeMoveIndex = Math.min(
    playing ? Math.max(0, playbackIndex - 1) : Math.max(0, playbackIndex - 1),
    moves.length - 1,
  );

  return (
    <div className="solve-viewer" ref={containerRef}>
      <div className="solve-viewer-cube-wrap">
        <canvas ref={canvasRef} className="solve-viewer-canvas" />
        {solved && <p className="solve-viewer-done">Done</p>}
      </div>

      <div className="solve-viewer-moves" role="list" aria-label="Solution moves">
        {moves.map((move, index) => (
          <button
            key={`${move}-${index}`}
            type="button"
            role="listitem"
            className={`solve-move-btn${index === activeMoveIndex && playing ? ' solve-move-btn--active' : ''}${index < playbackIndex ? ' solve-move-btn--done' : ''}`}
            onClick={() => handleMoveClick(index)}
            disabled={playing}
          >
            {move}
          </button>
        ))}
      </div>

      <label className="solve-viewer-autoplay">
        <input
          type="checkbox"
          checked={autoPlay}
          onChange={(e) => {
            autoPlayedKeyRef.current = '';
            setAutoPlay(e.target.checked);
          }}
        />
        Auto Play
      </label>
    </div>
  );
}
