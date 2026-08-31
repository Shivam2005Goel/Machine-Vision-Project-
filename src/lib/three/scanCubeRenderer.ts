import * as THREE from 'three';
import type { FaceId, ReadColor, StickerColor } from '../../types';
import { CUBE_EDGES, CUBE_VERTICES } from '../vision/faceModels';
import { REFERENCE_CORNER_VIEW } from '../cube/isometricGuide';
import { mirrorFaceCellsHorizontally } from '../vision/selfieView';
import { toStickerColors } from '../vision/readColorUtils';
import { createFaceColorTexture } from './faceColorTexture';

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

const ALL_FACE_IDS: FaceId[] = ['U', 'R', 'F', 'D', 'L', 'B'];
const UNSCANNED: StickerColor[] = Array(9).fill('W') as StickerColor[];

/** Solid 6-face scan progress cube (Three.js). */
export class ScanCubeRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private cubeRoot: THREE.Group;
  private faceMeshes = new Map<FaceId, THREE.Mesh>();
  private faceTextures = new Map<FaceId, THREE.CanvasTexture>();
  private sceneKey = '';

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x111827, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.05, 20);
    this.camera.position.set(0, 0.12, 2.4);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 0.35);
    key.position.set(0.4, 1, 1.2);
    this.scene.add(key);

    this.cubeRoot = new THREE.Group();
    this.cubeRoot.rotation.set(
      REFERENCE_CORNER_VIEW.pitch,
      REFERENCE_CORNER_VIEW.yaw,
      0,
    );
    this.cubeRoot.scale.set(-1, 1, 1);
    this.buildWireframe();
    this.buildFaces();
    this.scene.add(this.cubeRoot);
  }

  resize(width: number, height: number): void {
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  setFaces(
    scanned: Partial<Record<FaceId, ReadColor[]>>,
    previewFace: FaceId | null,
    previewColors: ReadColor[] | null,
  ): void {
    const key = JSON.stringify({ scanned, previewFace, previewColors });
    if (key === this.sceneKey) {
      this.render();
      return;
    }
    this.sceneKey = key;

    for (const faceId of ALL_FACE_IDS) {
      const mesh = this.faceMeshes.get(faceId);
      if (!mesh) continue;

      let colors: StickerColor[];
      if (previewFace === faceId && previewColors && previewColors.length === 9) {
        colors = toStickerColors(mirrorFaceCellsHorizontally(previewColors));
      } else if (scanned[faceId] && scanned[faceId]!.length === 9) {
        colors = toStickerColors(mirrorFaceCellsHorizontally(scanned[faceId]!));
      } else {
        colors = UNSCANNED;
      }

      const prev = this.faceTextures.get(faceId);
      prev?.dispose();
      const mat = mesh.material as THREE.MeshBasicMaterial;
      const isScanned = Boolean(scanned[faceId] && scanned[faceId]!.length === 9);

      if (isScanned || (previewFace === faceId && previewColors)) {
        const tex = createFaceColorTexture(colors, []);
        this.faceTextures.set(faceId, tex);
        mat.map = tex;
        mat.color.setHex(0xffffff);
      } else {
        mat.map = null;
        mat.color.setHex(0x334155);
      }
      mat.needsUpdate = true;
      mesh.visible = true;
    }

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
    const material = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    this.cubeRoot.add(new THREE.LineSegments(geometry, material));
  }

  private buildFaces(): void {
    const geometry = new THREE.PlaneGeometry(0.98, 0.98);
    for (const faceId of ALL_FACE_IDS) {
      const spec = FACE_PLANE_TRANSFORMS[faceId]!;
      const material = new THREE.MeshBasicMaterial({
        color: 0x334155,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry.clone(), material);
      mesh.position.set(...spec.position);
      mesh.rotation.set(...spec.rotation);
      this.faceMeshes.set(faceId, mesh);
      this.cubeRoot.add(mesh);
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
