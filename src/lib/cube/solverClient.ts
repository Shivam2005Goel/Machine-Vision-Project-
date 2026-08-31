import type { FaceId, Move, StickerColor } from '../../types';

export type SolverMessage =
  | { type: 'init' }
  | {
      type: 'solve';
      facelet: string;
      scannedFaces: Record<FaceId, StickerColor[]>;
      rawScannedFaces: Record<FaceId, StickerColor[]>;
      captures: StickerColor[][];
      id: number;
    }
  | { type: 'apply'; move: Move; facelet: string; id: number };

export type SolverResponse =
  | { type: 'ready' }
  | { type: 'resolved'; facelet: string; orientationIndices: Record<FaceId, number>; id: number }
  | {
      type: 'solution';
      moves: Move[];
      facelet: string;
      orientationIndices: Record<FaceId, number>;
      id: number;
    }
  | { type: 'facelet'; facelet: string; id: number }
  | { type: 'error'; message: string; id?: number };

export function createSolverWorker(): Worker {
  return new Worker(new URL('../../workers/solver.worker.ts', import.meta.url), {
    type: 'module',
  });
}
