import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AppPhase,
  CubePose,
  DetectionFeedback,
  DetectionStatus,
  FaceId,
  FaceScanInfo,
  Move,
  ReadColor,
  SolutionProgress,
  SolvingFeedback,
  StickerColor,
} from '../types';
import { buildFaceletFromMap, FACELET_ORDER } from '../lib/cube/state';
import { moveFace, inverseMove } from '../lib/cube/moves';
import { getMoveHoldFace, isHoldFaceAligned } from '../lib/cube/moveGuidanceView';
import {
  evaluateThreeFaceMoveProgress,
  applyMoveToFacelet,
  applyMoveToFaceletCached,
  clearMoveFaceletCache,
  createMoveColorTrackerState,
  resetMoveColorTracker,
  majorityVoteFaceColors,
  matchFaceToFacelet,
} from '../lib/cube/moveColorProgress';
import { identifyFaceFromCenter, getFaceCenterColor } from '../lib/cube/colors';
import { getVisibleFaces } from '../lib/vision/visibleFaces';
import {
  isLayerTurnDeformation,
  isRigidCubeReposition,
} from '../lib/vision/quadShapeMetrics';
import {
  createSolvingStepState,
  evaluateSolvingFrame,
  resetSolvingStepState,
} from '../lib/cube/solvingStepPolicy';
import { detectWrongMoveFromColors } from '../lib/cube/detectWrongMove';
import { createSolverWorker, type SolverResponse } from '../lib/cube/solverClient';
import { CLIENT_SOLVE_TIMEOUT_MS } from '../lib/cube/solverConfig';
import { emptyColorCounts, getCalibrationFeedback, isColorsReadable } from '../lib/vision/colorClassifier';
import { formatColourMismatchError, formatArrangementFailureError, isCubeColorBalanced, hasUncertainCells, reconcileLiveScanFaces, solveMapFromScannedRecord } from '../lib/vision/cubeColorReconcile';
import {
  COLOR_LEARN_ORDER,
  calibrateLearnedColor,
  clearInMemoryColorReferences,
  loadPersistedColorReferences,
  resetColorReferences,
  type ColorLearnSample,
} from '../lib/vision/colorReference';
import { FrameProcessor } from '../lib/vision/frameProcessor';
import { getGuideSizeRatio } from '../lib/vision/roi';
import { LiveFaceAccumulator, canonicalizeScannedFaces, facesForDisplay } from '../lib/vision/liveFaceScan';
import { cloneFaceColorsMap } from '../lib/vision/selfieView';
import { resetScanWhiteCalibration } from '../lib/vision/scanWhiteCalibration';
import { isKnownColor, toStickerColors } from '../lib/vision/readColorUtils';
import { loadOpenCV } from '../lib/vision/opencvLoader';

function scannedFacesFromMap(
  faces: Map<FaceId, ReadColor[]>,
): Partial<Record<FaceId, ReadColor[]>> {
  return Object.fromEntries(cloneFaceColorsMap(faces)) as Partial<
    Record<FaceId, ReadColor[]>
  >;
}

function scannedFacesForDisplay(
  faces: Map<FaceId, ReadColor[]>,
): Partial<Record<FaceId, ReadColor[]>> {
  return scannedFacesFromMap(facesForDisplay(faces));
}

export interface CubeAppState {
  phase: AppPhase;
  error: string | null;
  knownFaces: FaceId[];
  scannedFaceColors: Partial<Record<FaceId, ReadColor[]>>;
  currentVisibleFace: FaceId | null;
  liveScanProgress: number;
  solution: SolutionProgress | null;
  currentPose: CubePose | null;
  solverReady: boolean;
  detectionFeedback: DetectionFeedback;
  colorLearnIndex: number;
  colorLearnSample: ColorLearnSample | null;
  colorLearnReady: boolean;
  colorLearnError: string | null;
  colorsCalibrated: boolean;
  liveScanNeedsClearerCenter: boolean;
  rescanTargetFace: FaceId | null;
  lastCapturedFace: FaceId | null;
  solvingFeedback: SolvingFeedback;
  solvingFacelet: string;
  /** Stable id for a solve run; used to reset auto-play only on new sessions. */
  solutionSessionKey: string;
}

const initialFeedback: DetectionFeedback = {
  status: 'searching',
  stableProgress: 0,
  stableTarget: 0,
  detectedCenter: null,
  colorCounts: emptyColorCounts(),
  cellColors: [],
  uncertainCells: 0,
};

const initialSolvingFeedback: SolvingFeedback = {
  tracking: 'searching',
  rotationProgress: 0,
  wrongMove: null,
  visibleFace: null,
  faceMatchesMove: false,
  liveFaceColors: null,
  visibleFaceColors: {},
  visibleFaces: [],
  stableVisibleFaceColors: {},
  poseRotationProgress: 0,
  handMotionDetected: false,
  scanMatch: 0,
  comparisonFace: null,
  faceScanInfos: [],
  deformationScore: 0,
  layerTurnInProgress: false,
  sawShapeBreak: false,
  layerTurnValidated: false,
  holdFaceAligned: false,
};

const initialState: CubeAppState = {
  phase: 'loading',
  error: null,
  knownFaces: [],
  scannedFaceColors: {},
  currentVisibleFace: null,
  liveScanProgress: 0,
  solution: null,
  currentPose: null,
  solverReady: false,
  detectionFeedback: initialFeedback,
  colorLearnIndex: 0,
  colorLearnSample: null,
  colorLearnReady: false,
  colorLearnError: null,
  colorsCalibrated: false,
  liveScanNeedsClearerCenter: false,
  rescanTargetFace: null,
  lastCapturedFace: null,
  solvingFeedback: initialSolvingFeedback,
  solvingFacelet: '',
  solutionSessionKey: '',
};

export function useCubeApp(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [state, setState] = useState<CubeAppState>(initialState);
  const frameProcessor = useRef<FrameProcessor | null>(null);
  const solverWorker = useRef<Worker | null>(null);
  const liveAccumulator = useRef(new LiveFaceAccumulator());
  const faceletRef = useRef<string>('');
  const solveInputFacesRef = useRef<Map<FaceId, StickerColor[]>>(new Map());
  const scanLayoutFacesRef = useRef<Map<FaceId, StickerColor[]>>(new Map());
  const rafRef = useRef<number>(0);
  const requestId = useRef(0);
  const phaseRef = useRef<AppPhase>('loading');
  const colorLearnIndexRef = useRef(0);
  const solutionRef = useRef<SolutionProgress | null>(null);
  const solvingStartMs = useRef(0);
  const stepReadyMs = useRef(0);
  const solveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPoseRef = useRef<CubePose | null>(null);
  const solveTriggeredRef = useRef(false);
  const trackingLostFrames = useRef(0);
  const expectedMoveRef = useRef<Move | null>(null);
  const colorCompleteStableRef = useRef(0);
  const moveColorTrackerRef = useRef(createMoveColorTrackerState());
  const recentDetectionsRef = useRef<StickerColor[][]>([]);
  const recentFaceDetectionsRef = useRef<Partial<Record<FaceId, StickerColor[][]>>>({});
  const scanMatchSmootherRef = useRef(0);
  const recentScanMatchRef = useRef<number[]>([]);
  const solvingStepStateRef = useRef(createSolvingStepState());
  const autoPlayEnabledRef = useRef(false);
  const lastSolvingPaintRef = useRef({
    tracking: 'searching' as SolvingFeedback['tracking'],
    wrongMove: null as Move | null,
    rotationProgress: 0,
    holdFaceAligned: false,
    layerTurnValidated: false,
    stepKey: '',
  });

  const setAutoPlayEnabled = useCallback((enabled: boolean) => {
    autoPlayEnabledRef.current = enabled;
  }, []);

  const syncExpectedMove = useCallback((move: Move | null) => {
    if (move === expectedMoveRef.current) return;
    expectedMoveRef.current = move;
    clearMoveFaceletCache();
    resetSolvingStepState(solvingStepStateRef.current);
    moveColorTrackerRef.current.requiredHoldFace = move ? getMoveHoldFace(move) : null;
    moveColorTrackerRef.current.stepAnchorFace = move
      ? getMoveHoldFace(move)
      : null;
    frameProcessor.current?.setExpectedMove(move);
    lastSolvingPaintRef.current.stepKey = '';
  }, []);

  const clearSolveTimeout = useCallback(() => {
    if (solveTimeoutRef.current) {
      clearTimeout(solveTimeoutRef.current);
      solveTimeoutRef.current = null;
    }
  }, []);

  const requestSolve = useCallback(
    (
      facelet: string,
      pose: CubePose,
      scannedFaces: Map<FaceId, StickerColor[]>,
      rawScannedFaces: Map<FaceId, StickerColor[]>,
      captures: StickerColor[][],
    ) => {
      const worker = solverWorker.current;
      if (!worker) {
        setState((s) => ({
          ...s,
          phase: 'error',
          error: 'Solver failed to start. Refresh the page and try again.',
        }));
        return;
      }

      clearSolveTimeout();
      const id = ++requestId.current;
      worker.postMessage({
        type: 'solve',
        facelet,
        scannedFaces: Object.fromEntries(scannedFaces) as Record<FaceId, StickerColor[]>,
        rawScannedFaces: Object.fromEntries(rawScannedFaces) as Record<FaceId, StickerColor[]>,
        captures,
        id,
      });
      frameProcessor.current?.syncPose(pose);

      solveTimeoutRef.current = setTimeout(() => {
        setState((s) => {
          if (s.phase !== 'computing') return s;
          const solveMap = solveMapFromScannedRecord(s.scannedFaceColors);
          const error =
            solveMap && !isCubeColorBalanced(solveMap)
              ? formatColourMismatchError(solveMap)
              : 'Solve timed out. Colours may have been misread.';
          return {
            ...s,
            phase: 'error',
            error,
          };
        });
      }, CLIENT_SOLVE_TIMEOUT_MS);
    },
    [clearSolveTimeout],
  );

  useEffect(() => {
    phaseRef.current = state.phase;
    solutionRef.current = state.solution;
    colorLearnIndexRef.current = state.colorLearnIndex;
  }, [state.phase, state.solution, state.colorLearnIndex]);

  const applyCompletedMove = useCallback((move: Move) => {
    const solution = solutionRef.current;
    if (!solution || solution.currentIndex >= solution.moves.length) return;
    const expected = solution.moves[solution.currentIndex];
    if (move !== expected) return;

    const prevFacelet = faceletRef.current;
    const nextFacelet = applyMoveToFacelet(prevFacelet, move);
    const nextIndex = solution.currentIndex + 1;
    const id = ++requestId.current;

    solverWorker.current?.postMessage({
      type: 'apply',
      move,
      facelet: prevFacelet,
      id,
    });

    faceletRef.current = nextFacelet;
    solutionRef.current = { ...solution, currentIndex: nextIndex };

    if (nextIndex >= solution.moves.length) {
      frameProcessor.current?.setSolvingScanMode(false);
    }

    setState((prev) => {
      if (!prev.solution) return prev;
      const stateExpected = prev.solution.moves[prev.solution.currentIndex];
      if (move !== stateExpected) return prev;

      if (nextIndex >= prev.solution.moves.length) {
        return {
          ...prev,
          phase: 'solved',
          solution: { ...prev.solution, currentIndex: nextIndex },
          solvingFeedback: initialSolvingFeedback,
          solvingFacelet: nextFacelet,
        };
      }
      return {
        ...prev,
        solution: { ...prev.solution, currentIndex: nextIndex },
        solvingFeedback: initialSolvingFeedback,
        solvingFacelet: nextFacelet,
      };
    });
    stepReadyMs.current = Date.now();
    colorCompleteStableRef.current = 0;
    resetMoveColorTracker(moveColorTrackerRef.current);
    resetSolvingStepState(solvingStepStateRef.current);
    recentDetectionsRef.current = [];
    recentFaceDetectionsRef.current = {};
    scanMatchSmootherRef.current = 0;
    recentScanMatchRef.current = [];
  }, []);

  const buildFeedback = useCallback(
    (
      hasPose: boolean,
      colors: ReadColor[] | null,
      stableProgress: number,
      stableTarget: number,
      captured: boolean,
      needsNewFace: boolean,
    ): DetectionFeedback => {
      const { detectedCenter, colorCounts, uncertainCells } = getCalibrationFeedback(colors);
      const readable = isColorsReadable(colors);

      let status: DetectionStatus = 'searching';
      if (!hasPose || !readable) {
        status = 'searching';
      } else if (needsNewFace) {
        status = 'rotate';
      } else if (captured) {
        status = 'captured';
      } else if (uncertainCells >= 4) {
        status = 'weak-read';
      } else if (!captured && !needsNewFace && stableProgress < stableTarget) {
        status = 'stabilizing';
      } else {
        status = 'detected';
      }

      return {
        status,
        stableProgress,
        stableTarget,
        detectedCenter,
        colorCounts,
        cellColors: readable && colors ? [...colors] : [],
        uncertainCells,
      };
    },
    [],
  );

  const enterColorLearn = useCallback((options?: { preservePersistedCalibration?: boolean }) => {
    if (options?.preservePersistedCalibration) {
      clearInMemoryColorReferences();
    } else {
      resetColorReferences();
    }
    resetScanWhiteCalibration();
    liveAccumulator.current.reset();
    solveTriggeredRef.current = false;
    lastPoseRef.current = null;
    autoPlayEnabledRef.current = false;
    setState((s) => ({
      ...s,
      phase: 'colorLearn',
      error: null,
      solution: null,
      knownFaces: [],
      scannedFaceColors: {},
      currentVisibleFace: null,
      liveScanProgress: 0,
      lastCapturedFace: null,
      colorLearnIndex: 0,
      colorLearnSample: null,
      colorLearnReady: false,
      colorLearnError: null,
      colorsCalibrated: false,
      detectionFeedback: initialFeedback,
      liveScanNeedsClearerCenter: false,
      rescanTargetFace: null,
      solutionSessionKey: '',
    }));
    frameProcessor.current?.disableTracking();
    expectedMoveRef.current = null;
  }, []);

  const enterScanReady = useCallback(() => {
    resetScanWhiteCalibration();
    liveAccumulator.current.reset();
    solveTriggeredRef.current = false;
    lastPoseRef.current = null;
    autoPlayEnabledRef.current = false;
    setState((s) => ({
      ...s,
      phase: 'scanReady',
      error: null,
      knownFaces: [],
      scannedFaceColors: {},
      currentVisibleFace: null,
      liveScanProgress: 0,
      lastCapturedFace: null,
      detectionFeedback: initialFeedback,
      liveScanNeedsClearerCenter: false,
      rescanTargetFace: null,
      solutionSessionKey: '',
    }));
    frameProcessor.current?.disableTracking();
    expectedMoveRef.current = null;
  }, []);

  const beginLiveScan = useCallback(() => {
    resetScanWhiteCalibration();
    liveAccumulator.current.reset();
    solveTriggeredRef.current = false;
    lastPoseRef.current = null;
    autoPlayEnabledRef.current = false;
    setState((s) => ({
      ...s,
      phase: 'liveScan',
      error: null,
      knownFaces: [],
      scannedFaceColors: {},
      currentVisibleFace: null,
      liveScanProgress: 0,
      lastCapturedFace: null,
      detectionFeedback: initialFeedback,
      liveScanNeedsClearerCenter: false,
      rescanTargetFace: null,
      solutionSessionKey: '',
    }));
    frameProcessor.current?.disableTracking();
    expectedMoveRef.current = null;
  }, []);

  const init = useCallback(async () => {
    try {
      await loadOpenCV();
      frameProcessor.current = new FrameProcessor();

      const worker = createSolverWorker();
      solverWorker.current = worker;

      worker.onmessage = (event: MessageEvent<SolverResponse>) => {
        const msg = event.data;
        if (msg.type === 'ready') {
          setState((s) => ({ ...s, solverReady: true }));
        } else if (msg.type === 'resolved') {
          if (msg.id !== requestId.current) return;
          faceletRef.current = msg.facelet;
        } else if (msg.type === 'solution') {
          if (msg.id !== requestId.current) return;
          clearSolveTimeout();
          faceletRef.current = msg.facelet;
          solutionRef.current = { moves: msg.moves, currentIndex: 0 };
          solvingStartMs.current = Date.now();
          stepReadyMs.current = Date.now();
          setState((s) => ({
            ...s,
            phase: msg.moves.length === 0 ? 'solved' : 'solving',
            solution: { moves: msg.moves, currentIndex: 0 },
            detectionFeedback: initialFeedback,
            solvingFeedback: initialSolvingFeedback,
            solvingFacelet: msg.facelet,
            solutionSessionKey: `${msg.facelet}:${msg.moves.join(' ')}`,
            currentPose: lastPoseRef.current ?? s.currentPose,
          }));
          if (msg.moves.length > 0) {
            frameProcessor.current?.setSolvingScanMode(true);
            const pose = lastPoseRef.current;
            if (pose) {
              frameProcessor.current?.enableSolvingTracking(pose);
            }
            syncExpectedMove(msg.moves[0] ?? null);
            colorCompleteStableRef.current = 0;
            resetMoveColorTracker(moveColorTrackerRef.current);
            resetSolvingStepState(solvingStepStateRef.current);
            recentDetectionsRef.current = [];
            recentFaceDetectionsRef.current = {};
          }
        } else if (msg.type === 'facelet') {
          if (msg.id !== requestId.current) return;
          faceletRef.current = msg.facelet;
          setState((s) => ({ ...s, solvingFacelet: msg.facelet }));
        } else if (msg.type === 'error') {
          if (msg.id !== undefined && msg.id !== requestId.current) return;
          clearSolveTimeout();
          solveTriggeredRef.current = false;
          setState((s) => {
            const solveMap = solveMapFromScannedRecord(s.scannedFaceColors);
            const error =
              solveMap && !isCubeColorBalanced(solveMap)
                ? formatColourMismatchError(solveMap)
                : solveMap
                  ? formatArrangementFailureError(solveMap)
                  : msg.message;
            return {
              ...s,
              phase: 'error',
              error,
            };
          });
        }
      };

      worker.onerror = () => {
        clearSolveTimeout();
        setState((s) => ({
          ...s,
          phase: 'error',
          error: 'Solver failed to load. Refresh the page and try again.',
        }));
      };

      worker.postMessage({ type: 'init' });
      liveAccumulator.current.reset();
      if (loadPersistedColorReferences()) {
        enterScanReady();
        setState((s) => ({ ...s, colorsCalibrated: true }));
      } else {
        enterColorLearn();
      }
    } catch (error) {
      setState((s) => ({
        ...s,
        phase: 'error',
        error: error instanceof Error ? error.message : 'Init failed',
      }));
    }
  }, [clearSolveTimeout, enterColorLearn, enterScanReady]);

  useEffect(() => {
    void init();
    return () => {
      cancelAnimationFrame(rafRef.current);
      clearSolveTimeout();
      solverWorker.current?.terminate();
      frameProcessor.current?.disableTracking();
    };
  }, [init, clearSolveTimeout]);

  const confirmColorLearn = useCallback(() => {
    const video = videoRef.current;
    const processor = frameProcessor.current;
    if (!video || !processor || video.readyState < 2) return;

    if (!processor.captureFrame(video)) return;

    const index = colorLearnIndexRef.current;
    const target = COLOR_LEARN_ORDER[index];
    if (!target) return;

    const canvas = processor.getFrameCanvas();
    const sample = calibrateLearnedColor(
      canvas,
      video.videoWidth,
      video.videoHeight,
      target,
    );
    if (!sample) {
      setState((s) => ({
        ...s,
        colorLearnError: `Could not read ${target}. Center the sticker in the circle.`,
      }));
      return;
    }

    const nextIndex = index + 1;
    if (nextIndex >= COLOR_LEARN_ORDER.length) {
      // Wait for an explicit "Start scan" tap instead of scanning immediately.
      enterScanReady();
      setState((s) => ({
        ...s,
        colorsCalibrated: true,
        colorLearnError: null,
      }));
      return;
    }

    setState((s) => ({
      ...s,
      colorLearnIndex: nextIndex,
      colorLearnSample: null,
      colorLearnReady: false,
      colorLearnError: null,
    }));
  }, [videoRef, enterScanReady]);

  const startLiveScan = useCallback(() => {
    beginLiveScan();
  }, [beginLiveScan]);

  const goToScanning = useCallback(() => {
    const phase = phaseRef.current;

    if (phase === 'colorLearn') {
      if (!loadPersistedColorReferences()) return;
      solveTriggeredRef.current = false;
      faceletRef.current = '';
      solveInputFacesRef.current = new Map();
      scanLayoutFacesRef.current = new Map();
      frameProcessor.current?.setSolvingScanMode(false);
      frameProcessor.current?.disableTracking();
      expectedMoveRef.current = null;
      resetSolvingStepState(solvingStepStateRef.current);
      enterScanReady();
      setState((s) => ({
        ...s,
        colorsCalibrated: true,
        colorLearnError: null,
        solution: null,
        solvingFeedback: initialSolvingFeedback,
        solvingFacelet: '',
        solutionSessionKey: '',
      }));
      return;
    }

    solveTriggeredRef.current = false;
    faceletRef.current = '';
    solveInputFacesRef.current = new Map();
    scanLayoutFacesRef.current = new Map();
    frameProcessor.current?.setSolvingScanMode(false);
    frameProcessor.current?.disableTracking();
    expectedMoveRef.current = null;
    resetSolvingStepState(solvingStepStateRef.current);
    enterScanReady();
    setState((s) => ({
      ...s,
      solution: null,
      solvingFeedback: initialSolvingFeedback,
      solvingFacelet: '',
      solutionSessionKey: '',
    }));
  }, [enterScanReady]);

  const scanAgainFromSolved = goToScanning;

  const requestRescanFace = useCallback((faceId: FaceId) => {
    const phase = phaseRef.current;
    // Also allowed from the error screen — drops back into live scanning.
    if (phase !== 'liveScan' && phase !== 'error') return;
    if (!liveAccumulator.current.getFaces().has(faceId)) return;

    solveTriggeredRef.current = false;
    liveAccumulator.current.removeFace(faceId);
    liveAccumulator.current.setRescanTarget(faceId);

    const faces = liveAccumulator.current.getFaces();
    setState((s) => ({
      ...s,
      phase: 'liveScan',
      error: null,
      rescanTargetFace: faceId,
      knownFaces: [...faces.keys()],
      scannedFaceColors: scannedFacesForDisplay(faces),
      liveScanProgress: faces.size / 6,
      lastCapturedFace: null,
      liveScanNeedsClearerCenter: false,
      detectionFeedback: {
        ...initialFeedback,
        status: 'searching',
      },
    }));
  }, []);

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const processor = frameProcessor.current;
    if (!video || !processor || video.readyState < 2) return;

    const result = processor.process(video);
    const phase = phaseRef.current;

    if (phase === 'colorLearn') {
      processor.captureFrame(video);
      const target = COLOR_LEARN_ORDER[colorLearnIndexRef.current];
      if (target) {
        const sample = processor.getColorLearnSample(
          video.videoWidth,
          video.videoHeight,
          target,
        );
        setState((prev) => ({
          ...prev,
          colorLearnSample: sample,
          colorLearnReady: sample?.ready ?? false,
          colorLearnError: null,
        }));
      }
      return;
    }

    if (phase === 'scanReady') {
      const colors = result.detectedFace?.colors ?? null;
      const hasPose = Boolean(result.pose);
      setState((prev) => ({
        ...prev,
        detectionFeedback: buildFeedback(hasPose, colors, 0, 0, false, false),
      }));
      return;
    }

    if (phase === 'liveScan') {
      const colors = result.detectedFace?.colors ?? null;
      const hasPose = Boolean(result.pose);
      if (result.pose) lastPoseRef.current = result.pose;

      const snapshot = liveAccumulator.current.update(
        colors,
        result.detectedFace?.medians ?? null,
      );
      const captured = Boolean(snapshot.newlyCaptured || snapshot.faceUpdated);

      const readyToSolve =
        snapshot.faceUpdated ||
        (!snapshot.holdingScannedFace && !snapshot.newlyCaptured);

      if (snapshot.isComplete && lastPoseRef.current && readyToSolve) {
        if (snapshot.faceUpdated) {
          solveTriggeredRef.current = false;
        }
        if (!solveTriggeredRef.current) {
          solveTriggeredRef.current = true;
          const snapshotFaces = canonicalizeScannedFaces(cloneFaceColorsMap(snapshot.faces));
          const reconciledFaces = reconcileLiveScanFaces(snapshotFaces);
          const scannedRecord = scannedFacesFromMap(facesForDisplay(reconciledFaces));

          try {
            const solveMap = new Map<FaceId, StickerColor[]>();
            for (const [faceId, colors] of reconciledFaces) {
              const fixed = [...toStickerColors(colors)] as StickerColor[];
              fixed[4] = getFaceCenterColor(faceId);
              solveMap.set(faceId, fixed);
            }

            if (hasUncertainCells(reconciledFaces)) {
              setState((s) => ({
                ...s,
                phase: 'error',
                scannedFaceColors: scannedRecord,
                error: 'Some stickers are still unclear.',
              }));
              return;
            }

            if (!isCubeColorBalanced(solveMap)) {
              setState((s) => ({
                ...s,
                phase: 'error',
                scannedFaceColors: scannedRecord,
                error: formatColourMismatchError(solveMap),
              }));
              return;
            }

            const facelet = buildFaceletFromMap(solveMap);
            const pose = lastPoseRef.current;
            const solveCaptures = FACELET_ORDER.map((faceId) => [...solveMap.get(faceId)!]);
            solveInputFacesRef.current = new Map(
              [...solveMap.entries()].map(([faceId, colors]) => [faceId, [...colors]]),
            );
            scanLayoutFacesRef.current = new Map(
              [...solveMap.entries()].map(([faceId, colors]) => [faceId, [...colors]]),
            );
            setState((s) => ({
              ...s,
              phase: 'computing',
              knownFaces: snapshot.knownFaces,
              scannedFaceColors: scannedRecord,
              liveScanProgress: 1,
              currentPose: pose,
            }));
            queueMicrotask(() => requestSolve(facelet, pose, solveMap, solveMap, solveCaptures));
          } catch (error) {
            setState((s) => ({
              ...s,
              phase: 'error',
              scannedFaceColors: scannedRecord,
              error: error instanceof Error ? error.message : 'Failed to build cube state',
            }));
          }
        }
        return;
      }

      setState((prev) => ({
        ...prev,
        currentPose: result.pose,
        knownFaces: snapshot.knownFaces,
        scannedFaceColors: scannedFacesForDisplay(snapshot.faces),
        currentVisibleFace: snapshot.currentFace,
        liveScanProgress: snapshot.knownFaces.length / 6,
        liveScanNeedsClearerCenter: snapshot.needsClearerCenter,
        rescanTargetFace: snapshot.rescanTarget,
        lastCapturedFace: snapshot.newlyCaptured ?? snapshot.faceUpdated ?? prev.lastCapturedFace,
        detectionFeedback: buildFeedback(
          hasPose,
          colors,
          snapshot.stableProgress,
          snapshot.stableTarget,
          captured,
          snapshot.needsNewFace,
        ),
      }));
      return;
    }

    if (phase !== 'solving') {
      setState((s) => ({
        ...s,
        currentPose: result.pose ?? null,
      }));
      return;
    }

    const solution = solutionRef.current;
    const expected =
      solution && solution.currentIndex < solution.moves.length
        ? solution.moves[solution.currentIndex]
        : null;

    syncExpectedMove(expected ?? null);

    const centerColor = result.detectedFace?.colors[4];
    const visibleFace =
      centerColor !== undefined && isKnownColor(centerColor)
        ? identifyFaceFromCenter(centerColor)
        : result.pose?.visibleFace ?? null;
    const moveFaceId = expected ? moveFace(expected) : null;
    const holdFaceId = expected ? getMoveHoldFace(expected) : null;

    const visibleFaces = result.pose
      ? getVisibleFaces(result.pose)
      : [];

    const sampledFaceIds = new Set<FaceId>([
      ...visibleFaces,
      ...(Object.keys(result.visibleFaceColors) as FaceId[]),
    ]);

    for (const faceId of sampledFaceIds) {
      const colors = result.visibleFaceColors[faceId];
      if (!colors || colors.length !== 9) continue;
      if (!recentFaceDetectionsRef.current[faceId]) {
        recentFaceDetectionsRef.current[faceId] = [];
      }
      recentFaceDetectionsRef.current[faceId]!.push([...colors]);
      if (recentFaceDetectionsRef.current[faceId]!.length > 5) {
        recentFaceDetectionsRef.current[faceId]!.shift();
      }
    }

    const stableVisibleFaceColors: Partial<Record<FaceId, StickerColor[]>> = {};
    for (const faceId of sampledFaceIds) {
      const readings = recentFaceDetectionsRef.current[faceId];
      if (!readings?.length) continue;
      const stable = majorityVoteFaceColors(readings);
      if (stable) stableVisibleFaceColors[faceId] = stable;
    }

    const turnEvalColors: Partial<Record<FaceId, StickerColor[]>> = {
      ...result.visibleFaceColors,
    };
    if (result.detectedFace?.colors?.length === 9) {
      const stickerColors = toStickerColors(result.detectedFace.colors);
      if (visibleFace) turnEvalColors[visibleFace] = stickerColors;
      if (holdFaceId) turnEvalColors[holdFaceId] = stickerColors;
      if (moveFaceId) turnEvalColors[moveFaceId] = stickerColors;
    }

    const colorEval =
      expected && faceletRef.current
        ? evaluateThreeFaceMoveProgress(
            faceletRef.current,
            expected,
            turnEvalColors,
            visibleFace,
            moveColorTrackerRef.current,
          )
        : null;

    const colorProgress = colorEval?.progress ?? 0;
    const turnActive =
      moveColorTrackerRef.current.sawPreMoveAlignment || colorProgress > 0.18;
    const scanFacelet =
      turnActive && expected && faceletRef.current
        ? applyMoveToFaceletCached(faceletRef.current, expected)
        : faceletRef.current;

    const scanFaceId =
      holdFaceId &&
      (stableVisibleFaceColors[holdFaceId] || turnEvalColors[holdFaceId])
        ? holdFaceId
        : visibleFace;
    const scanColors =
      scanFaceId &&
      (stableVisibleFaceColors[scanFaceId] ?? turnEvalColors[scanFaceId]);
    const scanMatchRaw =
      scanFaceId && scanFacelet && scanColors?.length === 9
        ? matchFaceToFacelet(scanFacelet, scanFaceId, scanColors)
        : 0;

    const recentScan = recentScanMatchRef.current;
    recentScan.push(scanMatchRaw);
    if (recentScan.length > 8) recentScan.shift();
    const sortedScan = [...recentScan].sort((a, b) => a - b);
    const medianScan = sortedScan[Math.floor(sortedScan.length / 2)] ?? 0;

    let smoothScan = scanMatchSmootherRef.current;
    if (medianScan > 0) {
      smoothScan = smoothScan * 0.55 + medianScan * 0.45;
    } else if (smoothScan > 0.35) {
      smoothScan *= 0.92;
    } else {
      smoothScan *= 0.75;
    }
    scanMatchSmootherRef.current = smoothScan;
    const scanMatch = smoothScan;
    const holdFaceAligned = Boolean(
      holdFaceId && isHoldFaceAligned(visibleFace, holdFaceId, scanMatch),
    );
    const faceMatchesMove = holdFaceAligned;

    const shapeMetrics = result.shapeMetrics;
    const rigidReposition = shapeMetrics ? isRigidCubeReposition(shapeMetrics) : false;
    const layerTurnDeform = shapeMetrics ? isLayerTurnDeformation(shapeMetrics) : false;
    const wholeCubeMotion =
      rigidReposition || Boolean(colorEval?.rejectedWholeCube);

    if (
      wholeCubeMotion &&
      rigidReposition &&
      shapeMetrics &&
      (colorProgress < 0.45 || shapeMetrics.flowMagnitude >= 0.45)
    ) {
      moveColorTrackerRef.current.orientationLocks = {};
      moveColorTrackerRef.current.sawPreMoveAlignment = false;
      moveColorTrackerRef.current.stepAnchorFace =
        holdFaceId ?? visibleFace ?? moveColorTrackerRef.current.stepAnchorFace;
      recentFaceDetectionsRef.current = {};
      colorCompleteStableRef.current = 0;
      resetSolvingStepState(solvingStepStateRef.current);
      if (result.pose) frameProcessor.current?.syncPose(result.pose);
    } else if (
      moveColorTrackerRef.current.sawPreMoveAlignment &&
      colorEval?.comparisonFace
    ) {
      delete recentFaceDetectionsRef.current[colorEval.comparisonFace];
    }

    const stepResult = evaluateSolvingFrame(solvingStepStateRef.current, {
      colorEval,
      scanMatch,
      deformationScore: shapeMetrics?.deformationScore ?? 0,
      sawPreMoveAlignment: moveColorTrackerRef.current.sawPreMoveAlignment,
      rejectedWholeCube: wholeCubeMotion,
      wrongMove: result.wrongMove,
      rigidReposition,
      layerTurnDeform,
      holdFaceAligned,
    });

    let wrongMove = result.wrongMove;
    if (
      !wrongMove &&
      expected &&
      faceletRef.current &&
      stepResult.sawShapeBreak &&
      Object.keys(turnEvalColors).length >= 2
    ) {
      wrongMove =
        detectWrongMoveFromColors(
          faceletRef.current,
          expected,
          turnEvalColors,
          visibleFace,
          true,
          moveColorTrackerRef.current,
        ) ?? null;
    }

    const poseRotationProgress = result.rotationProgress;
    const handMotionDetected = stepResult.handMotionDetected;
    const rotationProgress = wrongMove
      ? Math.min(stepResult.rotationProgress, 0.35)
      : stepResult.rotationProgress;
    colorCompleteStableRef.current = stepResult.colorCompleteStable;

    let tracking: SolvingFeedback['tracking'] = 'searching';
    if (result.pose && (visibleFaces.length >= 2 || result.detectedFace)) {
      tracking = 'locked';
      trackingLostFrames.current = 0;
    } else if (result.pose) {
      tracking = 'searching';
      trackingLostFrames.current = 0;
    } else if (Object.keys(stableVisibleFaceColors).length === 0) {
      trackingLostFrames.current++;
      tracking = trackingLostFrames.current > 12 ? 'lost' : 'searching';
    } else {
      tracking = 'searching';
    }

    const hasPose = Boolean(result.pose);

    const faceScanInfos: FaceScanInfo[] = (
      visibleFaces.length >= 3
        ? visibleFaces.slice(0, 3)
        : [
            ...visibleFaces,
            ...(['U', 'R', 'F'] as FaceId[]).filter((f) => !visibleFaces.includes(f)),
          ].slice(0, 3)
    ).map((faceId) => {
      const raw = result.visibleFaceColors[faceId];
      const stable = stableVisibleFaceColors[faceId];
      const colors = stable ?? raw;
      if (!colors || colors.length !== 9) {
        return {
          faceId,
          status: hasPose ? ('scanning' as const) : ('missing' as const),
          matchScore: 0,
        };
      }
      const matchScore = scanFacelet
        ? matchFaceToFacelet(scanFacelet, faceId, colors)
        : 0;
      const status =
        matchScore >= 0.65 ? ('locked' as const) : ('scanning' as const);
      return { faceId, status, matchScore };
    });

    if (result.pose) lastPoseRef.current = result.pose;

    const stepKey = `${expected ?? ''}:${solution?.currentIndex ?? 0}`;
    const paint = lastSolvingPaintRef.current;
    const shouldPaint =
      paint.tracking !== tracking ||
      paint.wrongMove !== wrongMove ||
      paint.holdFaceAligned !== holdFaceAligned ||
      paint.layerTurnValidated !== stepResult.layerTurnValidated ||
      paint.stepKey !== stepKey ||
      Math.abs(paint.rotationProgress - rotationProgress) >= 0.04;

    if (shouldPaint) {
      lastSolvingPaintRef.current = {
        tracking,
        wrongMove,
        rotationProgress,
        holdFaceAligned,
        layerTurnValidated: stepResult.layerTurnValidated,
        stepKey,
      };
      setState((s) => ({
        ...s,
        currentPose: result.pose ?? s.currentPose,
        solvingFeedback: {
          tracking,
          rotationProgress,
          wrongMove,
          visibleFace,
          faceMatchesMove,
          liveFaceColors: result.detectedFace?.colors
            ? toStickerColors(result.detectedFace.colors)
            : null,
          visibleFaceColors: result.visibleFaceColors,
          visibleFaces,
          stableVisibleFaceColors,
          poseRotationProgress,
          handMotionDetected,
          scanMatch,
          comparisonFace: colorEval?.comparisonFace ?? null,
          faceScanInfos,
          deformationScore: result.shapeMetrics?.deformationScore ?? 0,
          layerTurnInProgress: stepResult.layerTurnInProgress,
          sawShapeBreak: stepResult.sawShapeBreak,
          layerTurnValidated: stepResult.layerTurnValidated,
          holdFaceAligned,
        },
      }));
    }

    if (!expected) return;

    const moveComplete =
      stepResult.moveComplete && !wrongMove && Boolean(colorEval?.completed);

    if (autoPlayEnabledRef.current) {
      // Demo auto-play uses the 3s timer in SolvingMoveHint (Next / skip).
      return;
    }

    if (Date.now() - solvingStartMs.current < 400) return;
    if (Date.now() - stepReadyMs.current < 300) return;
    if (!moveComplete) return;

    if (solution) {
      applyCompletedMove(expected);
      const nextMove =
        solutionRef.current?.moves[solutionRef.current.currentIndex] ?? null;
      syncExpectedMove(nextMove);
      trackingLostFrames.current = 0;
      resetMoveColorTracker(moveColorTrackerRef.current);
      resetSolvingStepState(solvingStepStateRef.current);
      recentFaceDetectionsRef.current = {};
      stepReadyMs.current = Date.now();
    }
  }, [videoRef, applyCompletedMove, buildFeedback, requestSolve, syncExpectedMove]);

  const runLoop = useCallback(() => {
    processFrame();
    rafRef.current = requestAnimationFrame(runLoop);
  }, [processFrame]);

  const startTracking = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(runLoop);
  }, [runLoop]);

  const stopTracking = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
  }, []);

  const retryLiveScan = useCallback(() => {
    clearSolveTimeout();
    enterColorLearn();
  }, [clearSolveTimeout, enterColorLearn]);

  const retryColorLearn = useCallback(() => {
    enterColorLearn();
  }, [enterColorLearn]);

  const resetColorCalibration = useCallback(
    (options?: { preservePersistedCalibration?: boolean }) => {
      clearSolveTimeout();
      enterColorLearn(options);
    },
    [clearSolveTimeout, enterColorLearn],
  );

  const skipCurrentMove = useCallback(() => {
    const solution = solutionRef.current;
    if (!solution || solution.currentIndex >= solution.moves.length) return;
    const expected = solution.moves[solution.currentIndex];
    if (!expected) return;
    applyCompletedMove(expected);
    const nextMove =
      solutionRef.current?.moves[solutionRef.current.currentIndex] ?? null;
    const pose = lastPoseRef.current;
    if (pose) frameProcessor.current?.syncPose(pose);
    syncExpectedMove(nextMove);
    trackingLostFrames.current = 0;
    colorCompleteStableRef.current = 0;
    resetMoveColorTracker(moveColorTrackerRef.current);
    resetSolvingStepState(solvingStepStateRef.current);
    recentFaceDetectionsRef.current = {};
    scanMatchSmootherRef.current = 0;
    recentScanMatchRef.current = [];
    stepReadyMs.current = Date.now();
  }, [applyCompletedMove, syncExpectedMove]);

  const revertCurrentMove = useCallback(() => {
    const solution = solutionRef.current;
    if (!solution || solution.currentIndex <= 0) return;

    const indexToUndo = solution.currentIndex - 1;
    const moveToUndo = solution.moves[indexToUndo];
    if (!moveToUndo) return;

    const prevFacelet = faceletRef.current;
    const undoMove = inverseMove(moveToUndo);
    const nextFacelet = applyMoveToFacelet(prevFacelet, undoMove);
    const id = ++requestId.current;

    solverWorker.current?.postMessage({
      type: 'apply',
      move: undoMove,
      facelet: prevFacelet,
      id,
    });

    faceletRef.current = nextFacelet;
    solutionRef.current = { ...solution, currentIndex: indexToUndo };

    setState((prev) => {
      if (!prev.solution) return prev;
      return {
        ...prev,
        phase: 'solving',
        solution: { ...prev.solution, currentIndex: indexToUndo },
        solvingFeedback: initialSolvingFeedback,
        solvingFacelet: nextFacelet,
      };
    });

    syncExpectedMove(moveToUndo);
    const pose = lastPoseRef.current;
    if (pose) frameProcessor.current?.syncPose(pose);
    trackingLostFrames.current = 0;
    colorCompleteStableRef.current = 0;
    resetMoveColorTracker(moveColorTrackerRef.current);
    resetSolvingStepState(solvingStepStateRef.current);
    recentDetectionsRef.current = [];
    recentFaceDetectionsRef.current = {};
    scanMatchSmootherRef.current = 0;
    recentScanMatchRef.current = [];
    stepReadyMs.current = Date.now();
  }, [syncExpectedMove]);

  const syncViewportLayout = useCallback((viewportWidth: number) => {
    frameProcessor.current?.setScanGuideRatio(getGuideSizeRatio(viewportWidth));
  }, []);

  const currentMove =
    state.solution && state.solution.currentIndex < state.solution.moves.length
      ? (state.solution.moves[state.solution.currentIndex] ?? null)
      : null;

  return {
    state,
    currentMove,
    confirmColorLearn,
    startLiveScan,
    scanAgainFromSolved,
    goToScanning,
    requestRescanFace,
    retryLiveScan,
    retryColorLearn,
    resetColorCalibration,
    startTracking,
    stopTracking,
    nextCurrentMove: skipCurrentMove,
    prevCurrentMove: revertCurrentMove,
    syncViewportLayout,
    setAutoPlayEnabled,
  };
}
