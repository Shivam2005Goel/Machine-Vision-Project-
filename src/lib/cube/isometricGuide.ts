import type { FaceId, Move, StickerColor } from '../../types';
import { ALL_FACE_IDS, FACE_MODEL_CORNERS } from '../vision/faceModels';
import { FACE_NORMALS } from './moves';
import { getSelfieDisplayMove } from './moveRotationDisplay';
import { isPrimeMove, moveAngle, moveFace } from './moves';

export interface Point2 {
  x: number;
  y: number;
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface IsoCell {
  faceId: FaceId;
  index: number;
  points: Point2[];
  center: Point2;
  isTurning: boolean;
}

export interface IsoArrow {
  path: string;
  head: Point2;
  headAngle: number;
}

export interface IsoFaceOutline {
  faceId: FaceId;
  points: Point2[];
  label: Point2;
}

export interface IsoScanCell extends IsoCell {
  depth: number;
}

export interface IsoScanCubeModel {
  cells: IsoScanCell[];
  faceOutlines: IsoFaceOutline[];
  size: number;
  visibleFaceIds: FaceId[];
}

export interface IsoScanViewAngle {
  yaw: number;
  pitch: number;
}

const SCAN_PITCH = -0.52;
/** F–R–U corner toward viewer (not B–L–U). */
const SCAN_YAW_DEFAULT = (3 * Math.PI) / 4;

/** Classic 3/4 corner view — U + two sides, vertical edge toward viewer (reference pose). */
export const REFERENCE_CORNER_VIEW: IsoScanViewAngle = {
  yaw: SCAN_YAW_DEFAULT,
  pitch: SCAN_PITCH,
};

/** Isometric viewpoint that best shows each face after capture (B spins ~180°). */
export const SCAN_VIEW_FOR_FACE: Record<FaceId, IsoScanViewAngle> = {
  F: { ...REFERENCE_CORNER_VIEW },
  R: { yaw: Math.PI / 2, pitch: SCAN_PITCH },
  L: { yaw: -Math.PI / 2, pitch: SCAN_PITCH },
  B: { yaw: -Math.PI / 4, pitch: SCAN_PITCH },
  U: { yaw: SCAN_YAW_DEFAULT, pitch: -0.62 },
  D: { yaw: SCAN_YAW_DEFAULT, pitch: -0.28 },
};

export interface IsoFaceGroup {
  faceId: FaceId;
  depth: number;
  cells: IsoCell[];
  outline: IsoFaceOutline;
  /** Interior grid segments (screen-space, gap-free). */
  gridLines: string[];
}

export interface CornerCubeModel {
  faceGroups: IsoFaceGroup[];
  size: number;
  visibleFaceIds: FaceId[];
}

export function selectCornerFaces(yaw: number, pitch: number): FaceId[] {
  const scored = ALL_FACE_IDS.map((faceId) => ({
    faceId,
    nz: transformNormal(faceId, yaw, pitch).z,
  })).sort((a, b) => a.nz - b.nz);

  const facing = scored.filter((entry) => entry.nz < -0.05);
  const picked = (facing.length >= 3 ? facing : scored).slice(0, 3);
  return picked.map((entry) => entry.faceId);
}

function faceAvgDepth(faceId: FaceId, yaw: number, pitch: number): number {
  const corners = FACE_MODEL_CORNERS[faceId]!;
  let sum = 0;
  for (const [x, y, z] of corners) {
    sum += transformPointYawPitch({ x, y, z }, yaw, pitch).z;
  }
  return sum / corners.length;
}

export function orderQuadCornersCCW(points: Point2[]): [Point2, Point2, Point2, Point2] {
  const pts = [...points] as Point2[];
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % 4]!;
    area += p.x * q.y - q.x * p.y;
  }
  if (area < 0) pts.reverse();
  return pts as [Point2, Point2, Point2, Point2];
}

function faceCorners2dWithView(
  faceId: FaceId,
  yaw: number,
  pitch: number,
  scale: number,
  cx: number,
  cy: number,
  mirrorX: boolean,
): Point2[] {
  return FACE_MODEL_CORNERS[faceId]!.map(([x, y, z]) =>
    isoProject(transformPointYawPitch({ x, y, z }, yaw, pitch), scale, cx, cy, mirrorX),
  );
}

/** Bilinear subdivision in screen space — adjacent cells share edges exactly. */
export function bilinearFacePoint(
  corners: [Point2, Point2, Point2, Point2],
  u: number,
  v: number,
): Point2 {
  const [tl, tr, br, bl] = corners;
  const top = lerp2(tl, tr, u);
  const bottom = lerp2(bl, br, u);
  return lerp2(top, bottom, v);
}

function faceCellCorners2d(
  corners: Point2[],
  row: number,
  col: number,
): Point2[] {
  const quad = corners as [Point2, Point2, Point2, Point2];
  const u0 = col / 3;
  const u1 = (col + 1) / 3;
  const v0 = row / 3;
  const v1 = (row + 1) / 3;
  return [
    bilinearFacePoint(quad, u0, v0),
    bilinearFacePoint(quad, u1, v0),
    bilinearFacePoint(quad, u1, v1),
    bilinearFacePoint(quad, u0, v1),
  ];
}

function buildFaceGridLines(corners: Point2[]): string[] {
  const quad = corners as [Point2, Point2, Point2, Point2];
  const lines: string[] = [];
  for (let i = 1; i < 3; i++) {
    const t = i / 3;
    const hStart = bilinearFacePoint(quad, 0, t);
    const hEnd = bilinearFacePoint(quad, 1, t);
    lines.push(
      `M ${hStart.x.toFixed(1)} ${hStart.y.toFixed(1)} L ${hEnd.x.toFixed(1)} ${hEnd.y.toFixed(1)}`,
    );
    const vStart = bilinearFacePoint(quad, t, 0);
    const vEnd = bilinearFacePoint(quad, t, 1);
    lines.push(
      `M ${vStart.x.toFixed(1)} ${vStart.y.toFixed(1)} L ${vEnd.x.toFixed(1)} ${vEnd.y.toFixed(1)}`,
    );
  }
  return lines;
}

/** Build a 3-face corner cube mesh with correct depth ordering. */
export function buildCornerCubeModel(
  options: {
    yaw: number;
    pitch: number;
    size?: number;
    faceIds?: FaceId[];
    turningByFace?: Partial<Record<FaceId, number[]>>;
    /** Horizontal mirror in projection (selfie preview parity without CSS scaleX). */
    mirrorX?: boolean;
  },
): CornerCubeModel {
  const yaw = options.yaw;
  const pitch = options.pitch;
  const size = options.size ?? 200;
  const cx = size / 2;
  const cy = size * 0.56;
  const scale = size * 0.38;
  const mirrorX = options.mirrorX ?? true;
  const visibleFaceIds = options.faceIds ?? selectCornerFaces(yaw, pitch);
  const turningByFace = options.turningByFace ?? {};

  const faceGroups: IsoFaceGroup[] = visibleFaceIds
    .map((faceId) => {
      const rawCorners = faceCorners2dWithView(faceId, yaw, pitch, scale, cx, cy, mirrorX);
      const corners = orderQuadCornersCCW(rawCorners);
      const outline: IsoFaceOutline = {
        faceId,
        points: corners,
        label: {
          x: corners[0]!.x + (corners[1]!.x - corners[0]!.x) * 0.08,
          y: corners[0]!.y + (corners[1]!.y - corners[0]!.y) * 0.08 - 4,
        },
      };

      const turningIndices = new Set(turningByFace[faceId] ?? []);
      const cells: IsoCell[] = [];

      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const index = row * 3 + col;
          const points = faceCellCorners2d(rawCorners, row, col);
          cells.push({
            faceId,
            index,
            points,
            center: polygonCenter(points),
            isTurning: turningIndices.has(index),
          });
        }
      }

      return {
        faceId,
        depth: faceAvgDepth(faceId, yaw, pitch),
        cells,
        outline,
        gridLines: buildFaceGridLines(rawCorners),
      };
    })
    .sort((a, b) => a.depth - b.depth);

  return { faceGroups, size, visibleFaceIds };
}

function transformPointYawPitch(p: Point3, yaw: number, pitch: number): Point3 {
  return rotateX(rotateY(p, yaw), pitch);
}

function transformNormal(faceId: FaceId, yaw: number, pitch: number): Point3 {
  const n = FACE_NORMALS[faceId];
  return transformPointYawPitch({ x: n[0], y: n[1], z: n[2] }, yaw, pitch);
}

/** Full-cube perspective model for live scan — always 3 visible faces, depth-sorted. */
export function buildIsoScanCubeModel(
  options: {
    yaw?: number;
    pitch?: number;
    size?: number;
  } = {},
): IsoScanCubeModel {
  const yaw = options.yaw ?? SCAN_YAW_DEFAULT;
  const pitch = options.pitch ?? SCAN_PITCH;
  const size = options.size ?? 200;
  const corner = buildCornerCubeModel({ yaw, pitch, size });
  const cells: IsoScanCell[] = corner.faceGroups.flatMap((group) =>
    group.cells.map((cell) => ({ ...cell, depth: group.depth })),
  );
  return {
    cells,
    faceOutlines: corner.faceGroups.map((group) => group.outline),
    size: corner.size,
    visibleFaceIds: corner.visibleFaceIds,
  };
}

export function scanCellColor(
  faceId: FaceId,
  index: number,
  scannedColors: Partial<Record<FaceId, StickerColor[]>>,
  previewFace: FaceId | null,
  previewColors: StickerColor[] | null,
): StickerColor | null {
  const scanned = scannedColors[faceId];
  if (scanned && scanned.length === 9) return scanned[index] ?? null;
  if (previewFace === faceId && previewColors && previewColors.length === 9) {
    return previewColors[index] ?? null;
  }
  return null;
}

export interface IsoCubeGuideModel {
  holdFace: FaceId;
  turnLayer: FaceId;
  visibleFaces: FaceId[];
  cells: IsoCell[];
  faceOutlines: IsoFaceOutline[];
  arrow: IsoArrow | null;
  size: number;
}

const ISO = 0.866;
const ISO_DEPTH = 0.5;

const TURNING_CELLS: Record<FaceId, Partial<Record<FaceId, number[]>>> = {
  R: { R: [0, 1, 2, 3, 4, 5, 6, 7, 8], F: [2, 5, 8], B: [0, 3, 6], U: [2, 5, 8], D: [2, 5, 8] },
  L: { L: [0, 1, 2, 3, 4, 5, 6, 7, 8], F: [0, 3, 6], B: [2, 5, 8], U: [0, 3, 6], D: [0, 3, 6] },
  U: { U: [0, 1, 2, 3, 4, 5, 6, 7, 8], F: [0, 1, 2], B: [0, 1, 2], R: [0, 1, 2], L: [0, 1, 2] },
  D: { D: [0, 1, 2, 3, 4, 5, 6, 7, 8], F: [6, 7, 8], B: [6, 7, 8], R: [6, 7, 8], L: [6, 7, 8] },
  F: { F: [0, 1, 2, 3, 4, 5, 6, 7, 8], R: [0, 3, 6], L: [2, 5, 8], U: [6, 7, 8], D: [0, 1, 2] },
  B: { B: [0, 1, 2, 3, 4, 5, 6, 7, 8], R: [2, 5, 8], L: [0, 3, 6], U: [0, 1, 2], D: [6, 7, 8] },
};

/** Side face on the left or right of hold-F corner view. */
export function visibleFacesFor(holdFace: FaceId, turnLayer: FaceId): FaceId[] {
  if (holdFace === 'F') {
    const leftSide = turnLayer === 'L' || turnLayer === 'B';
    return leftSide ? ['U', 'L', 'F'] : ['U', 'R', 'F'];
  }
  if (holdFace === 'R') return ['U', 'F', 'R'];
  if (holdFace === 'L') return ['U', 'F', 'L'];
  return ['U', 'R', 'F'];
}

/** Selfie preview mirrors horizontally — swap L/R so the guide matches the camera. */
export function visibleFacesForSelfie(holdFace: FaceId, turnLayer: FaceId): FaceId[] {
  const base = visibleFacesFor(holdFace, turnLayer);
  if (holdFace !== 'F') return base;
  return base.map((faceId) =>
    faceId === 'R' ? 'L' : faceId === 'L' ? 'R' : faceId,
  ) as FaceId[];
}

function rotateY(p: Point3, yaw: number): Point3 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
}

function rotateX(p: Point3, pitch: number): Point3 {
  const c = Math.cos(pitch);
  const s = Math.sin(pitch);
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
}

function isoProject(
  p: Point3,
  scale: number,
  cx: number,
  cy: number,
  mirrorX: boolean,
): Point2 {
  const rawX = (p.x - p.z) * ISO * scale;
  return {
    x: cx + (mirrorX ? -rawX : rawX),
    y: cy - p.y * scale + (p.x + p.z) * ISO_DEPTH * scale,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerp2(a: Point2, b: Point2, t: number): Point2 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function polygonCenter(points: Point2[]): Point2 {
  return {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
  };
}

function buildArrow(
  move: Move,
  arrowFace: FaceId,
  yaw: number,
  pitch: number,
  scale: number,
  cx: number,
  cy: number,
): IsoArrow | null {
  const effective = getSelfieDisplayMove(move);
  const corners = faceCorners2dWithView(arrowFace, yaw, pitch, scale, cx, cy, true);
  const center = polygonCenter(corners);
  const u = { x: corners[1]!.x - corners[0]!.x, y: corners[1]!.y - corners[0]!.y };
  const v = { x: corners[3]!.x - corners[0]!.x, y: corners[3]!.y - corners[0]!.y };
  const uLen = Math.hypot(u.x, u.y) || 1;
  const vLen = Math.hypot(v.x, v.y) || 1;
  const ru = { x: u.x / uLen, y: u.y / uLen };
  const rv = { x: v.x / vLen, y: v.y / vLen };
  const radius = Math.min(uLen, vLen) * 0.38;

  const total = Math.abs(moveAngle(effective));
  const start = isPrimeMove(effective) ? total : 0;
  const end = isPrimeMove(effective) ? 0 : total;

  const steps = 24;
  const parts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = start + ((end - start) * i) / steps;
    const px = center.x + radius * (Math.cos(t) * ru.x + Math.sin(t) * rv.x);
    const py = center.y + radius * (Math.cos(t) * ru.y + Math.sin(t) * rv.y);
    parts.push(`${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`);
  }

  const tipT = end;
  const prevT = tipT + (end >= start ? -0.28 : 0.28);
  const tip = {
    x: center.x + radius * (Math.cos(tipT) * ru.x + Math.sin(tipT) * rv.x),
    y: center.y + radius * (Math.cos(tipT) * ru.y + Math.sin(tipT) * rv.y),
  };
  const prev = {
    x: center.x + radius * (Math.cos(prevT) * ru.x + Math.sin(prevT) * rv.x),
    y: center.y + radius * (Math.cos(prevT) * ru.y + Math.sin(prevT) * rv.y),
  };

  return {
    path: parts.join(' '),
    head: tip,
    headAngle: Math.atan2(tip.y - prev.y, tip.x - prev.x),
  };
}

export interface IsoCubeView {
  yaw: number;
  pitch: number;
  visibleFaces: FaceId[];
}

export function buildIsoCubeGuideModel(
  move: Move,
  view: IsoCubeView,
  size = 200,
): IsoCubeGuideModel {
  const turnLayer = moveFace(move);
  const cx = size / 2;
  const cy = size * 0.56;
  const scale = size * 0.38;
  const turningByFace = TURNING_CELLS[turnLayer] ?? {};

  const corner = buildCornerCubeModel({
    yaw: view.yaw,
    pitch: view.pitch,
    size,
    faceIds: view.visibleFaces,
    turningByFace,
  });

  const cells = corner.faceGroups.flatMap((group) => group.cells);
  const faceOutlines = corner.faceGroups.map((group) => group.outline);
  const arrowFace = view.visibleFaces.includes(turnLayer)
    ? turnLayer
    : view.visibleFaces[1]!;

  return {
    holdFace: view.visibleFaces.find((faceId) => faceId !== 'U') ?? 'F',
    turnLayer,
    visibleFaces: view.visibleFaces,
    cells,
    faceOutlines,
    arrow: buildArrow(move, arrowFace, view.yaw, view.pitch, scale, cx, cy),
    size,
  };
}

export function stickerColorForCell(
  faceColors: Partial<Record<FaceId, StickerColor[]>>,
  faceId: FaceId,
  index: number,
): StickerColor | null {
  const colors = faceColors[faceId];
  if (!colors || colors.length !== 9) return null;
  return colors[index] ?? null;
}
