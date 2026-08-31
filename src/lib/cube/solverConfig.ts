/** God's number in half-turn metric (U2 counts as one move). */
export const GODS_NUMBER_HTM = 20;

/** cubejs Kociemba search depth — caps solutions at God's number (HTM). */
export const KOCIEMBA_SOLVE_MAX_DEPTH = GODS_NUMBER_HTM;

/**
 * solve(20) is usually fast (median ~350ms) but hard scrambles can take tens of
 * seconds. Keep worker timeout below the UI timeout.
 */
export const SOLVE_PROBE_TIMEOUT_MS = 60_000;

/** UI abort if the worker has not returned a solution yet. */
export const CLIENT_SOLVE_TIMEOUT_MS = 65_000;
