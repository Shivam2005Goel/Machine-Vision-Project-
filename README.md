# Machine Vision Rubik's Cube Solver (Make Me Cube Master)

A high-performance web application utilizing **Computer Vision (OpenCV.js)**, **WebGL/Three.js AR Overlays**, and **Kociemba's Two-Phase Algorithm** to scan, track, and solve Rubik's cubes in real time directly from your browser.

---

## 🌟 Key Features

- 📷 **Real-Time Computer Vision**: Live webcam stream processing with OpenCV.js for contour detection, quad warping, perspective calibration, and color extraction.
- 🎯 **Pose Estimation & 3D AR Guide**: Three.js augmented reality 3D arrow guidance superimposed onto the physical cube faces.
- ⚡ **Kociemba Two-Phase Solver**: Sub-second Rubik's cube optimal solver executed asynchronously in a Web Worker without blocking UI rendering.
- 🔄 **Automatic Move & Rotation Detection**: Real-time optical flow & color tracking to detect face turns and advance solving steps automatically.
- 📱 **Progressive Web App (PWA)**: Installable, responsive, and works seamlessly across desktop and mobile devices.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **3D Graphics & AR**: Three.js
- **Vision Engine**: OpenCV.js (`solvePnP`, contour extraction, adaptive thresholding)
- **Algorithm**: `cubejs` (Two-Phase Kociemba solver via Web Workers)
- **Styling**: Modern CSS with dark-mode aesthetic and glassmorphic overlays

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ (Node 20 or 22 recommended)
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/Shivam2005Goel/Machine-Vision-Project-.git

# Navigate to project directory
cd Machine-Vision-Project-

# Install dependencies
npm install
```

### Running Locally

```bash
npm run dev
```
Open `http://localhost:5173` in a modern browser and allow camera permissions.

### Production Build & Preview

```bash
npm run build
npm run preview
```

---

## 📂 Project Architecture

```
src/
├── components/       # UI overlays, camera stream, 3D AR viewport, step indicators
├── hooks/            # Custom hooks (useWebcam, useCubeApp, useConfirmKey)
├── lib/
│   ├── cube/         # Cube state representation, color validation, solver client
│   ├── vision/       # OpenCV.js detectors, color classifier, optical flow, pose smoothing
│   └── three/        # Three.js AR renderers, dynamic shaders, 3D guide arrows
├── workers/          # Web Workers running solver & solve probe asynchronously
└── types/            # TypeScript interface & OpenCV definitions
```

---

## 🌐 Deployment

### Automated GitHub Pages
The project is equipped with GitHub Actions (`.github/workflows/deploy.yml`).
1. Go to repository **Settings** > **Pages**.
2. Select **GitHub Actions** under Build and deployment Source.
3. Every push to `main` deploys automatically.

### Vercel / Netlify
Connect this repository directly to Vercel or Netlify for instantaneous one-click deployments.

---

## 📄 License

MIT License
