import * as THREE from 'three';
import type { CubePose, FaceId, Move, StickerColor } from '../../types';
import { CUBE_EDGES, CUBE_VERTICES } from '../vision/faceModels';
import {
  FACE_NORMALS,
  getMoveAxis,
  isDoubleMove,
  moveAngle,
  moveFace,
} from '../cube/moves';
import { getSelfieDisplayMove } from '../cube/moveRotationDisplay';
import { getVisibleFaces } from '../vision/visibleFaces';
import { configureCameraFromIntrinsics, poseToThreeMatrix } from './poseBridge';
import { createFaceColorTexture, updateFaceColorTexture } from './faceColorTexture';

const EDGE_COLOR = 0xffffff;
const FACE_TINT = 0x446688;
const MOVE_FACE_TINT = 0xffcc33;
const ARROW_TRACK = 0xffffff;
const ARROW_ACTIVE = 0xffee44;
const GUIDE_ARROW_TRACK = 0xff3333;
const GUIDE_ARROW_ACTIVE = 0xffeb3b;
const GUIDE_EDGE_COLOR = 0xffffff;
const SOLVING_FACE_OFFSET = 0.545;
const SOLVING_EDGE_COLOR = 0x44ffcc;

export type CubeARMode = 'default' | 'guide' | 'solving';

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

export class CubeARRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private cubeRoot: THREE.Group;
  private faceMeshes = new Map<FaceId, THREE.Mesh>();
  private faceTextures = new Map<FaceId, THREE.CanvasTexture>();
  private arrowRoot: THREE.Group;
  private trackMesh: THREE.Mesh | null = null;
  private progressMesh: THREE.Mesh | null = null;
  private headMesh: THREE.Mesh | null = null;
  private currentMove: Move | null = null;
  private traceProgress = 0;
  private frameWidth = 1;
  private frameHeight = 1;
  private faceColorsKey = '';
  private mode: CubeARMode;

  constructor(canvas: HTMLCanvasElement, options?: { guideMode?: boolean; mode?: CubeARMode }) {
    this.mode = options?.mode ?? (options?.guideMode ? 'guide' : 'default');
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    this.camera.position.set(0, 0, 0);

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.15));

    this.cubeRoot = new THREE.Group();
    this.buildCubeWireframe();
    this.buildFacePlanes();
    this.scene.add(this.cubeRoot);

    this.arrowRoot = new THREE.Group();
    this.cubeRoot.add(this.arrowRoot);
  }

  resize(displayWidth: number, displayHeight: number, frameWidth: number, frameHeight: number): void {
    this.frameWidth = frameWidth;
    this.frameHeight = frameHeight;
    this.renderer.setSize(displayWidth, displayHeight, false);
  }

  setMove(move: Move | null): void {
    if (move === this.currentMove) return;
    this.currentMove = move;
    this.traceProgress = 0;
    this.highlightMoveFace(move ? moveFace(move) : null);
    this.rebuildArrow(move);
  }

  setRotationProgress(progress: number): void {
    const clamped = Math.max(0, Math.min(1, progress));
    if (Math.abs(clamped - this.traceProgress) < 0.025) return;
    this.traceProgress = clamped;
    this.updateArrowProgress();
  }

  setFaceColors(
    liveByFace: Partial<Record<FaceId, StickerColor[]>>,
    scannedFallback: Partial<Record<FaceId, StickerColor[]>>,
  ): void {
    if (this.mode === 'guide') return;

    // Solving guide uses the scanned cube state only — live reads fluctuate
    // with lighting/pose and must not repaint stickers mid-step.
    const merged: Partial<Record<FaceId, StickerColor[]>> = { ...scannedFallback };

    if (this.mode !== 'solving') {
      for (const [faceId, colors] of Object.entries(liveByFace) as [FaceId, StickerColor[]][]) {
        if (colors.length === 9) merged[faceId] = colors;
      }
    }
    const key = JSON.stringify(merged);
    if (key === this.faceColorsKey) return;
    this.faceColorsKey = key;

    for (const [faceId, mesh] of this.faceMeshes) {
      const colors = merged[faceId];
      const mat = mesh.material as THREE.MeshBasicMaterial;
      if (!colors || colors.length !== 9) {
        mat.map = null;
        mat.color.setHex(this.mode === 'solving' ? 0x334455 : FACE_TINT);
        mat.opacity = this.mode === 'solving' ? 0.2 : 0.14;
        mat.needsUpdate = true;
        continue;
      }

      let texture = this.faceTextures.get(faceId);
      if (!texture) {
        texture = createFaceColorTexture(colors);
        this.faceTextures.set(faceId, texture);
      } else {
        updateFaceColorTexture(texture, colors);
      }
      mat.map = texture;
      mat.color.setHex(0xffffff);
      mat.opacity = this.mode === 'solving' ? 0.88 : 0.92;
      mat.needsUpdate = true;
    }
  }

  render(pose: CubePose | null, faceMatchesMove = true): void {
    if (!pose) {
      // No pose — hide the cube instead of freezing at the last known matrix.
      this.cubeRoot.visible = false;
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.cubeRoot.visible = true;

    configureCameraFromIntrinsics(this.camera, pose, this.frameWidth, this.frameHeight);

    const matrix = poseToThreeMatrix(pose);
    this.cubeRoot.matrixAutoUpdate = false;
    this.cubeRoot.matrix.copy(matrix);
    this.cubeRoot.matrixWorldNeedsUpdate = true;

    const visible = getVisibleFaces(pose);
    for (const [faceId, mesh] of this.faceMeshes) {
      mesh.visible = visible.includes(faceId);
    }

    const moveFaceId = this.currentMove ? moveFace(this.currentMove) : null;
    this.arrowRoot.visible = Boolean(this.currentMove && (this.mode !== 'default' || faceMatchesMove));

    if (this.mode === 'guide') {
      for (const [faceId, mesh] of this.faceMeshes) {
        mesh.visible = faceId === moveFaceId && visible.includes(faceId);
      }
      if (moveFaceId) this.highlightMoveFace(moveFaceId);
    } else if (this.mode === 'solving') {
      if (moveFaceId) this.highlightMoveFace(moveFaceId);
    } else if (moveFaceId) {
      this.highlightMoveFace(moveFaceId);
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    for (const texture of this.faceTextures.values()) {
      texture.dispose();
    }
    this.faceTextures.clear();
    this.renderer.dispose();
    this.cubeRoot.traverse(disposeObject);
  }

  private buildCubeWireframe(): void {
    const verts = CUBE_VERTICES.map((v) => new THREE.Vector3(v[0], v[1], v[2]));
    const positions: number[] = [];
    for (const [a, b] of CUBE_EDGES) {
      positions.push(verts[a]!.x, verts[a]!.y, verts[a]!.z);
      positions.push(verts[b]!.x, verts[b]!.y, verts[b]!.z);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color:
        this.mode === 'solving'
          ? SOLVING_EDGE_COLOR
          : this.mode === 'guide'
            ? GUIDE_EDGE_COLOR
            : EDGE_COLOR,
      transparent: true,
      opacity: this.mode === 'solving' ? 0.75 : this.mode === 'guide' ? 0.55 : 0.95,
      linewidth: 2,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(geometry, material);
    this.cubeRoot.add(lines);
  }

  private buildFacePlanes(): void {
    const geometry = new THREE.PlaneGeometry(0.98, 0.98);
    const offset = this.mode === 'solving' ? SOLVING_FACE_OFFSET : 0.501;
    for (const faceId of Object.keys(FACE_PLANE_TRANSFORMS) as FaceId[]) {
      const spec = FACE_PLANE_TRANSFORMS[faceId]!;
      const normal = new THREE.Vector3(...FACE_NORMALS[faceId]).normalize();
      const position = normal.multiplyScalar(offset);
      const material = new THREE.MeshBasicMaterial({
        color: FACE_TINT,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry.clone(), material);
      mesh.position.copy(position);
      mesh.rotation.set(...spec.rotation);
      mesh.userData.faceId = faceId;
      mesh.visible = false;
      this.faceMeshes.set(faceId, mesh);
      this.cubeRoot.add(mesh);
    }
  }

  private highlightMoveFace(face: FaceId | null): void {
    for (const [faceId, mesh] of this.faceMeshes) {
      const mat = mesh.material as THREE.MeshBasicMaterial;
      if (this.mode === 'guide') {
        if (faceId === face) {
          mat.map = null;
          mat.color.setHex(MOVE_FACE_TINT);
          mat.opacity = 0.22;
        } else {
          mat.opacity = 0;
        }
        mat.needsUpdate = true;
        continue;
      }
      if (this.mode === 'solving') {
        if (faceId === face) {
          if (!mat.map) {
            mat.color.setHex(MOVE_FACE_TINT);
            mat.opacity = 0.35;
          } else {
            mat.opacity = 0.96;
          }
        } else if (mat.map) {
          mat.opacity = 0.84;
        } else {
          mat.opacity = 0.22;
        }
        mat.needsUpdate = true;
        continue;
      }
      if (!mat.map) {
        if (faceId === face) {
          mat.color.setHex(MOVE_FACE_TINT);
          mat.opacity = 0.35;
        } else {
          mat.color.setHex(FACE_TINT);
          mat.opacity = 0.14;
        }
      } else if (faceId === face) {
        mat.opacity = 0.98;
      } else {
        mat.opacity = 0.82;
      }
    }
  }

  private isGuideLike(): boolean {
    return this.mode === 'guide' || this.mode === 'solving';
  }

  private rebuildArrow(move: Move | null): void {
    this.clearArrow();
    if (!move) return;

    const effectiveMove = this.isGuideLike() ? getSelfieDisplayMove(move) : move;
    const face = moveFace(move);
    const axis = new THREE.Vector3(...getMoveAxis(effectiveMove)).normalize();
    const { ref, perp } = arcBasis(axis);
    const radius = this.isGuideLike() ? 0.42 : 0.36;
    const targetAngle = moveAngle(effectiveMove);
    const startAngle = targetAngle < 0 ? targetAngle : 0;
    const endAngle = targetAngle < 0 ? 0 : targetAngle;
    const segments = 48;

    const normal = new THREE.Vector3(...FACE_NORMALS[face]).normalize();
    const surface = normal.clone().multiplyScalar(0.545);

    const fullPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = startAngle + ((endAngle - startAngle) * i) / segments;
      fullPoints.push(arcPoint(ref, perp, radius, t).add(surface));
    }

    this.arrowRoot.userData = { fullPoints, segments, startAngle, endAngle, radius, ref, perp, surface };

    const trackCurve = new THREE.CatmullRomCurve3(fullPoints);
    const trackRadius = this.isGuideLike() ? 0.045 : 0.028;
    const trackGeo = new THREE.TubeGeometry(trackCurve, segments, trackRadius, 10, false);
    const trackMat = new THREE.MeshBasicMaterial({
      color: this.isGuideLike() ? GUIDE_ARROW_TRACK : ARROW_TRACK,
      transparent: true,
      opacity: this.isGuideLike() ? 0.92 : 0.35,
      depthWrite: false,
    });
    this.trackMesh = new THREE.Mesh(trackGeo, trackMat);
    this.arrowRoot.add(this.trackMesh);

    if (this.isGuideLike() && !isDoubleMove(effectiveMove)) {
      const tip = fullPoints[fullPoints.length - 1]!;
      const prev = fullPoints[fullPoints.length - 2] ?? tip;
      const dir = new THREE.Vector3().subVectors(tip, prev).normalize();
      const head = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.26, 14),
        new THREE.MeshBasicMaterial({
          color: GUIDE_ARROW_TRACK,
          transparent: true,
          opacity: 0.98,
          depthWrite: false,
        }),
      );
      head.position.copy(tip);
      head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      this.arrowRoot.add(head);
    }

    if (isDoubleMove(effectiveMove)) {
      const badge = new THREE.Mesh(
        new THREE.CircleGeometry(this.isGuideLike() ? 0.12 : 0.09, 24),
        new THREE.MeshBasicMaterial({
          color: this.isGuideLike() ? GUIDE_ARROW_TRACK : ARROW_ACTIVE,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
        }),
      );
      badge.position.copy(surface);
      badge.lookAt(surface.clone().add(normal));
      this.arrowRoot.add(badge);
    }

    this.updateArrowProgress();
  }

  private updateArrowProgress(): void {
    if (!this.currentMove || !this.arrowRoot.userData.fullPoints) return;

    if (this.progressMesh) {
      this.arrowRoot.remove(this.progressMesh);
      disposeObject(this.progressMesh);
      this.progressMesh = null;
    }
    if (this.headMesh) {
      this.arrowRoot.remove(this.headMesh);
      disposeObject(this.headMesh);
      this.headMesh = null;
    }

    const { fullPoints, segments, startAngle, endAngle } = this.arrowRoot.userData as {
      fullPoints: THREE.Vector3[];
      segments: number;
      startAngle: number;
      endAngle: number;
    };

    const currentEnd = startAngle + (endAngle - startAngle) * this.traceProgress;
    if (!this.isGuideLike() && Math.abs(currentEnd - startAngle) < 0.04) return;

    const endIdx = Math.max(2, Math.floor(segments * Math.max(this.isGuideLike() ? 0.05 : 0, this.traceProgress)));
    const partial = fullPoints.slice(0, endIdx + 1);
    if (partial.length < 2) return;

    const curve = new THREE.CatmullRomCurve3(partial);
    const progressRadius = this.isGuideLike() ? 0.058 : 0.052;
    const progressGeo = new THREE.TubeGeometry(curve, endIdx, progressRadius, 10, false);
    const progressMat = new THREE.MeshBasicMaterial({
      color: this.isGuideLike() ? GUIDE_ARROW_ACTIVE : ARROW_ACTIVE,
      transparent: true,
      opacity: 0.98,
      depthWrite: false,
    });
    this.progressMesh = new THREE.Mesh(progressGeo, progressMat);
    this.arrowRoot.add(this.progressMesh);

    const tip = partial[partial.length - 1]!;
    const prev = partial[partial.length - 2] ?? tip;
    const dir = new THREE.Vector3().subVectors(tip, prev).normalize();
    const head = new THREE.Mesh(
      new THREE.ConeGeometry(this.isGuideLike() ? 0.13 : 0.1, this.isGuideLike() ? 0.28 : 0.22, 12),
      progressMat.clone(),
    );
    head.position.copy(tip);
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.headMesh = head;
    this.arrowRoot.add(head);
  }

  private clearArrow(): void {
    this.trackMesh = null;
    this.progressMesh = null;
    this.headMesh = null;
    while (this.arrowRoot.children.length > 0) {
      const child = this.arrowRoot.children[0]!;
      this.arrowRoot.remove(child);
      disposeObject(child);
    }
  }
}

function arcBasis(axis: THREE.Vector3): { ref: THREE.Vector3; perp: THREE.Vector3 } {
  let ref = new THREE.Vector3(0, 1, 0);
  if (Math.abs(axis.dot(ref)) > 0.9) ref.set(0, 0, 1);
  const perp = new THREE.Vector3().crossVectors(axis, ref).normalize();
  ref = new THREE.Vector3().crossVectors(perp, axis).normalize();
  return { ref, perp };
}

function arcPoint(
  ref: THREE.Vector3,
  perp: THREE.Vector3,
  radius: number,
  angle: number,
): THREE.Vector3 {
  return ref
    .clone()
    .multiplyScalar(Math.cos(angle) * radius)
    .add(perp.clone().multiplyScalar(Math.sin(angle) * radius));
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
