const OPENCV_URL = 'https://docs.opencv.org/4.9.0/opencv.js';

let loadPromise: Promise<void> | null = null;

export function loadOpenCV(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (window.cv?.Mat) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = OPENCV_URL;
    script.async = true;
    script.onload = () => {
      const check = () => {
        if (window.cv?.Mat) {
          resolve();
        } else {
          window.cv = window.cv ?? ({} as typeof window.cv);
          window.cv.onRuntimeInitialized = () => resolve();
        }
      };
      check();
    };
    script.onerror = () => reject(new Error('Failed to load OpenCV.js'));
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function isOpenCVReady(): boolean {
  return Boolean(window.cv?.Mat);
}
