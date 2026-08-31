import type { FaceScanInfo, SolvingTrackingStatus } from '../types';

interface SolvingFaceStatusPanelProps {
  visible: boolean;
  tracking: SolvingTrackingStatus;
  faceScanInfos: FaceScanInfo[];
  onSkip?: () => void;
}

function statusLabel(status: FaceScanInfo['status']): string {
  if (status === 'locked') return 'Locked';
  if (status === 'scanning') return 'Scanning';
  return 'Missing';
}

export function SolvingFaceStatusPanel({
  visible,
  tracking,
  faceScanInfos,
  onSkip,
}: SolvingFaceStatusPanelProps) {
  if (!visible) return null;

  const lockedCount = faceScanInfos.filter((f) => f.status === 'locked').length;
  const scanningCount = faceScanInfos.filter((f) => f.status === 'scanning').length;
  const total = 3;

  const overallClass =
    lockedCount >= 3
      ? 'solving-face-status--all-locked'
      : tracking === 'lost'
        ? 'solving-face-status--lost'
        : lockedCount >= 2
          ? 'solving-face-status--partial'
          : 'solving-face-status--searching';

  return (
    <div className={`solving-face-status ${overallClass}`} aria-live="polite">
      <div className="solving-face-status-header">
        <span className="solving-face-status-title">3-face tracking</span>
        <span className="solving-face-status-summary">
          {lockedCount}/{total} recognized
          {scanningCount > 0 ? ` · ${scanningCount} scanning` : ''}
          {tracking === 'lost' ? ' · center the cube in frame' : ''}
        </span>
        {onSkip && (
          <button type="button" className="solving-face-status-skip" onClick={onSkip}>
            Skip
          </button>
        )}
      </div>

      <div className="solving-face-status-chips">
        {faceScanInfos.map((info) => (
          <div
            key={info.faceId}
            className={`solving-face-chip solving-face-chip--${info.status}`}
          >
            <span className="solving-face-chip-id">{info.faceId}</span>
            <span className="solving-face-chip-state">{statusLabel(info.status)}</span>
            {info.status !== 'missing' && (
              <span className="solving-face-chip-score">
                {Math.round(info.matchScore * 100)}%
              </span>
            )}
            <div
              className="solving-face-chip-bar"
              style={{ '--match': `${Math.round(info.matchScore * 100)}%` } as React.CSSProperties}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
