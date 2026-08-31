import * as THREE from 'three';
import type { FaceId, Move } from '../../types';
import { CUBE_EDGES, CUBE_VERTICES } from '../vision/faceModels';
import { getFaceletFaceColors } from '../cube/moveColorProgress';
import { getSelfieDisplayMove } from '../cube/moveRotationDisplay';
import { getSelfieHoldPose } from '../cube/selfieHoldPose';
import { FACE_NORMALS, isDoubleMove, moveAngle, moveFace, isPrimeMove } from '../cube/moves';
import { mirrorFaceCellsHorizontally } from '../vision/selfieView';
import { createFaceColorTexture } from './faceColorTexture';

const TURNING_CELLS: Record<FaceId, Partial<Record<FaceId, number[]>>> = {
  R: { R: [0, 1, 2, 3, 4, 5, 6, 7, 8], F: [2, 5, 8], B: [0, 3, 6], U: [2, 5, 8], D: [2, 5, 8] },
  L: { L: [0, 1, 2, 3, 4, 5, 6, 7, 8], F: [0, 3, 6], B: [2, 5, 8], U: [0, 3, 6], D: [0, 3, 6] },
  U: { U: [0, 1, 2, 3, 4, 5, 6, 7, 8], F: [0, 1, 2], B: [0, 1, 2], R: [0, 1, 2], L: [0, 1, 2] },
  D: { D: [0, 1, 2, 3, 4, 5, 6, 7, 8], F: [6, 7, 8], B: [6, 7, 8], R: [6, 7, 8], L: [6, 7, 8] },
  F: { F: [0, 1, 2, 3, 4, 5, 6, 7, 8], R: [0, 3, 6], L: [2, 5, 8], U: [6, 7, 8], D: [0, 1, 2] },
  B: { B: [0, 1, 2, 3, 4, 5, 6, 7, 8], R: [2, 5, 8], L: [0, 3, 6], U: [0, 1, 2], D: [6, 7, 8] },
};

const FACE_PLANE_TRANSFORMS: Record<
  FaceId,
  { position: [number, number, number]; rotation: [number, number, number] }
> = {
  F: { position: [0, 0, 0.501], rotation: [0, 0, 0] },
  B: { position: [0, 0, -0.501], rotation: [0, Math.PI, 0] },
  R: { position: [0.501, 0, 0], rotation: [0, Math.PI / 2, 0] },
  L: { position: [-0.501, 0, 0], rotation: [0, -Math.PI / 2, 0] },
  U: { position: [0, 0.501, 0], rotation: [-Math.PI / 2, 0, 0] },
  D: { position: [0, -0.501, 0], rotation: [Math.PI / 2, 0, 0] },
};

/** Fixed selfie camera: arm's length, slightly above cube center. */
const CAMERA_POS = new THREE.Vector3(0, 0.12, 2.4);

export class CubeHintRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private cubeRoot: THREE.Group;
  private faceMeshes = new Map<FaceId, THREE.Mesh>();
  private faceTextures = new Map<FaceId, THREE.CanvasTexture>();
  private arrowRoot: THREE.Group;
  private trackMesh: THREE.Mesh | null = null;
  private currentMove: Move | null = null;
  private sceneKey = '';

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x111827, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.05, 20);
    this.camera.position.copy(CAMERA_POS);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 0.35);
    key.position.set(0.4, 1, 1.2);
    this.scene.add(key);

    this.cubeRoot = new THREE.Group();
    this.buildWireframe();
    this.buildFaces();
    this.scene.add(this.cubeRoot);

    this.arrowRoot = new THREE.Group();
    this.cubeRoot.add(this.arrowRoot);
  }

  resize(width: number, height: number): void {
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  setScene(move: Move, facelet: string): void {
    const key = `${move}:${facelet}`;
    if (key === this.sceneKey && move === this.currentMove) {
      this.render();
      return;
    }
    this.sceneKey = key;
    this.currentMove = move;

    const pose = getSelfieHoldPose(move);
    const turnLayer = moveFace(move);
    const turning = TURNING_CELLS[turnLayer] ?? {};

    this.cubeRoot.rotation.set(pose.euler[0], pose.euler[1], pose.euler[2]);
    this.cubeRoot.scale.set(-1, 1, 1);

    for (const [faceId, mesh] of this.faceMeshes) {
      mesh.visible = true;

      const raw = getFaceletFaceColors(facelet, faceId);
      const colors = mirrorFaceCellsHorizontally(raw);
      const highlights = turning[faceId] ?? [];

      let tex = this.faceTextures.get(faceId);
      if (!tex) {
        tex = createFaceColorTexture(colors, highlights);
        this.faceTextures.set(faceId, tex);
      } else {
        const canvas = tex.image as HTMLCanvasElement;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          tex.dispose();
          tex = createFaceColorTexture(colors, highlights);
          this.faceTextures.set(faceId, tex);
        }
      }

      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.map = tex;
      mat.color.setHex(0xffffff);
      mat.needsUpdate = true;
    }

    this.rebuildArrow(move, pose.visibleFaces);
    this.render();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    for (const tex of this.faceTextures.values()) tex.dispose();
    this.faceTextures.clear();
    this.renderer.dispose();
    this.cubeRoot.traverse(disposeObject);
  }

  private buildWireframe(): void {
    const verts = CUBE_VERTICES.map((v) => new THREE.Vector3(v[0], v[1], v[2]));
    const positions: number[] = [];
    for (const [a, b] of CUBE_EDGES) {
      positions.push(verts[a]!.x, verts[a]!.y, verts[a]!.z);
      positions.push(verts[b]!.x, verts[b]!.y, verts[b]!.z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      linewidth: 1,
    });
    this.cubeRoot.add(new THREE.LineSegments(geometry, material));
  }

  private buildFaces(): void {
    const geometry = new THREE.PlaneGeometry(0.98, 0.98);
    for (const faceId of Object.keys(FACE_PLANE_TRANSFORMS) as FaceId[]) {
      const spec = FACE_PLANE_TRANSFORMS[faceId]!;
      const normal = new THREE.Vector3(...FACE_NORMALS[faceId]).multiplyScalar(0.501);
      const material = new THREE.MeshBasicMaterial({
        color: 0x334155,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry.clone(), material);
      mesh.position.copy(normal);
      mesh.rotation.set(...spec.rotation);
      mesh.visible = false;
      this.faceMeshes.set(faceId, mesh);
      this.cubeRoot.add(mesh);
    }
  }

  private rebuildArrow(move: Move, visibleFaces: FaceId[]): void {
    this.clearArrow();
    const turnLayer = moveFace(move);
    const arrowFace = visibleFaces.includes(turnLayer)
      ? turnLayer
      : visibleFaces.find((f) => (TURNING_CELLS[turnLayer]?.[f]?.length ?? 0) >= 3) ?? turnLayer;

    const effective = getSelfieDisplayMove(move);
    const normal = new THREE.Vector3(...FACE_NORMALS[arrowFace]).normalize();
    const surface = normal.clone().multiplyScalar(0.52);

    const tangent = new THREE.Vector3(0, 1, 0);
    if (Math.abs(normal.dot(tangent)) > 0.85) tangent.set(1, 0, 0);
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
    tangent.crossVectors(bitangent, normal).normalize();

    const radius = 0.36;
    const total = Math.abs(moveAngle(effective));
    const start = isPrimeMove(effective) ? total : 0;
    const end = isPrimeMove(effective) ? 0 : total;
    const steps = 40;

    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = start + ((end - start) * i) / steps;
      const p = tangent
        .clone()
        .multiplyScalar(Math.cos(t) * radius)
        .add(bitangent.clone().multiplyScalar(Math.sin(t) * radius))
        .add(surface);
      points.push(p);
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const trackGeo = new THREE.TubeGeometry(curve, steps, 0.038, 8, false);
    const trackMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.trackMesh = new THREE.Mesh(trackGeo, trackMat);
    this.arrowRoot.add(this.trackMesh);

    if (!isDoubleMove(effective)) {
      const tip = points[points.length - 1]!;
      const prev = points[points.length - 2] ?? tip;
      const dir = new THREE.Vector3().subVectors(tip, prev).normalize();
      const head = new THREE.Mesh(
        new THREE.ConeGeometry(0.09, 0.18, 12),
        trackMat.clone(),
      );
      head.position.copy(tip);
      head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      this.arrowRoot.add(head);
    }
  }

  private clearArrow(): void {
    this.trackMesh = null;
    while (this.arrowRoot.children.length > 0) {
      const child = this.arrowRoot.children[0]!;
      this.arrowRoot.remove(child);
      disposeObject(child);
    }
  }
}

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((node) => {
    if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments) {
      node.geometry.dispose();
      if (Array.isArray(node.material)) {
        node.material.forEach((m) => m.dispose());
      } else {
        node.material.dispose();
      }
    }
  });
}
