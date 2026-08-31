import Cube from 'cubejs';
import { resolveFaceletForSolve } from '../lib/cube/resolveFacelet';
import {
  GODS_NUMBER_HTM,
  KOCIEMBA_SOLVE_MAX_DEPTH,
  SOLVE_PROBE_TIMEOUT_MS,
} from '../lib/cube/solverConfig';
import { parseMoves } from '../lib/cube/moves';
import type { SolverMessage, SolverResponse } from '../lib/cube/solverClient';

const SOLVED_FACELET = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const RESOLVE_BUDGET_MS = 12_000;

let initialized = false;

function ensureInit(): void {
  if (!initialized) {
    Cube.initSolver();
    initialized = true;
  }
}

function warmupSolver(): void {
  ensureInit();
  const cube = Cube.fromString(SOLVED_FACELET);
  cube.solve(KOCIEMBA_SOLVE_MAX_DEPTH);
}

function solveFaceletInChildWorker(facelet: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./solveProbe.worker.ts', import.meta.url), {
      type: 'module',
    });

    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('Solve probe timed out'));
    }, timeoutMs);

    worker.onmessage = (event: MessageEvent<{ type: 'ok'; algorithm: string } | { type: 'error'; message: string }>) => {
      clearTimeout(timer);
      worker.terminate();
      const msg = event.data;
      if (msg.type === 'ok') resolve(msg.algorithm);
      else reject(new Error(msg.message));
    };

    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error('Solve probe failed'));
    };

    worker.postMessage(facelet);
  });
}

const UNSOLVABLE_MESSAGE =
  'Could not build a valid cube from the scan. Please re-scan all faces.';

self.onmessage = (event: MessageEvent<SolverMessage>) => {
  const msg = event.data;

  if (msg.type === 'init') {
    try {
      warmupSolver();
      self.postMessage({ type: 'ready' } satisfies SolverResponse);
    } catch (error) {
      self.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'Solver init failed',
      } satisfies SolverResponse);
    }
    return;
  }

  if (msg.type === 'solve') {
    void (async () => {
      try {
        ensureInit();

        const resolved = resolveFaceletForSolve(
          msg.scannedFaces,
          msg.captures,
          msg.rawScannedFaces,
          RESOLVE_BUDGET_MS,
        );
        if (!resolved) {
          self.postMessage({
            type: 'error',
            message: UNSOLVABLE_MESSAGE,
            id: msg.id,
          } satisfies SolverResponse);
          return;
        }

        self.postMessage({
          type: 'resolved',
          facelet: resolved.facelet,
          orientationIndices: resolved.rotationIndices,
          id: msg.id,
        } satisfies SolverResponse);

        const algorithm = await solveFaceletInChildWorker(resolved.facelet, SOLVE_PROBE_TIMEOUT_MS);
        const moves = parseMoves(algorithm);
        if (moves.length > GODS_NUMBER_HTM) {
          throw new Error(`Solution exceeds God's number (${moves.length} > ${GODS_NUMBER_HTM})`);
        }
        self.postMessage({
          type: 'solution',
          moves,
          facelet: resolved.facelet,
          orientationIndices: resolved.rotationIndices,
          id: msg.id,
        } satisfies SolverResponse);
      } catch (error) {
        self.postMessage({
          type: 'error',
          message:
            error instanceof Error && error.message.includes('timed out')
              ? UNSOLVABLE_MESSAGE
              : error instanceof Error
                ? error.message
                : 'Solver error',
          id: msg.id,
        } satisfies SolverResponse);
      }
    })();
    return;
  }

  if (msg.type === 'apply') {
    try {
      const cube = Cube.fromString(msg.facelet);
      cube.move(msg.move);
      self.postMessage({
        type: 'facelet',
        facelet: cube.asString(),
        id: msg.id,
      } satisfies SolverResponse);
    } catch (error) {
      self.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'Solver error',
        id: msg.id,
      } satisfies SolverResponse);
    }
  }
};
