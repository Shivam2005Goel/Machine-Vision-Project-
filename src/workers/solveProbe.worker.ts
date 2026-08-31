import Cube from 'cubejs';
import { GODS_NUMBER_HTM, KOCIEMBA_SOLVE_MAX_DEPTH } from '../lib/cube/solverConfig';
import { parseMoves } from '../lib/cube/moves';

let initialized = false;

function ensureInit(): void {
  if (!initialized) {
    Cube.initSolver();
    initialized = true;
  }
}

self.onmessage = (event: MessageEvent<string>) => {
  try {
    ensureInit();
    const algorithm = Cube.fromString(event.data).solve(KOCIEMBA_SOLVE_MAX_DEPTH);
    const moves = parseMoves(algorithm);
    if (moves.length > GODS_NUMBER_HTM) {
      throw new Error(`Solution exceeds God's number (${moves.length} > ${GODS_NUMBER_HTM})`);
    }
    self.postMessage({ type: 'ok', algorithm } satisfies { type: 'ok'; algorithm: string });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Solve failed',
    } satisfies { type: 'error'; message: string });
  }
};
