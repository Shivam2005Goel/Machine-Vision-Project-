# Make Me Cube Master

**Version: v1.14.3** · [Live app](https://wooramsol.github.io/makemecubemaster/)

웹캠으로 실제 루빅큐브를 비추면 AI가 큐브를 실시간으로 인식하고, 다음으로 돌려야 할 면에 AR 화살표를 고정하여 표시하는 웹 애플리케이션입니다. 별도 앱 설치 없이 최신 브라우저에서 실행됩니다.

## 기술 스택

- **React + TypeScript + Vite** — UI 및 앱 구조
- **Three.js** — 큐브 표면 AR 화살표 오버레이
- **OpenCV.js** — 큐브 검출, Perspective Warp, Pose 추정 (solvePnP)
- **cubejs (Kociemba)** — 두 단계 해법 계산 (Web Worker)
- **requestAnimationFrame** — 60FPS 비전·렌더 루프

## 주요 기능

| 기능 | 설명 |
|------|------|
| 웹캠 연결 | `getUserMedia`로 실시간 영상 표시 |
| 큐브 인식 | OpenCV 윤곽선 검출 + 4점 Pose 추적 |
| 큐브 상태 인식 | 6면 순차 스캔 후 내부 상태 생성, 이후 Pose로 유지 |
| Kociemba 솔버 | Web Worker에서 해법 계산, 한 단계씩 안내 |
| AR 화살표 | Three.js로 큐브 면에 고정된 반투명 화살표 |
| 자동 진행 | 90° 회전 감지 시 다음 단계로 자동 전환 |

## 배포 (GitHub Pages)

`main` 브랜치에 push하면 GitHub Actions(`.github/workflows/deploy.yml`)가 빌드 후 GitHub Pages에 배포합니다.

```bash
npm run deploy   # 수동 배포 (동일 결과)
```

**라이브 URL:** https://wooramsol.github.io/makemecubemaster/

### 최초 1회 설정 (필수)

GitHub Pages가 아직 활성화되지 않은 경우, 아래 한 번만 설정하면 됩니다.

1. https://github.com/wooramsol/makemecubemaster/settings/pages 열기
2. **Build and deployment** → **Source** → **GitHub Actions** 선택
3. `main`에 push되면 `.github/workflows/deploy.yml`이 빌드 후 바로 배포합니다 (`actions/deploy-pages`)

> 예전에 **Deploy from a branch** (`gh-pages`)로 설정했다면 **GitHub Actions**로 바꿔 주세요. `gh-pages` 브랜치용 빨간 `pages build and deployment` 실패 알림이 사라집니다.

> 카메라 접근을 위해 HTTPS 환경이 필요합니다. GitHub Pages는 HTTPS를 기본 제공합니다.

## PWA (모바일)

홈 화면에 추가하면 앱처럼 실행할 수 있습니다. Service Worker가 정적 자산과 OpenCV.js를 캐시합니다.

## 시작하기

```bash
npm install
npm run dev
```

브라우저에서 `https://localhost:5173` (또는 표시된 URL)을 열고, HTTPS 또는 localhost 환경에서 카메라 권한을 허용하세요.

```bash
npm run build
npm run preview
```

## 사용 방법

1. **큐브 스캔 시작** 버튼을 누릅니다.
2. 안내에 따라 6면(흰·초록·빨강·파랑·주황·노랑)을 순서대로 카메라에 비춥니다.
3. 각 면을 중앙에 맞추고 잠시 유지하면 자동으로 색상이 기록됩니다.
4. 스캔이 끝나면 Kociemba 솔버가 해법을 계산합니다.
5. 큐브 표면의 AR 화살표를 따라 회전하면, 올바른 회전이 감지될 때 자동으로 다음 단계로 넘어갑니다.

## 프로젝트 구조

```
src/
├── components/       # UI 컴포넌트 (카메라, AR, 단계 표시)
├── hooks/            # useWebcam, useCubeApp
├── lib/
│   ├── cube/         # 색상·상태·솔버 클라이언트
│   ├── vision/       # OpenCV 검출·분류·Pose·회전 감지
│   └── three/        # Three.js AR 렌더러
├── workers/          # Kociemba 솔버 Web Worker
└── types/            # TypeScript 타입 정의
```

## 모바일 / PWA

뷰포트·safe-area 대응 CSS가 적용되어 있으며, 향후 `manifest.json`과 Service Worker를 추가하면 PWA로 배포할 수 있습니다.

## 라이선스

MIT
