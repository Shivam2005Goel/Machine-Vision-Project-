import type { CubePose } from '../../types';

function lerp(a: number, b: number, t: number): number {
  return a * (1 - t) + b * t;
}

function lerpCorners(
  a: [import('../../types').Point2D, import('../../types').Point2D, import('../../types').Point2D, import('../../types').Point2D],
  b: [import('../../types').Point2D, import('../../types').Point2D, import('../../types').Point2D, import('../../types').Point2D],
  t: number,
) {
  return a.map((p, i) => ({
    x: lerp(p.x, b[i]!.x, t),
    y: lerp(p.y, b[i]!.y, t),
  })) as typeof a;
}

/** Exponential smoothing for cube pose — reduces PnP jitter during solving. */
export class PoseSmoother {
  private state: CubePose | null = null;

  reset(): void {
    this.state = null;
  }

  update(pose: CubePose, alpha = 0.38): CubePose {
    if (!this.state || pose.confidence < 0.4) {
      this.state = pose;
      return pose;
    }

    const t = pose.confidence > 0.75 ? alpha : alpha * 0.55;
    const rotationMatrix = pose.rotationMatrix.map((v, i) =>
      lerp(this.state!.rotationMatrix[i]!, v, t),
    );
    const translation: [number, number, number] = [
      lerp(this.state.translation[0], pose.translation[0], t),
      lerp(this.state.translation[1], pose.translation[1], t),
      lerp(this.state.translation[2], pose.translation[2], t),
    ];
    const corners = lerpCorners(this.state.corners, pose.corners, t);
    const center = {
      x: lerp(this.state.center.x, pose.center.x, t),
      y: lerp(this.state.center.y, pose.center.y, t),
    };
    const size = lerp(this.state.size, pose.size, t);

    const smoothed: CubePose = {
      ...pose,
      corners,
      center,
      size,
      rotationMatrix,
      translation,
      confidence: Math.max(this.state.confidence, pose.confidence) * 0.92 + pose.confidence * 0.08,
    };
    this.state = smoothed;
    return smoothed;
  }
}
