import * as THREE from 'three';
import type { CubePose, Move } from '../../types';
import { FACE_NORMALS, isDoubleMove, isPrimeMove, moveAngle, moveFace } from '../cube/moves';

const ARROW_COLOR = 0xffffff;

export class ARRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private arrowGroup: THREE.Group;
  private traceGroup: THREE.Group | null = null;
  private currentMove: Move | null = null;
  private traceProgress = 0;
  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement) {
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
    this.camera.position.set(0, 0, 3);

    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(2, 3, 4);
    this.scene.add(ambient, dir);

    this.arrowGroup = new THREE.Group();
    this.scene.add(this.arrowGroup);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  setMove(move: Move | null): void {
    if (move === this.currentMove) return;
    this.currentMove = move;
    this.traceProgress = 0;
    this.rebuildArrow(move);
  }

  setRotationProgress(progress: number): void {
    const clamped = Math.max(0, Math.min(1, progress));
    if (Math.abs(clamped - this.traceProgress) < 0.008) return;
    this.traceProgress = clamped;
    this.updateTrace();
  }

  tick(): void {
    // Trace progress is driven by live rotation via setRotationProgress.
  }

  render(pose: CubePose | null): void {
    if (!pose || !this.currentMove) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const cubeGroup = new THREE.Group();
    const rot = new THREE.Matrix4();
    rot.set(
      pose.rotationMatrix[0]!,
      pose.rotationMatrix[1]!,
      pose.rotationMatrix[2]!,
      0,
      pose.rotationMatrix[3]!,
      pose.rotationMatrix[4]!,
      pose.rotationMatrix[5]!,
      0,
      pose.rotationMatrix[6]!,
      pose.rotationMatrix[7]!,
      pose.rotationMatrix[8]!,
      0,
      0,
      0,
      0,
      1,
    );

    cubeGroup.setRotationFromMatrix(rot);
    const scale = pose.size / this.width;
    cubeGroup.position.set(
      (pose.translation[0] - this.width / 2) * scale,
      -(pose.translation[1] - this.height / 2) * scale,
      pose.translation[2] * scale,
    );
    cubeGroup.scale.setScalar(scale * 2);

    this.arrowGroup.matrixAutoUpdate = false;
    this.arrowGroup.matrix.copy(cubeGroup.matrix);
    this.arrowGroup.matrixWorldNeedsUpdate = true;

    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
    this.clearArrow();
  }

  private rebuildArrow(move: Move | null): void {
    this.clearArrow();
    if (!move) return;

    const face = moveFace(move);
    const normal = new THREE.Vector3(...FACE_NORMALS[face]);
    const up = new THREE.Vector3(0, 1, 0);
    if (Math.abs(normal.dot(up)) > 0.9) up.set(0, 0, 1);

    const tangent = new THREE.Vector3().crossVectors(up, normal).normalize();
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();

    const offset = normal.clone().multiplyScalar(0.52);
    const group = new THREE.Group();
    group.position.copy(offset);
    group.userData = { tangent, bitangent, move };

    const angle = moveAngle(move);
    const arcRadius = 0.32;
    const segments = 32;
    const start = isPrimeMove(move) ? angle : 0;
    const end = isPrimeMove(move) ? 0 : angle;

    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = start + ((end - start) * i) / segments;
      const p = tangent
        .clone()
        .multiplyScalar(Math.cos(t) * arcRadius)
        .add(bitangent.clone().multiplyScalar(Math.sin(t) * arcRadius));
      points.push(p);
    }

    group.userData.points = points;
    group.userData.segments = segments;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.4, 48),
      new THREE.MeshBasicMaterial({
        color: ARROW_COLOR,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    group.add(ring);

    if (isDoubleMove(move)) {
      const mirror = ring.clone();
      mirror.rotation.z = Math.PI;
      group.add(mirror);
    }

    this.traceGroup = group;
    this.arrowGroup.add(group);
    this.updateTrace();
  }

  private updateTrace(): void {
    if (!this.traceGroup || !this.currentMove) return;

    const old = this.traceGroup.getObjectByName('trace');
    if (old) {
      this.traceGroup.remove(old);
      disposeObject(old);
    }

    const points = this.traceGroup.userData.points as THREE.Vector3[];
    const segments = this.traceGroup.userData.segments as number;
    if (!points?.length) return;

    const endIdx = Math.max(2, Math.floor(segments * this.traceProgress));
    const partial = points.slice(0, endIdx + 1);
    if (partial.length < 2) return;

    const curve = new THREE.CatmullRomCurve3(partial);
    const tube = new THREE.TubeGeometry(curve, endIdx, 0.028, 8, false);
    const material = new THREE.MeshBasicMaterial({
      color: ARROW_COLOR,
      transparent: true,
      opacity: 0.88,
      depthTest: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(tube, material);
    mesh.name = 'trace';
    this.traceGroup.add(mesh);

    const headPoint = partial[partial.length - 1]!;
    const prevPoint = partial[partial.length - 2] ?? headPoint;
    const dir = new THREE.Vector3().subVectors(headPoint, prevPoint).normalize();
    const head = new THREE.Mesh(
      new THREE.ConeGeometry(0.065, 0.15, 12),
      material.clone(),
    );
    head.name = 'trace';
    head.position.copy(headPoint);
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.traceGroup.add(head);
  }

  private clearArrow(): void {
    this.traceGroup = null;
    while (this.arrowGroup.children.length > 0) {
      const child = this.arrowGroup.children[0]!;
      this.arrowGroup.remove(child);
      disposeObject(child);
    }
  }
}

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.geometry.dispose();
      if (Array.isArray(node.material)) {
        node.material.forEach((m) => m.dispose());
      } else {
        node.material.dispose();
      }
    }
  });
}
