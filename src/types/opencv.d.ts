/* eslint-disable @typescript-eslint/no-explicit-any */
export interface OpenCVMat {
  rows: number;
  cols: number;
  delete(): void;
  clone(): OpenCVMat;
  data: Uint8Array;
  data32F: Float32Array;
  data32S: Int32Array;
  ucharAt(row: number, col: number): number;
  floatAt(row: number, col: number): number;
}

export interface OpenCVPoint {
  x: number;
  y: number;
}

export interface OpenCV {
  Mat: new (...args: unknown[]) => OpenCVMat;
  MatVector: new () => { size(): number; get(i: number): OpenCVMat; delete(): void };
  Point: new (x: number, y: number) => OpenCVPoint;
  Point2f: new (x: number, y: number) => OpenCVPoint;
  Size: new (w: number, h: number) => { width: number; height: number };
  Scalar: new (...args: number[]) => unknown;
  CV_8UC4: number;
  CV_8UC3: number;
  CV_32FC1: number;
  CV_32FC2: number;
  COLOR_RGBA2RGB: number;
  COLOR_RGBA2GRAY: number;
  COLOR_RGB2HSV: number;
  RETR_EXTERNAL: number;
  RETR_LIST: number;
  CHAIN_APPROX_SIMPLE: number;
  THRESH_BINARY: number;
  THRESH_OTSU: number;
  THRESH_OTSU: number;
  MORPH_CLOSE: number;
  MORPH_RECT: number;
  BORDER_DEFAULT: number;
  INTER_LINEAR: number;
  imread(canvas: HTMLCanvasElement): OpenCVMat;
  cvtColor(src: OpenCVMat, dst: OpenCVMat, code: number): void;
  GaussianBlur(src: OpenCVMat, dst: OpenCVMat, ksize: unknown, sigma: number): void;
  Canny(src: OpenCVMat, dst: OpenCVMat, t1: number, t2: number): void;
  findContours(
    image: OpenCVMat,
    contours: unknown,
    hierarchy: OpenCVMat,
    mode: number,
    method: number,
  ): void;
  contourArea(contour: OpenCVMat): number;
  arcLength(contour: OpenCVMat, closed: boolean): number;
  approxPolyDP(contour: OpenCVMat, approx: OpenCVMat, epsilon: number, closed: boolean): void;
  getPerspectiveTransform(src: OpenCVMat, dst: OpenCVMat): OpenCVMat;
  warpPerspective(
    src: OpenCVMat,
    dst: OpenCVMat,
    M: OpenCVMat,
    dsize: unknown,
    flags?: number,
    borderMode?: number,
  ): void;
  solvePnP(
    objectPoints: OpenCVMat,
    imagePoints: OpenCVMat,
    cameraMatrix: OpenCVMat,
    distCoeffs: OpenCVMat,
    rvec: OpenCVMat,
    tvec: OpenCVMat,
    useExtrinsicGuess?: boolean,
    flags?: number,
  ): void;
  Rodrigues(src: OpenCVMat, dst: OpenCVMat): void;
  matFromArray(rows: number, cols: number, type: number, array: number[]): OpenCVMat;
  matFromPointVector(points: OpenCVPoint[]): OpenCVMat;
  goodFeaturesToTrack(
    image: OpenCVMat,
    corners: OpenCVMat,
    maxCorners: number,
    qualityLevel: number,
    minDistance: number,
  ): void;
  calcOpticalFlowPyrLK(
    prevImg: OpenCVMat,
    nextImg: OpenCVMat,
    prevPts: OpenCVMat,
    nextPts: OpenCVMat,
    status: OpenCVMat,
    err: OpenCVMat,
  ): void;
  morphologyEx(src: OpenCVMat, dst: OpenCVMat, op: number, kernel: OpenCVMat): void;
  getStructuringElement(shape: number, ksize: unknown): OpenCVMat;
  threshold(
    src: OpenCVMat,
    dst: OpenCVMat,
    thresh: number,
    maxval: number,
    type: number,
  ): void;
  bitwise_or(src1: OpenCVMat, src2: OpenCVMat, dst: OpenCVMat): void;
  inRange(
    src: OpenCVMat,
    lower: unknown,
    upper: unknown,
    dst: OpenCVMat,
  ): void;
  COLOR_RGB2GRAY: number;
  imshow(canvas: HTMLCanvasElement, mat: OpenCVMat): void;
  onRuntimeInitialized?: () => void;
}

declare global {
  interface Window {
    cv: OpenCV;
  }
}
