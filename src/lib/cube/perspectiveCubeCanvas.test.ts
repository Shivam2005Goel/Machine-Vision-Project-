import { describe, expect, it } from 'vitest';
import { buildCornerCubeModel, REFERENCE_CORNER_VIEW } from './isometricGuide';
import { drawPerspectiveCube } from './perspectiveCubeCanvas';

describe('perspectiveCubeCanvas', () => {
  it('paints opaque fills for all three faces and grid strokes', () => {
    const model = buildCornerCubeModel({
      yaw: REFERENCE_CORNER_VIEW.yaw,
      pitch: REFERENCE_CORNER_VIEW.pitch,
      size: 120,
    });
    let fillCount = 0;
    let strokeCount = 0;
    const ctx = {
      clearRect: () => undefined,
      fillRect: () => {
        fillCount += 1;
      },
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      closePath: () => undefined,
      fill: () => {
        fillCount += 1;
      },
      stroke: () => {
        strokeCount += 1;
      },
      save: () => undefined,
      restore: () => undefined,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
    } as unknown as CanvasRenderingContext2D;

    drawPerspectiveCube(ctx, model, () => ({ fill: '#f8fafc' }), { faceBaseFill: '#f8fafc' });

    expect(fillCount).toBeGreaterThanOrEqual(1 + model.faceGroups.length * 9);
    expect(strokeCount).toBeGreaterThan(model.faceGroups.length * 2);
  });
});
