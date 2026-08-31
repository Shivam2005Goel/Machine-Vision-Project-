import { useMemo } from 'react';
import type { AppPhase } from '../types';
import {
  getGuideOverlayRect,
  getWhiteSpotOverlayRect,
} from '../lib/vision/guideOverlay';
import { GuideOverlay } from './GuideOverlay';

interface GuideLayerProps {
  phase: AppPhase;
  frameWidth: number;
  frameHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  colorLearnSpot?: boolean;
  spotColor?: string;
}

function useGuideRects(
  phase: AppPhase,
  frameWidth: number,
  frameHeight: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  return useMemo(() => {
    const guideRect = getGuideOverlayRect(frameWidth, frameHeight, viewportWidth, viewportHeight);
    return {
      guideRect,
      spotRect: getWhiteSpotOverlayRect(frameWidth, frameHeight, viewportWidth, viewportHeight),
    };
  }, [phase, frameWidth, frameHeight, viewportWidth, viewportHeight]);
}

function shouldShowGuide(phase: AppPhase): boolean {
  return phase === 'colorLearn' || phase === 'scanReady' || phase === 'liveScan';
}

export function GuideLayer({
  phase,
  frameWidth,
  frameHeight,
  viewportWidth,
  viewportHeight,
  colorLearnSpot = false,
  spotColor = '#ffffff',
}: GuideLayerProps) {
  const { guideRect, spotRect } = useGuideRects(
    phase,
    frameWidth,
    frameHeight,
    viewportWidth,
    viewportHeight,
  );

  return (
    <GuideOverlay
      rect={guideRect}
      viewportWidth={viewportWidth}
      viewportHeight={viewportHeight}
      visible={shouldShowGuide(phase)}
      showSpot={colorLearnSpot}
      spotRect={spotRect}
      spotColor={spotColor}
    />
  );
}
