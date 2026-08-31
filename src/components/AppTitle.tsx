import { APP_VERSION } from '../lib/appVersion';

export function AppTitle() {
  return (
    <header className="app-title" aria-label="Application title">
      <p className="app-title-name">
        MakeMeCubeMaster <span className="app-title-version">v{APP_VERSION}</span>
      </p>
      <p className="app-title-credit">Created by @wooramsol</p>
    </header>
  );
}
