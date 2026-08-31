export type FaceId = 'U' | 'D' | 'F' | 'B' | 'L' | 'R';

export type StickerColor = 'W' | 'Y' | 'R' | 'O' | 'B' | 'G';

/** Uncertain sticker read during live scan — filled later via cube constraints. */
export type ReadColor = StickerColor | '?';

export type Move =
  | 'R'
  | "R'"
  | 'R2'
  | 'L'
  | "L'"
  | 'L2'
  | 'U'
  | "U'"
  | 'U2'
  | 'D'
  | "D'"
  | 'D2'
  | 'F'
  | "F'"
  | 'F2'
  | 'B'
  | "B'"
  | 'B2';

export interface Point2D {
  x: number;
  y: number;
}

export interface CubePose {
  corners: [Point2D, Point2D, Point2D, Point2D];
  center: Point2D;
  size: number;
  rotationMatrix: number[];
  translation: [number, number, number];
  confidence: number;
  visibleFace?: FaceId | null;
  cameraFx?: number;
  cameraFy?: number;
  cameraCx?: number;
  cameraCy?: number;
}

export interface DetectedFace {
  colors: ReadColor[];
  pose: CubePose;
  /** Per-cell median RGB used for face-aware warm color refinement. */
  medians?: [number, number, number][];
}

export interface ScannedFace {
  faceId: FaceId;
  colors: StickerColor[];
}

export type AppPhase =
  | 'loading'
  | 'camera'
  | 'colorLearn'
  | 'scanReady'
  | 'liveScan'
  | 'computing'
  | 'solving'
  | 'solved'
  | 'error';

export interface SolutionProgress {
  moves: Move[];
  currentIndex: number;
}

export type DetectionStatus =
  | 'searching'
  | 'detected'
  | 'weak-read'
  | 'stabilizing'
  | 'captured'
  | 'rotate';

export interface DetectionFeedback {
  status: DetectionStatus;
  stableProgress: number;
  stableTarget: number;
  detectedCenter: StickerColor | null;
  colorCounts: Record<StickerColor, number>;
  cellColors: ReadColor[];
  uncertainCells: number;
}

export type SolvingTrackingStatus = 'searching' | 'locked' | 'lost';

export type FaceScanStatus = 'missing' | 'scanning' | 'locked';

export interface FaceScanInfo {
  faceId: FaceId;
  status: FaceScanStatus;
  matchScore: number;
}

export interface SolvingFeedback {
  tracking: SolvingTrackingStatus;
  rotationProgress: number;
  wrongMove: Move | null;
  visibleFace: FaceId | null;
  faceMatchesMove: boolean;
  liveFaceColors: StickerColor[] | null;
  visibleFaceColors: Partial<Record<FaceId, StickerColor[]>>;
  visibleFaces: FaceId[];
  stableVisibleFaceColors: Partial<Record<FaceId, StickerColor[]>>;
  poseRotationProgress: number;
  handMotionDetected: boolean;
  scanMatch: number;
  comparisonFace: FaceId | null;
  faceScanInfos: FaceScanInfo[];
  deformationScore: number;
  layerTurnInProgress: boolean;
  sawShapeBreak: boolean;
  layerTurnValidated: boolean;
  holdFaceAligned: boolean;
}

export interface QuadShapeMetrics {
  aspectRatio: number;
  angleDeviation: number;
  projectedResidual: number;
  flowDivergence: number;
  flowMagnitude: number;
  deformationScore: number;
}

export interface FrameResult {
  pose: CubePose | null;
  detectedFace: DetectedFace | null;
  rotationMove: Move | null;
  rotationProgress: number;
  wrongMove: Move | null;
  visibleFaceColors: Partial<Record<FaceId, StickerColor[]>>;
  shapeMetrics: QuadShapeMetrics | null;
}

export interface CameraIntrinsics {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
}
