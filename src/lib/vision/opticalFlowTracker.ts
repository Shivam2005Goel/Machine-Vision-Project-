import type { Point2D } from '../../types';

const MAX_LOST_FRAMES = 45;

export class OpticalFlowTracker {
  private prevGray: import('../../types/opencv').OpenCVMat | null = null;
  private trackedCorners: [Point2D, Point2D, Point2D, Point2D] | null = null;
  private lostFrames = 0;
  private lastFlowVectors: Point2D[] | null = null;

  getLostFrames(): number {
    return this.lostFrames;
  }

  getLastFlowVectors(): Point2D[] | null {
    return this.lastFlowVectors;
  }

  reset(): void {
    this.prevGray?.delete();
    this.prevGray = null;
    this.trackedCorners = null;
    this.lostFrames = 0;
    this.lastFlowVectors = null;
  }

  /** Pre-load corners from scan/solve start without resetting on first frame. */
  seed(corners: [Point2D, Point2D, Point2D, Point2D]): void {
    this.trackedCorners = corners;
    this.lostFrames = 0;
  }

  update(
    gray: import('../../types/opencv').OpenCVMat,
    detectedCorners: [Point2D, Point2D, Point2D, Point2D] | null,
  ): [Point2D, Point2D, Point2D, Point2D] | null {
    const cv = window.cv;

    if (detectedCorners) {
      this.trackedCorners = detectedCorners;
      this.lostFrames = 0;
      this.lastFlowVectors = null;
      this.prevGray?.delete();
      this.prevGray = gray.clone();
      return detectedCorners;
    }

    if (!this.trackedCorners) {
      return null;
    }

    if (!this.prevGray) {
      this.prevGray = gray.clone();
      return this.trackedCorners;
    }

    const prevPts = cv.matFromArray(4, 1, cv.CV_32FC2, flattenCorners(this.trackedCorners));
    const nextPts = new cv.Mat();
    const status = new cv.Mat();
    const err = new cv.Mat();

    cv.calcOpticalFlowPyrLK(this.prevGray, gray, prevPts, nextPts, status, err);

    const updated: Point2D[] = [];
    const flowVectors: Point2D[] = [];
    let validCount = 0;
    for (let i = 0; i < 4; i++) {
      const ok = status.data[i] === 1;
      const x = nextPts.data32F[i * 2]!;
      const y = nextPts.data32F[i * 2 + 1]!;
      const prev = this.trackedCorners[i]!;
      if (ok && Number.isFinite(x) && Number.isFinite(y)) {
        updated.push({ x, y });
        flowVectors.push({ x: x - prev.x, y: y - prev.y });
        validCount++;
      } else {
        updated.push(prev);
        flowVectors.push({ x: 0, y: 0 });
      }
    }

    prevPts.delete();
    nextPts.delete();
    status.delete();
    err.delete();
    this.prevGray.delete();
    this.prevGray = gray.clone();

    if (validCount < 2) {
      this.lostFrames++;
      if (this.lostFrames > MAX_LOST_FRAMES) {
        this.reset();
        return null;
      }
      return this.trackedCorners;
    }

    this.trackedCorners = updated as [Point2D, Point2D, Point2D, Point2D];
    this.lastFlowVectors = flowVectors;
    this.lostFrames = 0;
    if (this.lostFrames > MAX_LOST_FRAMES) {
      this.reset();
      return null;
    }

    return this.trackedCorners;
  }
}

function flattenCorners(corners: [Point2D, Point2D, Point2D, Point2D]): number[] {
  return corners.flatMap((p) => [p.x, p.y]);
}
