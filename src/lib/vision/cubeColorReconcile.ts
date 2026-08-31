import type { FaceId, ReadColor, StickerColor } from '../../types';
import { emptyColorCounts } from './colorClassifier';
import { isKnownColor, toStickerColors } from './readColorUtils';

const FACE_CENTER: Record<FaceId, StickerColor> = {
  U: 'W',
  D: 'Y',
  F: 'G',
  B: 'B',
  R: 'R',
  L: 'O',
};

const STICKER_COLORS: StickerColor[] = ['W', 'Y', 'R', 'O', 'G', 'B'];
const WARM_COLORS: StickerColor[] = ['R', 'O'];
const TARGET_PER_COLOR = 9;

function possibleColors(counts: Record<StickerColor, number>): StickerColor[] {
  return STICKER_COLORS.filter((color) => counts[color] < TARGET_PER_COLOR);
}

function feasibleColorsForCell(
  counts: Record<StickerColor, number>,
  cell: { faceId: FaceId; index: number },
): StickerColor[] {
  const options = possibleColors(counts);
  const center = FACE_CENTER[cell.faceId];
  if (cell.index === 4) return [center];
  return options;
}

function collectCountsAndUnknowns(result: Map<FaceId, ReadColor[]>): {
  counts: Record<StickerColor, number>;
  unknowns: { faceId: FaceId; index: number }[];
} {
  const counts = emptyColorCounts();
  const unknowns: { faceId: FaceId; index: number }[] = [];

  for (const [faceId, colors] of result) {
    for (let i = 0; i < 9; i++) {
      const c = colors[i]!;
      if (i === 4) {
        counts[FACE_CENTER[faceId]]++;
      } else if (isKnownColor(c)) {
        counts[c]++;
      } else if (c === '?') {
        unknowns.push({ faceId, index: i });
      }
    }
  }

  return { counts, unknowns };
}

/** 색상 간 혼동 비용 (낮을수록 바꾸기 쉬움) */
const SWAP_COST: Record<StickerColor, Record<StickerColor, number>> = {
  W: { W: 0, Y: 1, O: 2, R: 4, G: 5, B: 5 },
  Y: { W: 1, Y: 0, O: 2, R: 5, G: 5, B: 5 },
  R: { R: 0, O: 1, W: 4, Y: 5, G: 5, B: 5 },
  O: { O: 0, R: 1, Y: 2, W: 2, G: 5, B: 5 },
  G: { G: 0, B: 2, W: 5, Y: 5, R: 5, O: 5 },
  B: { B: 0, G: 2, W: 5, Y: 5, R: 5, O: 5 },
};

interface MutableCell {
  faceId: FaceId;
  index: number;
  color: StickerColor;
}

function countAllStickers(faces: Map<FaceId, StickerColor[]>): Record<StickerColor, number> {
  const counts = emptyColorCounts();
  for (const colors of faces.values()) {
    for (const c of colors) {
      counts[c]++;
    }
  }
  return counts;
}

/** Fill uncertain cells using global 9-per-color constraint before reconcile. */
export function fillUncertainCells(
  faces: Map<FaceId, ReadColor[]>,
): Map<FaceId, StickerColor[]> {
  const result = new Map<FaceId, StickerColor[]>();
  const unknowns: { faceId: FaceId; index: number }[] = [];

  for (const [faceId, colors] of faces) {
    const copy: StickerColor[] = [];
    for (let i = 0; i < 9; i++) {
      const c = colors[i]!;
      if (i === 4) {
        copy.push(FACE_CENTER[faceId]);
      } else if (isKnownColor(c)) {
        copy.push(c);
      } else {
        copy.push('W');
        unknowns.push({ faceId, index: i });
      }
    }
    result.set(faceId, copy);
  }

  const counts = countAllStickers(result);

  for (const cell of unknowns) {
    const deficit = findWorstDeficit(counts);
    if (!deficit) break;
    result.get(cell.faceId)![cell.index] = deficit;
    counts[deficit]++;
  }

  return result;
}

export function hasUncertainCells(faces: Map<FaceId, ReadColor[]>): boolean {
  for (const colors of faces.values()) {
    if (colors.some((c) => c === '?')) return true;
  }
  return false;
}

function countScannedStickers(faces: Map<FaceId, ReadColor[]>): Record<StickerColor, number> {
  const counts = emptyColorCounts();
  for (const [faceId, colors] of faces) {
    for (let i = 0; i < 9; i++) {
      if (i === 4) {
        counts[FACE_CENTER[faceId]]++;
      } else if (isKnownColor(colors[i]!)) {
        counts[colors[i] as StickerColor]++;
      }
    }
  }
  return counts;
}

function hasImpossibleSurplus(counts: Record<StickerColor, number>): boolean {
  return STICKER_COLORS.some((color) => counts[color] > TARGET_PER_COLOR);
}

function findCheapestSwapTarget(
  from: StickerColor,
  counts: Record<StickerColor, number>,
): StickerColor | null {
  let best: StickerColor | null = null;
  let bestCost = Infinity;
  for (const to of STICKER_COLORS) {
    if (to === from) continue;
    if (counts[to] >= TARGET_PER_COLOR) continue;
    const cost = getSwapCost(from, to);
    if (cost < bestCost) {
      bestCost = cost;
      best = to;
    }
  }
  return best;
}

function cloneReadFaces(faces: Map<FaceId, ReadColor[]>): Map<FaceId, ReadColor[]> {
  const result = new Map<FaceId, ReadColor[]>();
  for (const [faceId, colors] of faces) {
    result.set(faceId, [...colors]);
  }
  return result;
}

function readFacesEqual(a: Map<FaceId, ReadColor[]>, b: Map<FaceId, ReadColor[]>): boolean {
  if (a.size !== b.size) return false;
  for (const [faceId, colors] of a) {
    const other = b.get(faceId);
    if (!other || other.length !== colors.length) return false;
    for (let i = 0; i < colors.length; i++) {
      if (colors[i] !== other[i]) return false;
    }
  }
  return true;
}

function toStickerFaceMap(faces: Map<FaceId, ReadColor[]>): Map<FaceId, StickerColor[]> {
  const result = new Map<FaceId, StickerColor[]>();
  for (const [faceId, colors] of faces) {
    const row = colors.map((c) => (isKnownColor(c) ? c : 'W'));
    row[4] = FACE_CENTER[faceId];
    result.set(faceId, row);
  }
  return result;
}

function collectWarmSwappableCells(result: Map<FaceId, ReadColor[]>): MutableCell[] {
  const swappable: MutableCell[] = [];
  for (const [faceId, colors] of result) {
    for (let i = 0; i < 9; i++) {
      if (i === 4) continue;
      const c = colors[i]!;
      if (c === 'R' || c === 'O') {
        swappable.push({ faceId, index: i, color: c });
      }
    }
  }
  return swappable;
}

function warmCap(color: StickerColor, faces: Map<FaceId, ReadColor[]>): number {
  if (color === 'R' && !faces.has('R')) return TARGET_PER_COLOR - 1;
  if (color === 'O' && !faces.has('L')) return TARGET_PER_COLOR - 1;
  return TARGET_PER_COLOR;
}

function countPeripheryColor(colors: ReadColor[], color: StickerColor): number {
  let count = 0;
  for (let i = 0; i < 9; i++) {
    if (i === 4) continue;
    if (colors[i] === color) count++;
  }
  return count;
}

function pickWarmSwapCell(
  cells: MutableCell[],
  from: StickerColor,
  to: StickerColor,
  result: Map<FaceId, ReadColor[]>,
): MutableCell | null {
  let best: MutableCell | null = null;
  let bestScore = Infinity;

  for (const cell of cells) {
    if (cell.color !== from) continue;
    if (result.get(cell.faceId)![cell.index] !== from) continue;

    let score = getSwapCost(from, to);
    if (to === 'R' && cell.faceId === 'R') score -= 1.5;
    if (to === 'O' && cell.faceId === 'L') score -= 1.5;
    if (from === 'R' && cell.faceId === 'R') score += 2;
    if (from === 'O' && cell.faceId === 'L') score += 2;
    if (from === 'O' && to === 'R' && cell.faceId !== 'R') score += 0.25;
    if (from === 'R' && to === 'O' && cell.faceId !== 'L') score += 0.25;

    if (score < bestScore) {
      bestScore = score;
      best = cell;
    }
  }

  return best;
}

function applyWarmSwap(
  result: Map<FaceId, ReadColor[]>,
  cell: MutableCell,
  to: StickerColor,
): void {
  cell.color = to;
  result.get(cell.faceId)![cell.index] = to;
}

/** Re-distinguish committed R/O using partial-scan caps and R/L face context. */
export function reconcileRedOrangeFromConstraints(
  faces: Map<FaceId, ReadColor[]>,
): Map<FaceId, ReadColor[]> {
  const result = cloneReadFaces(faces);
  for (const [faceId, colors] of result) {
    colors[4] = FACE_CENTER[faceId];
  }

  const swappable = () => collectWarmSwappableCells(result);

  for (let iter = 0; iter < 48; iter++) {
    let changed = false;
    const counts = countScannedStickers(result);
    const cells = swappable();

    for (const warm of WARM_COLORS) {
      const cap = warmCap(warm, faces);
      const other = warm === 'R' ? 'O' : 'R';
      while (counts[warm] > cap) {
        const cell = pickWarmSwapCell(cells, warm, other, result);
        if (!cell) break;
        applyWarmSwap(result, cell, other);
        counts[warm]--;
        counts[other]++;
        changed = true;
      }
    }

    if (result.has('R') && counts.R < TARGET_PER_COLOR) {
      const rColors = result.get('R')!;
      const oOnR = countPeripheryColor(rColors, 'O');
      const swaps = Math.min(
        TARGET_PER_COLOR - counts.R,
        oOnR,
        !faces.has('L') ? Math.max(0, counts.O - 1) : oOnR,
      );
      for (let i = 0; i < swaps; i++) {
        const cell = pickWarmSwapCell(cells, 'O', 'R', result);
        if (!cell || cell.faceId !== 'R') break;
        applyWarmSwap(result, cell, 'R');
        counts.O--;
        counts.R++;
        changed = true;
      }
    }

    if (result.has('L') && counts.O < TARGET_PER_COLOR) {
      const lColors = result.get('L')!;
      const rOnL = countPeripheryColor(lColors, 'R');
      const swaps = Math.min(
        TARGET_PER_COLOR - counts.O,
        rOnL,
        !faces.has('R') ? Math.max(0, counts.R - 1) : rOnL,
      );
      for (let i = 0; i < swaps; i++) {
        const cell = pickWarmSwapCell(cells, 'R', 'O', result);
        if (!cell || cell.faceId !== 'L') break;
        applyWarmSwap(result, cell, 'O');
        counts.R--;
        counts.O++;
        changed = true;
      }
    }

    const rSurplus = counts.R - TARGET_PER_COLOR;
    const oSurplus = counts.O - TARGET_PER_COLOR;
    if (rSurplus > 0 && counts.O < TARGET_PER_COLOR) {
      const cell = pickWarmSwapCell(cells, 'R', 'O', result);
      if (cell) {
        applyWarmSwap(result, cell, 'O');
        changed = true;
      }
    } else if (oSurplus > 0 && counts.R < TARGET_PER_COLOR) {
      const cell = pickWarmSwapCell(cells, 'O', 'R', result);
      if (cell) {
        applyWarmSwap(result, cell, 'R');
        changed = true;
      }
    }

    if (!changed) break;
  }

  return result;
}

/** Swap similar committed colors when counts exceed 9 (misread under warm light). */
export function reconcileMisreadColors(
  faces: Map<FaceId, ReadColor[]>,
): Map<FaceId, ReadColor[]> {
  const result = cloneReadFaces(faces);

  for (const [faceId, colors] of result) {
    colors[4] = FACE_CENTER[faceId];
  }

  const swappable: MutableCell[] = [];
  for (const [faceId, colors] of result) {
    for (let i = 0; i < 9; i++) {
      if (i === 4) continue;
      const c = colors[i]!;
      if (isKnownColor(c)) {
        swappable.push({ faceId, index: i, color: c });
      }
    }
  }

  for (let iter = 0; iter < 64; iter++) {
    const counts = countScannedStickers(result);
    if (!hasImpossibleSurplus(counts)) break;

    const over = findWorstSurplus(counts);
    if (!over) break;

    const under = findCheapestSwapTarget(over, counts);
    if (!under) break;

    let bestCell: MutableCell | null = null;
    let bestCost = Infinity;
    for (const cell of swappable) {
      if (cell.color !== over) continue;
      const cost = getSwapCost(over, under);
      if (cost < bestCost) {
        bestCost = cost;
        bestCell = cell;
      }
    }
    if (!bestCell) break;

    bestCell.color = under;
    result.get(bestCell.faceId)![bestCell.index] = under;
  }

  return result;
}

/** Infer ? cells, fix impossible counts via similar-color swaps, repeat until stable. */
export function reconcileLiveScanFaces(
  faces: Map<FaceId, ReadColor[]>,
): Map<FaceId, ReadColor[]> {
  let current = sanitizeDominantMisreads(cloneReadFaces(faces));

  for (let pass = 0; pass < 12; pass++) {
    const previous = cloneReadFaces(current);
    current = inferUncertainCells(
      reconcileRedOrangeFromConstraints(reconcileMisreadColors(current)),
    );

    if (current.size === 6 && !hasUncertainCells(current)) {
      const counts = countScannedStickers(current);
      if (!isBalanced(counts)) {
        const balanced = reconcileCubeFaces(toStickerFaceMap(current));
        current = cloneReadFaces(balanced);
      }
    }

    if (readFacesEqual(previous, current)) break;
  }

  return current;
}

/** Fill ? cells when cube color counts force a unique assignment. */
export function inferUncertainCells(
  faces: Map<FaceId, ReadColor[]>,
): Map<FaceId, ReadColor[]> {
  const result = new Map<FaceId, ReadColor[]>();
  for (const [faceId, colors] of faces) {
    result.set(faceId, [...colors]);
  }

  let changed = true;
  while (changed) {
    changed = false;
    const { counts, unknowns } = collectCountsAndUnknowns(result);
    if (unknowns.length === 0) break;

    const assign = (cell: { faceId: FaceId; index: number }, color: StickerColor) => {
      result.get(cell.faceId)![cell.index] = color;
      changed = true;
    };

    if (unknowns.length === 1) {
      const deficits = possibleColors(counts);
      if (deficits.length === 1) {
        assign(unknowns[0]!, deficits[0]!);
        continue;
      }
    }

    for (const cell of unknowns) {
      const feasible = feasibleColorsForCell(counts, cell);
      if (feasible.length === 1) {
        assign(cell, feasible[0]!);
      }
    }
    if (changed) continue;

    for (const color of STICKER_COLORS) {
      const deficit = TARGET_PER_COLOR - counts[color];
      if (deficit <= 0) continue;

      const eligible = unknowns.filter((cell) => {
        if (result.get(cell.faceId)![cell.index] !== '?') return false;
        return possibleColors(counts).includes(color);
      });

      if (deficit === 1 && eligible.length === 1) {
        assign(eligible[0]!, color);
      }
    }
    if (changed) continue;

    const warmUnknowns = unknowns.filter((cell) => {
      if (result.get(cell.faceId)![cell.index] !== '?') return false;
      const feasible = feasibleColorsForCell(counts, cell);
      return feasible.every((c) => WARM_COLORS.includes(c));
    });
    const rDeficit = TARGET_PER_COLOR - counts.R;
    const oDeficit = TARGET_PER_COLOR - counts.O;
    if (warmUnknowns.length === 1) {
      if (rDeficit === 1 && oDeficit === 0) assign(warmUnknowns[0]!, 'R');
      else if (oDeficit === 1 && rDeficit === 0) assign(warmUnknowns[0]!, 'O');
    }
    if (changed) continue;

    for (const cell of unknowns) {
      if (result.get(cell.faceId)![cell.index] !== '?') continue;

      const faceColors = result.get(cell.faceId)!;
      const knownOnFace = faceColors.filter(isKnownColor);
      if (knownOnFace.length < 7) continue;

      const tallies = emptyColorCounts();
      for (const c of knownOnFace) tallies[c]++;
      let dominant: StickerColor = knownOnFace[0]!;
      let dominantCount = 0;
      for (const color of STICKER_COLORS) {
        if (tallies[color] > dominantCount) {
          dominantCount = tallies[color];
          dominant = color;
        }
      }
      if (dominantCount >= 7 && counts[dominant] < TARGET_PER_COLOR) {
        if (dominant !== 'R' && dominant !== 'O') {
          assign(cell, dominant);
        }
      }
    }
  }

  return result;
}

/** Pass-through clone — per-face auto-correction removed. */
export function sanitizeDominantMisreads(
  faces: Map<FaceId, ReadColor[]>,
): Map<FaceId, ReadColor[]> {
  return cloneReadFaces(faces);
}

/** Mark suspect colors on flagged faces uncertain, then re-run reconcileLiveScanFaces. */
export function recoverSuspiciousFaces(
  faces: Map<FaceId, ReadColor[]>,
  issues: ScanQualityIssue[],
): Map<FaceId, ReadColor[]> {
  const result = cloneReadFaces(faces);
  for (const issue of issues) {
    const colors = result.get(issue.faceId);
    if (!colors) continue;
    for (let i = 0; i < 9; i++) {
      if (i === 4) continue;
      if (colors[i] === issue.suspectColor) colors[i] = '?';
    }
  }
  return result;
}

function getSwapCost(from: StickerColor, to: StickerColor): number {
  return SWAP_COST[from][to] ?? 6;
}

function findWorstSurplus(counts: Record<StickerColor, number>): StickerColor | null {
  let worst: StickerColor | null = null;
  let amount = 0;
  for (const color of STICKER_COLORS) {
    const diff = counts[color] - TARGET_PER_COLOR;
    if (diff > amount) {
      amount = diff;
      worst = color;
    }
  }
  return worst;
}

function findWorstDeficit(counts: Record<StickerColor, number>): StickerColor | null {
  let worst: StickerColor | null = null;
  let amount = 0;
  for (const color of STICKER_COLORS) {
    const diff = TARGET_PER_COLOR - counts[color];
    if (diff > amount) {
      amount = diff;
      worst = color;
    }
  }
  return worst;
}

function isBalanced(counts: Record<StickerColor, number>): boolean {
  return STICKER_COLORS.every((c) => counts[c] === TARGET_PER_COLOR);
}

/** 가운데 스티커 고정 + 전역 9개 제약 (최소 비용 스왑) */
export function reconcileCubeFaces(
  faces: Map<FaceId, StickerColor[]>,
): Map<FaceId, StickerColor[]> {
  const result = new Map<FaceId, StickerColor[]>();
  for (const [faceId, colors] of faces) {
    const copy = [...colors];
    copy[4] = FACE_CENTER[faceId];
    result.set(faceId, copy);
  }

  const cells: MutableCell[] = [];
  for (const [faceId, colors] of result) {
    for (let i = 0; i < 9; i++) {
      if (i === 4) continue;
      cells.push({ faceId, index: i, color: colors[i]! });
    }
  }

  for (let iter = 0; iter < 256; iter++) {
    const counts = countAllStickers(result);
    if (isBalanced(counts)) break;

    const over = findWorstSurplus(counts);
    const under = findWorstDeficit(counts);
    if (!over || !under) break;

    let bestCell: MutableCell | null = null;
    let bestCost = Infinity;

    for (const cell of cells) {
      if (cell.color !== over) continue;
      const cost = getSwapCost(over, under);
      if (cost < bestCost) {
        bestCost = cost;
        bestCell = cell;
      }
    }

    if (!bestCell) {
      const fallback = cells.find((c) => c.color === over);
      if (!fallback) break;
      bestCell = fallback;
    }

    bestCell.color = under;
    result.get(bestCell.faceId)![bestCell.index] = under;
  }

  return result;
}

export function getStickerImbalance(
  faces: Map<FaceId, StickerColor[]>,
): Record<StickerColor, number> {
  const counts = countAllStickers(faces);
  const imbalance = emptyColorCounts();
  for (const color of STICKER_COLORS) {
    imbalance[color] = counts[color] - TARGET_PER_COLOR;
  }
  return imbalance;
}

export function formatImbalanceHint(faces: Map<FaceId, StickerColor[]>): string {
  const imbalance = getStickerImbalance(faces);
  const labels: Record<StickerColor, string> = {
    W: 'W',
    Y: 'Y',
    R: 'R',
    O: 'O',
    G: 'G',
    B: 'B',
  };
  const parts = STICKER_COLORS.filter((c) => imbalance[c] !== 0).map((c) => {
    const n = imbalance[c];
    return `${labels[c]}${n > 0 ? `+${n}` : n}`;
  });
  return parts.length > 0 ? parts.join(', ') : '';
}

const FACE_LABEL: Record<FaceId, string> = {
  U: 'W',
  D: 'Y',
  F: 'G',
  B: 'B',
  R: 'R',
  L: 'O',
};

export interface ScanQualityIssue {
  faceId: FaceId;
  label: string;
  message: string;
  suspectColor: StickerColor;
}

/** Detect impossible local patterns (e.g. 6 whites on the green face). */
export function detectSuspiciousScanFaces(
  faces: Map<FaceId, StickerColor[]>,
): ScanQualityIssue[] {
  const issues: ScanQualityIssue[] = [];

  for (const [faceId, colors] of faces) {
    if (colors.length !== 9) continue;

    const center = FACE_CENTER[faceId];
    const label = FACE_LABEL[faceId];
    const tallies = emptyColorCounts();

    for (let i = 0; i < 9; i++) {
      if (i === 4) continue;
      tallies[colors[i]!]++;
    }

    if (center !== 'W' && tallies.W >= 4) {
      issues.push({
        faceId,
        label,
        message: `${label} face: too many white stickers detected`,
        suspectColor: 'W',
      });
      continue;
    }

    for (const color of STICKER_COLORS) {
      if (color === center) continue;
      const threshold = faceId === 'B' && color === 'Y' ? 4 : 5;
      if (tallies[color] >= threshold) {
        issues.push({
          faceId,
          label,
          message: `${label} face: unlikely ${color} count (${tallies[color]}/8)`,
          suspectColor: color,
        });
        break;
      }
    }
  }

  return issues;
}

const PALETTE_FACE_ORDER: FaceId[] = ['U', 'F', 'R', 'B', 'L', 'D'];

function imbalanceWouldBalance(
  imbalance: Record<StickerColor, number>,
  from: StickerColor,
  to: StickerColor,
): boolean {
  const next = { ...imbalance };
  next[from]--;
  next[to]++;
  return STICKER_COLORS.every((c) => next[c] === 0);
}

function scoreSingleFixCandidate(
  faceId: FaceId,
  colors: StickerColor[],
  read: StickerColor,
  replacement: StickerColor,
  imbalance: Record<StickerColor, number>,
): number {
  let score = 0;
  if (imbalance[read] > 0 && imbalance[replacement] < 0) score += 100;
  score += (6 - getSwapCost(read, replacement)) * 10;

  const center = FACE_CENTER[faceId];
  if (read !== center) score += 40;

  const edges = colors.filter((_, index) => index !== 4);
  const surplusColors = STICKER_COLORS.filter((c) => imbalance[c] > 0);
  if (surplusColors.length > 0 && edges.every((c) => c === surplusColors[0])) {
    score -= 90;
  }

  const mismatchedEdges = edges.filter((c) => c !== center).length;
  score += mismatchedEdges * 6;

  return score;
}

/** Faces where changing one edge sticker would fix the global colour counts. */
function findSingleSwapFixFaces(
  faces: Map<FaceId, StickerColor[]>,
  imbalance: Record<StickerColor, number>,
): FaceId[] {
  const faceScores = new Map<FaceId, number>();

  for (const [faceId, colors] of faces) {
    for (let i = 0; i < 9; i++) {
      if (i === 4) continue;
      const read = colors[i]!;
      for (const replacement of STICKER_COLORS) {
        if (replacement === read) continue;
        if (!imbalanceWouldBalance(imbalance, read, replacement)) continue;

        const score = scoreSingleFixCandidate(faceId, colors, read, replacement, imbalance);
        faceScores.set(faceId, Math.max(faceScores.get(faceId) ?? -Infinity, score));
      }
    }
  }

  if (faceScores.size === 0) return [];

  const top = Math.max(...faceScores.values());
  return PALETTE_FACE_ORDER.filter((id) => faceScores.get(id) === top);
}

function scoreFacesBySurplusStickers(
  faces: Map<FaceId, StickerColor[]>,
  imbalance: Record<StickerColor, number>,
): FaceId[] {
  const surplus = STICKER_COLORS.filter((c) => imbalance[c] > 0);
  if (surplus.length === 0) return [];

  const scores = new Map<FaceId, number>();
  for (const [faceId, colors] of faces) {
    let score = 0;
    for (let i = 0; i < 9; i++) {
      if (i === 4) continue;
      const c = colors[i]!;
      if (surplus.includes(c)) score += imbalance[c];
    }
    if (score > 0) scores.set(faceId, score);
  }

  if (scores.size === 0) return [];

  const top = Math.max(...scores.values());
  return PALETTE_FACE_ORDER.filter((id) => scores.get(id) === top);
}

/** Guess which scanned faces are most likely misread. */
export function suggestRescanFaces(faces: Map<FaceId, StickerColor[]>): FaceId[] {
  const imbalance = getStickerImbalance(faces);
  const singleFix = findSingleSwapFixFaces(faces, imbalance);
  if (singleFix.length > 0) return singleFix;

  const suspicious = detectSuspiciousScanFaces(faces);
  if (suspicious.length > 0) {
    const ids = [...new Set(suspicious.map((issue) => issue.faceId))];
    return PALETTE_FACE_ORDER.filter((id) => ids.includes(id));
  }

  return scoreFacesBySurplusStickers(faces, imbalance);
}

/** Shared user-facing message when scan colours cannot form a valid cube. */
export const SCAN_RESCAN_MESSAGE =
  'Could not build a valid cube from the scan. Please re-scan all faces.';

/** User-facing colour-mismatch message with re-scan guidance. */
export function formatColourMismatchError(_faces: Map<FaceId, StickerColor[]>): string {
  return SCAN_RESCAN_MESSAGE;
}

/** Balanced counts but solver could not assemble a valid cube. */
export function formatArrangementFailureError(_faces: Map<FaceId, StickerColor[]>): string {
  return SCAN_RESCAN_MESSAGE;
}

export function solveMapFromScannedRecord(
  record: Partial<Record<FaceId, ReadColor[]>>,
): Map<FaceId, StickerColor[]> | null {
  const allFaces: FaceId[] = ['U', 'D', 'F', 'B', 'R', 'L'];
  if (!allFaces.every((id) => record[id]?.length === 9)) return null;

  const map = new Map<FaceId, StickerColor[]>();
  for (const faceId of allFaces) {
    const colors = [...toStickerColors(record[faceId]!)] as StickerColor[];
    colors[4] = FACE_CENTER[faceId];
    map.set(faceId, colors);
  }
  return map;
}

export function formatScanQualityHint(issues: ScanQualityIssue[]): string {
  if (issues.length === 0) return '';
  return SCAN_RESCAN_MESSAGE;
}

export function isCubeColorBalanced(faces: Map<FaceId, StickerColor[]>): boolean {
  return isBalanced(countAllStickers(faces));
}
