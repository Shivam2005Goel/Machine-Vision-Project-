import { describe, expect, it } from 'vitest';
import {
  buildCornerCubeModel,
  buildIsoCubeGuideModel,
  buildIsoScanCubeModel,
  REFERENCE_CORNER_VIEW,
  visibleFacesFor,
} from './isometricGuide';
import { getSelfieHoldPose } from './selfieHoldPose';

function viewFromPose(move: Parameters<typeof getSelfieHoldPose>[0]) {
  const pose = getSelfieHoldPose(move);
  return {
    yaw: pose.euler[1],
    pitch: pose.euler[0],
    visibleFaces: pose.visibleFaces,
  };
}

describe('isometric cube guide', () => {
  it('shows R side for R move and L side for L move when holding F', () => {
    expect(visibleFacesFor('F', 'R')).toEqual(['U', 'R', 'F']);
    expect(visibleFacesFor('F', 'L')).toEqual(['U', 'L', 'F']);
  });

  it('builds three-face corner model with cells and outlines', () => {
    const model = buildIsoCubeGuideModel('R', viewFromPose('R'));
    expect(model.visibleFaces).toHaveLength(3);
    expect(model.cells).toHaveLength(27);
    expect(model.faceOutlines).toHaveLength(3);
  });

  it('highlights turning layer on visible faces', () => {
    const model = buildIsoCubeGuideModel('R', viewFromPose('R'));
    const turning = model.cells.filter((c) => c.isTurning);
    if (model.visibleFaces.includes('R')) {
      expect(turning.some((c) => c.faceId === 'R')).toBe(true);
    }
    expect(turning.length).toBeGreaterThan(0);
    expect(model.arrow).not.toBeNull();
  });

  it('shows L face for L prime move with F hold', () => {
    const view = viewFromPose("L'");
    const model = buildIsoCubeGuideModel("L'", view);
    expect(model.visibleFaces).toHaveLength(3);
    expect(model.turnLayer).toBe('L');
    if (model.visibleFaces.includes('L')) {
      expect(model.cells.filter((c) => c.isTurning && c.faceId === 'L')).toHaveLength(9);
    }
    expect(model.arrow?.path.startsWith('M')).toBe(true);
  });

  it('builds arrow for F move with R hold', () => {
    const model = buildIsoCubeGuideModel('F', viewFromPose('F'));
    expect(model.visibleFaces).toHaveLength(3);
    expect(model.arrow?.path.startsWith('M')).toBe(true);
  });

  it('builds scan cube with exactly three visible faces at default angle', () => {
    const model = buildIsoScanCubeModel();
    expect(model.cells).toHaveLength(27);
    expect(model.visibleFaceIds).toHaveLength(3);
    expect(model.faceOutlines).toHaveLength(3);
  });

  it('corner cube model depth-sorts three face groups', () => {
    const model = buildCornerCubeModel({
      yaw: REFERENCE_CORNER_VIEW.yaw,
      pitch: REFERENCE_CORNER_VIEW.pitch,
    });
    expect(model.faceGroups).toHaveLength(3);
    expect(model.visibleFaceIds).toEqual(expect.arrayContaining(['U', 'F', 'R']));
    expect(model.faceGroups.every((group) => group.cells.length === 9)).toBe(true);
  });

  it('selfie solving model uses geometric corner faces', () => {
    const view = viewFromPose('R');
    const model = buildIsoCubeGuideModel('R', view);
    expect(model.visibleFaces).toHaveLength(3);
    expect(model.arrow).not.toBeNull();
  });

  it('depth-sorts face groups far-to-near for painter order', () => {
    const model = buildCornerCubeModel({
      yaw: REFERENCE_CORNER_VIEW.yaw,
      pitch: REFERENCE_CORNER_VIEW.pitch,
    });
    expect(model.faceGroups.length).toBe(3);
    for (let i = 1; i < model.faceGroups.length; i++) {
      expect(model.faceGroups[i]!.depth).toBeGreaterThanOrEqual(model.faceGroups[i - 1]!.depth);
    }
    expect(model.faceGroups[model.faceGroups.length - 1]!.faceId).toBe('U');
  });

  it('orders face quads counter-clockwise in screen space', () => {
    const model = buildCornerCubeModel({
      yaw: REFERENCE_CORNER_VIEW.yaw,
      pitch: REFERENCE_CORNER_VIEW.pitch,
    });
    for (const group of model.faceGroups) {
      const pts = group.outline.points;
      let area = 0;
      for (let i = 0; i < 4; i++) {
        const p = pts[i]!;
        const q = pts[(i + 1) % 4]!;
        area += p.x * q.y - q.x * p.y;
      }
      expect(area).toBeGreaterThan(0);
    }
  });

  it('cells tile without gaps on each face', () => {
    const model = buildCornerCubeModel({
      yaw: REFERENCE_CORNER_VIEW.yaw,
      pitch: REFERENCE_CORNER_VIEW.pitch,
    });
    for (const group of model.faceGroups) {
      expect(group.gridLines).toHaveLength(4);
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 2; col++) {
          const left = group.cells[row * 3 + col]!;
          const right = group.cells[row * 3 + col + 1]!;
          expect(left.points[1]!.x).toBeCloseTo(right.points[0]!.x, 5);
          expect(left.points[1]!.y).toBeCloseTo(right.points[0]!.y, 5);
          expect(left.points[2]!.x).toBeCloseTo(right.points[3]!.x, 5);
          expect(left.points[2]!.y).toBeCloseTo(right.points[3]!.y, 5);
        }
      }
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) {
          const top = group.cells[row * 3 + col]!;
          const bottom = group.cells[(row + 1) * 3 + col]!;
          expect(top.points[3]!.x).toBeCloseTo(bottom.points[0]!.x, 5);
          expect(top.points[3]!.y).toBeCloseTo(bottom.points[0]!.y, 5);
          expect(top.points[2]!.x).toBeCloseTo(bottom.points[1]!.x, 5);
          expect(top.points[2]!.y).toBeCloseTo(bottom.points[1]!.y, 5);
        }
      }
    }
  });

  it('uses hold-pose visible faces for B move (shows F, not back B)', () => {
    const pose = getSelfieHoldPose('B');
    expect(pose.visibleFaces).toEqual(['U', 'F', 'L']);
    const model = buildCornerCubeModel({
      yaw: pose.euler[1],
      pitch: pose.euler[0],
      faceIds: pose.visibleFaces,
    });
    expect(model.faceGroups.map((g) => g.faceId).sort()).toEqual(['F', 'L', 'U']);
  });
});
