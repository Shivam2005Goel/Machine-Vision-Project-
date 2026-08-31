import { useMemo } from 'react';
import type { FaceId, Move, StickerColor } from '../types';
import { getFaceletFaceColors } from '../lib/cube/moveColorProgress';
import { getMoveGuidanceView } from '../lib/cube/moveGuidanceView';
import { getSelfieHoldPose } from '../lib/cube/selfieHoldPose';
import { buildCornerCubeModel, buildIsoCubeGuideModel } from '../lib/cube/isometricGuide';
import { mirrorFaceCellsHorizontally } from '../lib/vision/selfieView';
import { moveFace } from '../lib/cube/moves';
import { PerspectiveCubeSvg, solveCellStyle } from './PerspectiveCubeSvg';

const TURNING_CELLS: Record<FaceId, Partial<Record<FaceId, number[]>>> = {
  R: { R: [0, 1, 2, 3, 4, 5, 6, 7, 8], F: [2, 5, 8], B: [0, 3, 6], U: [2, 5, 8], D: [2, 5, 8] },
  L: { L: [0, 1, 2, 3, 4, 5, 6, 7, 8], F: [0, 3, 6], B: [2, 5, 8], U: [0, 3, 6], D: [0, 3, 6] },
  U: { U: [0, 1, 2, 3, 4, 5, 6, 7, 8], F: [0, 1, 2], B: [0, 1, 2], R: [0, 1, 2], L: [0, 1, 2] },
  D: { D: [0, 1, 2, 3, 4, 5, 6, 7, 8], F: [6, 7, 8], B: [6, 7, 8], R: [6, 7, 8], L: [6, 7, 8] },
  F: { F: [0, 1, 2, 3, 4, 5, 6, 7, 8], R: [0, 3, 6], L: [2, 5, 8], U: [6, 7, 8], D: [0, 1, 2] },
  B: { B: [0, 1, 2, 3, 4, 5, 6, 7, 8], R: [2, 5, 8], L: [0, 3, 6], U: [0, 1, 2], D: [6, 7, 8] },
};

interface IsometricCubeGuideProps {
  move: Move;
  facelet: string;
}

export function IsometricCubeGuide({ move, facelet }: IsometricCubeGuideProps) {
  const guidance = useMemo(() => getMoveGuidanceView(move), [move]);
  const holdPose = useMemo(() => getSelfieHoldPose(move), [move]);
  const view = useMemo(
    () => ({
      yaw: holdPose.euler[1],
      pitch: holdPose.euler[0],
      visibleFaces: holdPose.visibleFaces,
    }),
    [holdPose],
  );

  const guide = useMemo(() => buildIsoCubeGuideModel(move, view), [move, view]);

  const model = useMemo(
    () =>
      buildCornerCubeModel({
        yaw: view.yaw,
        pitch: view.pitch,
        size: 200,
        faceIds: view.visibleFaces,
        turningByFace: TURNING_CELLS[moveFace(move)] ?? {},
      }),
    [move, view],
  );

  const faceColors = useMemo(() => {
    const result: Partial<Record<FaceId, StickerColor[]>> = {};
    for (const faceId of view.visibleFaces) {
      const colors = getFaceletFaceColors(facelet, faceId);
      if (colors.length === 9) {
        result[faceId] = mirrorFaceCellsHorizontally(colors);
      }
    }
    return result;
  }, [facelet, view.visibleFaces]);

  return (
    <PerspectiveCubeSvg
      model={model}
      ariaLabel={`Turn ${guidance.turnLayer} layer ${guidance.direction.toLowerCase()}`}
      cellStyle={(faceId, index, cell) => solveCellStyle(faceId, index, cell, faceColors)}
      arrow={guide.arrow}
    />
  );
}
