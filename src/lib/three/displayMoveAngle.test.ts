import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import Cube from 'cubejs';
import type { Move } from '../../types';
import { MOVE_AXES, inverseMove, moveFace } from '../cube/moves';
import { displayMoveAngle, getOrientEuler, lerpAngle } from './solveCubeRenderer';
import { cubiesFromFacelet, solvedFacelet } from '../cube/faceletColors';

/**
 * Rotating the move layer's cubie coordinates by displayMoveAngle must land
 * every sticker exactly where cubejs says it goes — otherwise the guide
 * animation turns the layer in the wrong direction.
 */
function layerCoordsAfterRotation(move: Move) {
  const face = moveFace(move);
  const angle = displayMoveAngle(move);
  const axis = new THREE.Vector3(...MOVE_AXES[face]);

  const isInLayer = (c: { x: number; y: number; z: number }) => {
    switch (face) {
      case 'R': return c.x === 1;
      case 'L': return c.x === -1;
      case 'U': return c.y === 1;
      case 'D': return c.y === -1;
      case 'F': return c.z === 1;
      case 'B': return c.z === -1;
    }
  };

  const before = cubiesFromFacelet(solvedFacelet()).filter((c) => isInLayer(c.coords));

  const cube = Cube.fromString(solvedFacelet());
  cube.move(move);
  const after = cubiesFromFacelet(cube.asString()).filter((c) => isInLayer(c.coords));

  return { before, after, angle, axis };
}

function stickerSignature(faces: (string | null)[]): string {
  return faces.map((f) => f ?? '.').join('');
}

function rotateFaceIndex(faceIdx: number, axis: THREE.Vector3, angle: number): number {
  // faces array order: +x, -x, +y, -y, +z, -z
  const normals = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
  ];
  const rotated = normals[faceIdx]!.clone().applyAxisAngle(axis, angle);
  for (let i = 0; i < normals.length; i++) {
    if (rotated.distanceTo(normals[i]!) < 0.01) return i;
  }
  throw new Error('rotation did not land on a face normal');
}

describe('displayMoveAngle', () => {
  const moves: Move[] = ['R', "R'", 'U', "U'", 'F', "F'", 'L', 'D', 'B', 'R2', 'U2'];

  for (const move of moves) {
    it(`animates ${move} in the direction cubejs applies it`, () => {
      const { before, after, angle, axis } = layerCoordsAfterRotation(move);

      for (const cubie of before) {
        const p = new THREE.Vector3(cubie.coords.x, cubie.coords.y, cubie.coords.z);
        p.applyAxisAngle(axis, angle);
        const target = {
          x: Math.round(p.x),
          y: Math.round(p.y),
          z: Math.round(p.z),
        };

        // Rotate this cubie's sticker layout the same way.
        const rotatedFaces: (string | null)[] = [null, null, null, null, null, null];
        cubie.faces.forEach((color, idx) => {
          if (!color) return;
          rotatedFaces[rotateFaceIndex(idx, axis, angle)] = color;
        });

        const match = after.find(
          (c) =>
            c.coords.x === target.x && c.coords.y === target.y && c.coords.z === target.z,
        );
        expect(match, `${move}: cubie ${JSON.stringify(cubie.coords)} → ${JSON.stringify(target)}`).toBeDefined();
        expect(stickerSignature(match!.faces)).toBe(stickerSignature(rotatedFaces));
      }
    });
  }
});

describe('lerpAngle', () => {
  it('takes the shortest path across the ±π wrap', () => {
    const mid = lerpAngle(0.1, 2 * Math.PI - 0.1, 0.5);
    expect(Math.abs(mid)).toBeLessThan(0.05);
  });
});

describe('getOrientEuler', () => {
  it('locks pitch so white (U) stays on top for every layer', () => {
    for (const move of ['U', "U'", 'D', "D'", 'F', 'R', 'L', 'B'] as Move[]) {
      expect(getOrientEuler(move).x).toBeCloseTo(-0.42);
    }
  });

  it('shifts yaw per move for readable turn direction', () => {
    expect(Math.abs(getOrientEuler('U').y - getOrientEuler('R').y)).toBeGreaterThan(0.05);
  });
});

describe('inverseMove', () => {
  it('undoes prime and non-prime turns', () => {
    expect(inverseMove("R'")).toBe('R');
    expect(inverseMove('R')).toBe("R'");
    expect(inverseMove('U2')).toBe('U2');
  });
});
