/** cubejs URFDLB facelet indices for edge and corner cubies. */
const EDGE_POSITIONS: ReadonlyArray<readonly [number, number]> = [
  [5, 10],
  [7, 19],
  [3, 37],
  [1, 46],
  [32, 16],
  [28, 25],
  [30, 43],
  [34, 52],
  [23, 12],
  [21, 41],
  [50, 39],
  [48, 14],
];

const VALID_EDGE_PAIRS = new Set([
  'UR', 'RU', 'UF', 'FU', 'UL', 'LU', 'UB', 'BU',
  'DR', 'RD', 'DF', 'FD', 'DL', 'LD', 'DB', 'BD',
  'FR', 'RF', 'FL', 'LF', 'BL', 'LB', 'BR', 'RB',
]);

const CORNER_POSITIONS: ReadonlyArray<readonly [number, number, number]> = [
  [8, 9, 20],
  [6, 18, 38],
  [0, 36, 47],
  [2, 45, 11],
  [29, 26, 15],
  [27, 44, 24],
  [33, 53, 42],
  [35, 17, 51],
];

const CORNER_COLOR_TRIPLES: ReadonlyArray<readonly [string, string, string]> = [
  ['U', 'R', 'F'],
  ['U', 'F', 'L'],
  ['U', 'L', 'B'],
  ['U', 'B', 'R'],
  ['D', 'F', 'R'],
  ['D', 'L', 'F'],
  ['D', 'B', 'L'],
  ['D', 'R', 'B'],
];

function isValidEdgePair(a: string, b: string): boolean {
  return VALID_EDGE_PAIRS.has(`${a}${b}`);
}

function isValidCornerTriple(a: string, b: string, c: string): boolean {
  for (const triple of CORNER_COLOR_TRIPLES) {
    for (let ori = 0; ori < 3; ori++) {
      if (
        a === triple[ori % 3] &&
        b === triple[(ori + 1) % 3] &&
        c === triple[(ori + 2) % 3]
      ) {
        return true;
      }
    }
  }
  return false;
}

export function isFaceletEdgeConsistent(facelet: string): boolean {
  if (facelet.length !== 54) return false;

  for (const [a, b] of EDGE_POSITIONS) {
    if (!isValidEdgePair(facelet[a]!, facelet[b]!)) return false;
  }

  return true;
}

export function isFaceletCornerConsistent(facelet: string): boolean {
  if (facelet.length !== 54) return false;

  for (const [a, b, c] of CORNER_POSITIONS) {
    if (!isValidCornerTriple(facelet[a]!, facelet[b]!, facelet[c]!)) return false;
  }

  return true;
}

/** Edge + corner rules match cubejs assembly constraints (no solve() needed). */
export function isFaceletStructurallyValid(facelet: string): boolean {
  return isFaceletEdgeConsistent(facelet) && isFaceletCornerConsistent(facelet);
}
