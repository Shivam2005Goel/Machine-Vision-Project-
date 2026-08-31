import { useCallback } from 'react';

interface CameraViewProps {
  setVideoRef: (node: HTMLVideoElement | null) => void;
  onDimensions?: (width: number, height: number) => void;
}

export function CameraView({ setVideoRef, onDimensions }: CameraViewProps) {
  const handleLoadedMetadata = useCallback(
    (video: HTMLVideoElement) => {
      if (video.videoWidth && video.videoHeight) {
        onDimensions?.(video.videoWidth, video.videoHeight);
      }
    },
    [onDimensions],
  );

  const handleRef = useCallback(
    (node: HTMLVideoElement | null) => {
      setVideoRef(node);
      if (node && node.readyState >= 1) {
        handleLoadedMetadata(node);
      }
    },
    [setVideoRef, handleLoadedMetadata],
  );

  return (
    <video
      ref={handleRef}
      className="camera-feed"
      playsInline
      muted
      autoPlay
      onLoadedMetadata={(e) => handleLoadedMetadata(e.currentTarget)}
    />
  );
}
