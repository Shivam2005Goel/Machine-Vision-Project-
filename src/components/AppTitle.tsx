import { APP_VERSION } from '../lib/appVersion';

export function AppTitle() {
  return (
    <header className="app-title" aria-label="Application title">
      <p className="app-title-name">
        Cube Master <span className="app-title-version">v{APP_VERSION}</span>
      </p>
    </header>
  );
}
