import { APP_VERSION } from '../lib/appVersion';

interface LoadingScreenProps {
  message?: string;
  overlay?: boolean;
}

export function LoadingScreen({ message = 'Loading…', overlay = false }: LoadingScreenProps) {
  return (
    <div className={`loading-screen${overlay ? ' overlay' : ''}`}>
      <div className="loading-spinner" />
      <p>{message}</p>
      <p className="loading-screen-version">v{APP_VERSION}</p>
    </div>
  );
}
