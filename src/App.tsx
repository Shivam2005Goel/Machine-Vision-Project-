import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppTitle } from './components/AppTitle';
import { AppPhaseBar } from './components/AppPhaseBar';
import { GuideLayer } from './components/GuideLayer';
import { CameraView } from './components/CameraView';
import { ColorLearnOverlay } from './components/ColorLearnOverlay';
import { DetectionOverlay } from './components/DetectionOverlay';
import { ScannedFacesBar } from './components/ScannedFacesBar';
import { SolvingMoveHint } from './components/SolvingMoveHint';
import { SolvingCubeAROverlay } from './components/SolvingCubeAROverlay';
import { SolvedCelebration } from './components/SolvedCelebration';
import { LoadingScreen } from './components/LoadingScreen';
import { ScanReadyOverlay } from './components/ScanReadyOverlay';
import { useCubeApp } from './hooks/useCubeApp';
import { useWebcam } from './hooks/useWebcam';
import { COLOR_HEX, COLOR_LEARN_ORDER, hasPersistedColorCalibration } from './lib/vision/colorReference';
import { faceletToFaceMap } from './lib/cube/state';
import type { FaceId, StickerColor } from './types';
import './styles/global.css';

export default function App() {
  const { videoRef, setVideoRef, state: webcamState, start: startWebcam } = useWebcam();
  const {
    state,
    currentMove,
    confirmColorLearn,
    startLiveScan,
    requestRescanFace,
    startTracking,
    stopTracking,
    nextCurrentMove,
    prevCurrentMove,
    resetColorCalibration,
    scanAgainFromSolved,
    goToScanning,
    syncViewportLayout,
    setAutoPlayEnabled,
  } = useCubeApp(videoRef);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [cameraBox, setCameraBox] = useState({ width: 0, height: 0 });

  useEffect(() => {
    void startWebcam();
  }, [startWebcam]);

  useEffect(() => {
    if (webcamState.isReady && state.phase !== 'loading') {
      startTracking();
      return stopTracking;
    }
    return undefined;
  }, [webcamState.isReady, state.phase, startTracking, stopTracking]);

  const handleDimensions = useCallback((width: number, height: number) => {
    setDimensions({ width, height });
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateSize = () => {
      setViewportSize({
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  // The camera feed shrinks (e.g. to 42% height) when the solve viewer is
  // shown, so AR overlays must track the video element box, not the viewport.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateBox = () => {
      setCameraBox({ width: video.clientWidth, height: video.clientHeight });
    };

    updateBox();
    const observer = new ResizeObserver(updateBox);
    observer.observe(video);
    return () => observer.disconnect();
  }, [videoRef, webcamState.isReady]);

  useEffect(() => {
    if (viewportSize.width > 0) {
      syncViewportLayout(viewportSize.width);
    }
  }, [viewportSize.width, syncViewportLayout]);

  const colorLearnTarget = COLOR_LEARN_ORDER[state.colorLearnIndex] ?? 'R';

  const isBooting = state.phase === 'loading' || !webcamState.isReady;
  const hasError = Boolean(state.error || webcamState.error);
  const isComputing = state.phase === 'computing';
  const isSolving = state.phase === 'solving';
  const isSolved = state.phase === 'solved';

  const totalSteps = state.solution?.moves.length ?? 0;
  const currentStep = (state.solution?.currentIndex ?? 0) + 1;
  const showScannedFaces =
    state.phase === 'liveScan' ||
    state.phase === 'computing' ||
    (hasError && Object.keys(state.scannedFaceColors).length > 0);

  const overlayWidth = cameraBox.width || viewportSize.width;
  const overlayHeight = cameraBox.height || viewportSize.height;

  const solvingFaceColors = useMemo<Partial<Record<FaceId, StickerColor[]>>>(() => {
    if (!state.solvingFacelet) return {};
    try {
      return Object.fromEntries(faceletToFaceMap(state.solvingFacelet)) as Partial<
        Record<FaceId, StickerColor[]>
      >;
    } catch {
      return {};
    }
  }, [state.solvingFacelet]);

  const canRescanFromPalette = Object.keys(state.scannedFaceColors).length > 0;

  return (
    <main className="app">
      <div
        className={`viewport${state.phase === 'liveScan' ? ' viewport--scanning' : ''}${isSolving ? ' viewport--solving' : ''}${isSolved ? ' viewport--solved' : ''}`}
        ref={viewportRef}
      >
        <CameraView setVideoRef={setVideoRef} onDimensions={handleDimensions} />
        <div className="app-header">
          <AppTitle />
          <AppPhaseBar
            phase={state.phase}
            onGoToCalibration={() => resetColorCalibration({ preservePersistedCalibration: true })}
            onGoToScanning={goToScanning}
            canReturnToScanning={hasPersistedColorCalibration()}
          />
        </div>

        {!isBooting && !hasError && (
          <>
            <GuideLayer
              phase={state.phase}
              frameWidth={dimensions.width}
              frameHeight={dimensions.height}
              viewportWidth={viewportSize.width}
              viewportHeight={viewportSize.height}
              colorLearnSpot={state.phase === 'colorLearn'}
              spotColor={COLOR_HEX[colorLearnTarget]}
            />

            <ColorLearnOverlay
              visible={state.phase === 'colorLearn'}
              stepIndex={state.colorLearnIndex}
              sample={state.colorLearnSample}
              ready={state.colorLearnReady}
              error={state.colorLearnError}
              frameWidth={dimensions.width}
              frameHeight={dimensions.height}
              viewportWidth={viewportSize.width}
              viewportHeight={viewportSize.height}
              onConfirm={confirmColorLearn}
            />

            <ScanReadyOverlay
              visible={state.phase === 'scanReady'}
              savedColors={state.colorsCalibrated}
              frameWidth={dimensions.width}
              frameHeight={dimensions.height}
              viewportWidth={viewportSize.width}
              viewportHeight={viewportSize.height}
              onStart={startLiveScan}
            />

            <ScannedFacesBar
              visible={showScannedFaces}
              scannedFaces={state.scannedFaceColors}
              interactive={state.phase === 'liveScan'}
              onRescanFace={requestRescanFace}
              rescanTargetFace={state.rescanTargetFace}
            />

            <DetectionOverlay
              feedback={state.detectionFeedback}
              visible={state.phase === 'liveScan'}
              knownFaceCount={state.knownFaces.length}
              liveScanProgress={state.liveScanProgress}
              frameWidth={dimensions.width}
              frameHeight={dimensions.height}
              viewportWidth={viewportSize.width}
              viewportHeight={viewportSize.height}
            />

            <SolvingCubeAROverlay
              active={isSolving && Boolean(currentMove)}
              pose={state.currentPose}
              move={currentMove}
              rotationProgress={state.solvingFeedback.rotationProgress}
              liveFaceColors={{}}
              scannedFaceColors={solvingFaceColors}
              frameWidth={dimensions.width}
              frameHeight={dimensions.height}
              viewportWidth={overlayWidth}
              viewportHeight={overlayHeight}
            />

            {isSolving && currentMove && (
              <SolvingMoveHint
                visible
                move={currentMove}
                facelet={state.solvingFacelet}
                moves={state.solution?.moves ?? []}
                currentIndex={state.solution?.currentIndex ?? 0}
                wrongMove={state.solvingFeedback.wrongMove}
                currentStep={currentStep}
                totalSteps={totalSteps}
                viewportWidth={viewportSize.width}
                viewportHeight={viewportSize.height}
                autoPlaySessionKey={state.solutionSessionKey}
                onAutoPlayChange={setAutoPlayEnabled}
                onNext={nextCurrentMove}
                onPrev={prevCurrentMove}
                canGoPrev={(state.solution?.currentIndex ?? 0) > 0}
              />
            )}

            {isSolved && (
              <SolvedCelebration visible onScanAgain={scanAgainFromSolved} />
            )}
          </>
        )}

        {isComputing && (
          <>
            <ScannedFacesBar
              visible={showScannedFaces}
              scannedFaces={state.scannedFaceColors}
            />
            <LoadingScreen overlay message="Computing…" />
          </>
        )}

        {isBooting && (
          <LoadingScreen
            overlay
            message={state.phase === 'loading' ? 'Loading…' : 'Camera…'}
          />
        )}

        {hasError && !isBooting && (
          <div className={`error-screen overlay${canRescanFromPalette ? ' error-screen--rescan' : ''}`}>
            {canRescanFromPalette && (
              <ScannedFacesBar
                visible={showScannedFaces}
                scannedFaces={state.scannedFaceColors}
                interactive
                onRescanFace={requestRescanFace}
              />
            )}
            <div className="error-screen-body">
              <p className="error-message">{state.error ?? webcamState.error}</p>
              {!canRescanFromPalette && (
                <div className="error-actions">
                  <button type="button" className="error-button primary" onClick={() => resetColorCalibration()}>
                    Re-calibrate colours
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
