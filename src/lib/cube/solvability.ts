/** Minimal cube state needed for physical-solvability checks (Kociemba parity laws). */
export interface CubePermutationState {
  cp: number[];
  ep: number[];
}

export interface CubeParityState extends CubePermutationState {
  cornerParity(): number;
  edgeParity(): number;
  co: number[];
  eo: number[];
}

/** Each corner and edge position must hold a unique cubie (no duplicates). */
export function isCubePermutationValid(cube: CubePermutationState): boolean {
  return new Set(cube.cp).size === 8 && new Set(cube.ep).size === 12;
}

/**
 * Returns false for sticker layouts that cannot occur on a real 3x3 cube.
 * Permutation validity is required — parity alone admits states that hang cubejs solve().
 */
export function isCubePhysicallySolvable(cube: CubeParityState): boolean {
  if (!isCubePermutationValid(cube)) {
    return false;
  }

  if (cube.cornerParity() !== cube.edgeParity()) {
    return false;
  }

  const cornerOrientationSum = cube.co.reduce((sum, value) => sum + value, 0);
  if (cornerOrientationSum % 3 !== 0) {
    return false;
  }

  const edgeOrientationSum = cube.eo.reduce((sum, value) => sum + value, 0);
  if (edgeOrientationSum % 2 !== 0) {
    return false;
  }

  return true;
}
