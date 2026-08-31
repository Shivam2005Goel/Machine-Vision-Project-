import * as THREE from 'three';
import Cube from 'cubejs';
import type { FaceId, Move } from '../../types';
import { FACE_NORMALS, isDoubleMove, isPrimeMove, moveFace, MOVE_AXES } from '../cube/moves';
import { getMoveHoldFace } from '../cube/moveGuidanceView';
import {
  CUBIE_BODY_HEX,
  cubiesFromFacelet,
  STICKER_HEX,
  type CubieStickers,
} from '../cube/faceletColors';
import type { StickerColor } from '../../types';

const CUBIE_SIZE = 0.94;
const CUBIE_GAP = 1.02;
const ANIM_MS = 480;
const ORIENT_ANIM_MS = 420;
const CUBE_HALF = CUBIE_GAP * 1.5;
const ARROW_COLOR = 0xffeb3b;
const ARROW_WRONG_COLOR = 0xff5252;
const GUIDE_RENDER_ORDER = 1000;

function guideOverlayMaterial(color: number, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
  });
}

function tagGuideObject(object: THREE.Object3D): THREE.Object3D {
  object.renderOrder = GUIDE_RENDER_ORDER;
  return object;
}

/**
 * Visually correct signed angle about the positive MOVE_AXES axis.
 * A clockwise turn viewed from a face's outward normal is a negative
 * (right-hand rule) rotation about that normal.
 */
export function displayMoveAngle(move: Move): number {
  const face = moveFace(move);
  const positiveNormalFace = face === 'U' || face === 'R' || face === 'F';
  let sign = positiveNormalFace ? -1 : 1;
  if (isPrimeMove(move)) sign = -sign;
  return sign * (isDoubleMove(move) ? Math.PI : Math.PI / 2);
}

/** Cube yaw so the move's hold face points at the camera (+Z). */
function guideYawForHoldFace(holdFace: FaceId): number {
  if (holdFace === 'R') return -Math.PI / 2;
  if (holdFace === 'L') return Math.PI / 2;
  return 0;
}

/** Isometric tilt — keeps white (U) on top in the guide panel. */
const GUIDE_BASE_PITCH = -0.42;
const GUIDE_BASE_YAW = 0.62;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** Shortest-path angle interpolation (radians). */
export function lerpAngle(a: number, b: number, t: number): number {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
}

/**
 * Per-move yaw so the turning layer and arrow read clearly, with pitch locked
 * so U (white) stays on top — no D-layer flip.
 */
export function getOrientEuler(move: Move): THREE.Euler {
  const holdFace = getMoveHoldFace(move);
  const layer = moveFace(move);
  const baseYaw = guideYawForHoldFace(holdFace);

  let sideYaw = -0.32;
  if (layer !== 'U') {
    const normal = new THREE.Vector3(...FACE_NORMALS[layer]);
    normal.applyEuler(new THREE.Euler(0, baseYaw, 0));
    sideYaw = normal.x >= 0 ? -0.45 : 0.45;
  }

  return new THREE.Euler(GUIDE_BASE_PITCH, baseYaw + sideYaw, 0, 'XYZ');
}

interface CubieMesh {
  group: THREE.Group;
  coords: { x: number; y: number; z: number };
}

function stickerMaterial(color: StickerColor | null): THREE.Material {
  if (!color) {
    return new THREE.MeshStandardMaterial({
      color: CUBIE_BODY_HEX,
      metalness: 0.02,
      roughness: 0.72,
    });
  }
  return new THREE.MeshStandardMaterial({
    color: STICKER_HEX[color],
    metalness: 0.02,
    roughness: 0.38,
    emissive: STICKER_HEX[color],
    emissiveIntensity: 0.08,
  });
}

function buildCubieMesh(data: CubieStickers): CubieMesh {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE);
  const materials = data.faces.map((face) => stickerMaterial(face)) as THREE.Material[];
  const mesh = new THREE.Mesh(geometry, materials);
  group.add(mesh);

  group.position.set(
    data.coords.x * CUBIE_GAP,
    data.coords.y * CUBIE_GAP,
    data.coords.z * CUBIE_GAP,
  );

  return { group, coords: { ...data.coords } };
}

function layerFilter(face: FaceId, coords: { x: number; y: number; z: number }): boolean {
  switch (face) {
    case 'R':
      return coords.x === 1;
    case 'L':
      return coords.x === -1;
    case 'U':
      return coords.y === 1;
    case 'D':
      return coords.y === -1;
    case 'F':
      return coords.z === 1;
    case 'B':
      return coords.z === -1;
    default:
      return false;
  }
}

function rotateCoords(
  coords: { x: number; y: number; z: number },
  face: FaceId,
  angle: number,
): { x: number; y: number; z: number } {
  const v = new THREE.Vector3(coords.x, coords.y, coords.z);
  const axis = MOVE_AXES[face];
  v.applyAxisAngle(new THREE.Vector3(...axis), angle);
  return {
    x: Math.round(v.x),
    y: Math.round(v.y),
    z: Math.round(v.z),
  };
}

export class SolveCubeRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly cubeRoot = new THREE.Group();
  private readonly guideRoot = new THREE.Group();
  private cubies: CubieMesh[] = [];
  private animating = false;
  private idleAngle = 0;
  private facelet = '';
  private rafId = 0;
  private animRafId = 0;
  private disposed = false;
  private guideMove: Move | null = null;
  private guideWrong = false;
  private celebrationQuat = new THREE.Quaternion();

  constructor(canvas: HTMLCanvasElement, options: { antialias?: boolean } = {}) {
    this.scene.background = null;
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.05));
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(1.5, 4.5, 6);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xdde8ff, 0.6);
    fill.position.set(-3, 2, 4);
    this.scene.add(fill);

    this.cubeRoot.rotation.set(GUIDE_BASE_PITCH, GUIDE_BASE_YAW, 0);
    this.scene.add(this.cubeRoot);
    this.guideRoot.matrixAutoUpdate = false;
    this.guideRoot.renderOrder = GUIDE_RENDER_ORDER;
    this.scene.add(this.guideRoot);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(4.2, 3.6, 4.8);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: options.antialias ?? true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Celebration render quality — capped for performance. */
  refreshCelebrationQuality(): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  setFacelet(facelet: string): void {
    this.facelet = facelet;
    this.rebuildCubies();
  }

  getFacelet(): string {
    return this.facelet;
  }

  isAnimating(): boolean {
    return this.animating;
  }

  /** Cancel in-flight move/orient animations (e.g. step skipped or index jumped). */
  cancelAnimations(): void {
    cancelAnimationFrame(this.animRafId);
    this.animRafId = 0;
    if (!this.animating) return;
    this.animating = false;
    // Layer-turn animations reparent cubies into a pivot — rebuild from facelet if cancelled.
    for (const child of [...this.cubeRoot.children]) {
      this.cubeRoot.remove(child);
    }
    this.cubies = [];
    this.rebuildCubies();
    this.renderFrame();
  }

  private rebuildCubies(): void {
    for (const cubie of this.cubies) {
      this.cubeRoot.remove(cubie.group);
      cubie.group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) m.dispose();
        }
      });
    }

    this.cubies = cubiesFromFacelet(this.facelet).map(buildCubieMesh);
    for (const cubie of this.cubies) {
      this.cubeRoot.add(cubie.group);
    }
  }

  animateMove(move: Move): Promise<void> {
    if (this.animating) return Promise.resolve();
    const face = moveFace(move);
    const angle = displayMoveAngle(move);
    const layer = this.cubies.filter((c) => layerFilter(face, c.coords));
    if (layer.length === 0) return Promise.resolve();

    this.animating = true;
    const pivot = new THREE.Group();
    this.cubeRoot.add(pivot);

    for (const cubie of layer) {
      pivot.add(cubie.group);
      cubie.group.position.sub(pivot.position);
    }

    const axis = new THREE.Vector3(...MOVE_AXES[face]);
    const start = performance.now();

    return new Promise((resolve) => {
      const tick = (now: number) => {
        if (this.disposed) {
          resolve();
          return;
        }
        const t = Math.min(1, (now - start) / ANIM_MS);
        const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        pivot.setRotationFromAxisAngle(axis, angle * eased);
        this.renderFrame();

        if (t < 1) {
          this.animRafId = requestAnimationFrame(tick);
        } else {
          pivot.setRotationFromAxisAngle(axis, angle);
          for (const cubie of layer) {
            this.cubeRoot.add(cubie.group);
            cubie.coords = rotateCoords(cubie.coords, face, angle);
            cubie.group.position.set(
              cubie.coords.x * CUBIE_GAP,
              cubie.coords.y * CUBIE_GAP,
              cubie.coords.z * CUBIE_GAP,
            );
            cubie.group.rotation.set(0, 0, 0);
          }
          this.cubeRoot.remove(pivot);
          this.applyMoveToFacelet(move);
          this.rebuildCubies();
          this.animating = false;
          this.animRafId = 0;
          resolve();
        }
      };
      this.animRafId = requestAnimationFrame(tick);
    });
  }

  private applyMoveToFacelet(move: Move): void {
    try {
      const cube = Cube.fromString(this.facelet);
      cube.move(move);
      this.facelet = cube.asString();
    } catch {
      // Keep visual state from geometry if facelet invalid.
    }
  }

  /**
   * Fixed front camera for the solving guide (slightly above cube center).
   * Compact mode zooms in to reduce letterboxing in short mobile panels.
   */
  setGuideView(compact = false): void {
    if (compact) {
      this.camera.position.set(0, 1.85, 6.9);
      this.camera.fov = 54;
    } else {
      this.camera.position.set(0, 2.15, 8.8);
      this.camera.fov = 44;
    }
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.renderFrame();
  }

  /** Closer camera for the solved celebration screen. */
  setCelebrationView(): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.camera.position.set(0, 1.5, 6.8);
    this.camera.fov = 34;
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.renderFrame();
  }

  /**
   * Orient for the next move: white stays on top, yaw shifts so the turn reads clearly.
   */
  orientForMove(move: Move): void {
    this.cubeRoot.rotation.copy(getOrientEuler(move));
    this.renderFrame();
  }

  /** Smoothly rotate the whole cube to the next guide pose. */
  animateOrientForMove(move: Move, durationMs = ORIENT_ANIM_MS): Promise<void> {
    if (this.disposed || this.animating) {
      this.orientForMove(move);
      return Promise.resolve();
    }

    const target = getOrientEuler(move);
    const start = this.cubeRoot.rotation.clone();
    const startMs = performance.now();
    this.animating = true;

    return new Promise((resolve) => {
      const tick = (now: number) => {
        if (this.disposed) {
          this.animating = false;
          resolve();
          return;
        }

        const t = easeInOut(Math.min(1, (now - startMs) / durationMs));
        this.cubeRoot.rotation.x = lerpAngle(start.x, target.x, t);
        this.cubeRoot.rotation.y = lerpAngle(start.y, target.y, t);
        this.cubeRoot.rotation.z = lerpAngle(start.z, target.z, t);
        this.renderFrame();

        if (t < 1) {
          this.animRafId = requestAnimationFrame(tick);
        } else {
          this.cubeRoot.rotation.copy(target);
          this.animating = false;
          this.animRafId = 0;
          this.renderFrame();
          resolve();
        }
      };
      this.animRafId = requestAnimationFrame(tick);
    });
  }

  /** Draw (or clear) the rotation arrow for the next move. */
  setMoveArrow(move: Move | null, wrong = false): void {
    if (move === this.guideMove && wrong === this.guideWrong) return;
    this.guideMove = move;
    this.guideWrong = wrong;
    this.clearGuide();
    if (!move) {
      this.renderFrame();
      return;
    }

    const face = moveFace(move);
    const color = wrong ? ARROW_WRONG_COLOR : ARROW_COLOR;
    const normal = new THREE.Vector3(...FACE_NORMALS[face]).normalize();

    // Right-handed basis on the face plane: increasing arc angle is
    // counterclockwise viewed from the face's outward normal.
    let ref = new THREE.Vector3(0, 1, 0);
    if (Math.abs(normal.dot(ref)) > 0.9) ref.set(0, 0, 1);
    const perp = new THREE.Vector3().crossVectors(normal, ref).normalize();
    ref = new THREE.Vector3().crossVectors(perp, normal).normalize();

    const sweep =
      (isPrimeMove(move) ? 1 : -1) * (isDoubleMove(move) ? Math.PI : Math.PI / 2);
    // Center the arc on the camera-facing side of the move face.
    const phase = -sweep / 2;
    const radius = 1.28;
    const surface = normal.clone().multiplyScalar(CUBE_HALF + 0.36);
    const steps = 32;

    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = phase + (sweep * i) / steps;
      points.push(
        ref
          .clone()
          .multiplyScalar(Math.cos(t) * radius)
          .add(perp.clone().multiplyScalar(Math.sin(t) * radius))
          .add(surface),
      );
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const trackMat = guideOverlayMaterial(color);
    const track = tagGuideObject(
      new THREE.Mesh(new THREE.TubeGeometry(curve, steps, 0.1, 10, false), trackMat),
    );
    this.guideRoot.add(track);

    const tip = points[points.length - 1]!;
    const prev = points[points.length - 2] ?? tip;
    const dir = new THREE.Vector3().subVectors(tip, prev).normalize();
    const head = tagGuideObject(
      new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.56, 14), trackMat.clone()),
    );
    head.position.copy(tip).add(dir.clone().multiplyScalar(0.14));
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.guideRoot.add(head);

    this.renderFrame();
  }

  private clearGuide(): void {
    while (this.guideRoot.children.length > 0) {
      const child = this.guideRoot.children[0]!;
      this.guideRoot.remove(child);
      child.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) m.dispose();
        }
      });
    }
  }

  startIdleSpin(): void {
    const spin = () => {
      if (this.disposed) return;
      if (!this.animating) {
        this.idleAngle += 0.004;
        this.cubeRoot.rotation.y = 0.62 + this.idleAngle;
      }
      this.renderFrame();
      this.rafId = requestAnimationFrame(spin);
    };
    cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(spin);
  }

  /** Centered solved cube — gentle tumble at 30fps. */
  startCelebrationAnim(): void {
    this.setCelebrationView();
    this.cubeRoot.rotation.set(0.38, 0.75, 0.08);
    this.cubeRoot.scale.setScalar(1);
    this.celebrationQuat.setFromEuler(this.cubeRoot.rotation);

    const tumbleAxis = new THREE.Vector3();
    const deltaQuat = new THREE.Quaternion();
    let lastFrameMs = 0;
    const frameIntervalMs = 1000 / 30;

    const animate = (now: number) => {
      if (this.disposed) return;
      if (!this.animating && now - lastFrameMs >= frameIntervalMs) {
        lastFrameMs = now;
        const t = now * 0.001;
        tumbleAxis
          .set(
            Math.sin(t * 0.71) * 0.55 + 0.25,
            Math.cos(t * 0.53) * 0.45 + 0.55,
            Math.sin(t * 0.43) * 0.5 + 0.35,
          )
          .normalize();
        deltaQuat.setFromAxisAngle(tumbleAxis, 0.017);
        this.celebrationQuat.multiply(deltaQuat);
        this.cubeRoot.quaternion.copy(this.celebrationQuat);
        this.cubeRoot.scale.setScalar(1 + 0.05 * Math.sin(t * 2.2));
        this.renderFrame();
      }
      this.rafId = requestAnimationFrame(animate);
    };

    cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(animate);
  }

  stopIdleSpin(): void {
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  renderFrame(): void {
    this.cubeRoot.updateMatrixWorld(true);
    this.guideRoot.matrix.copy(this.cubeRoot.matrixWorld);
    this.guideRoot.matrixWorldNeedsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.disposed = true;
    this.stopIdleSpin();
    this.cancelAnimations();
    this.clearGuide();
    for (const cubie of this.cubies) {
      this.cubeRoot.remove(cubie.group);
      cubie.group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) m.dispose();
        }
      });
    }
    this.cubies = [];
    this.renderer.dispose();
  }
}
