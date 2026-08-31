import { useCallback, useEffect, useRef, useState } from 'react';

export interface WebcamState {
  stream: MediaStream | null;
  error: string | null;
  isReady: boolean;
}

export function useWebcam() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<WebcamState>({
    stream: null,
    error: null,
    isReady: false,
  });

  const attachStreamToVideo = useCallback(async (video: HTMLVideoElement) => {
    const stream = streamRef.current;
    if (!stream || video.srcObject === stream) return;

    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      // autoplay policy — muted video should still work
    }
  }, []);

  const setVideoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node;
      if (node) void attachStreamToVideo(node);
    },
    [attachStreamToVideo],
  );

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'user' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 60 },
        },
        audio: false,
      });

      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        await attachStreamToVideo(video);
      }

      setState({ stream, error: null, isReady: true });
    } catch (error) {
      streamRef.current = null;
      setState({
        stream: null,
        error: error instanceof Error ? error.message : 'Camera access failed',
        isReady: false,
      });
    }
  }, [attachStreamToVideo]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState({ stream: null, error: null, isReady: false });
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { videoRef, setVideoRef, state, start, stop };
}
