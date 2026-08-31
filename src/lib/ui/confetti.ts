interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  spin: number;
  color: string;
  life: number;
  maxLife: number;
}

const CONFETTI_COLORS = [
  '#ff4d6d',
  '#ffd166',
  '#06d6a0',
  '#4cc9f0',
  '#9b5de5',
  '#f72585',
  '#ffffff',
];

function randomColor(): string {
  return CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]!;
}

function spawnBurst(
  particles: ConfettiParticle[],
  originX: number,
  originY: number,
  count: number,
): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 10;
    particles.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 6 - Math.random() * 4,
      w: 6 + Math.random() * 8,
      h: 4 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.35,
      color: randomColor(),
      life: 0,
      maxLife: 90 + Math.random() * 70,
    });
  }
}

const MAX_PARTICLES = 120;
const CONFETTI_DPR_CAP = 1.5;

/** Canvas confetti bursts. Returns cleanup. */
export function runConfetti(
  canvas: HTMLCanvasElement,
  options: { durationMs?: number; continuous?: boolean } = {},
): () => void {
  const continuous = options.continuous ?? false;
  const durationMs = options.durationMs ?? 5000;
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => undefined;

  let width = 0;
  let height = 0;
  let rafId = 0;
  let disposed = false;
  const particles: ConfettiParticle[] = [];
  const startMs = performance.now();
  let nextBurstMs = 0;
  let burstIndex = 0;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    const dpr = Math.min(devicePixelRatio, CONFETTI_DPR_CAP);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const burst = () => {
    if (particles.length >= MAX_PARTICLES) return;
    const cx = width * (0.25 + Math.random() * 0.5);
    const cy = height * (0.2 + Math.random() * 0.25);
    spawnBurst(particles, cx, cy, 28 + Math.floor(Math.random() * 14));
    spawnBurst(particles, width * 0.5, height * 0.35, 18);
  };

  const tick = (now: number) => {
    if (disposed) return;

    const elapsed = now - startMs;
    if (!continuous && elapsed >= durationMs && particles.length === 0) {
      ctx.clearRect(0, 0, width, height);
      return;
    }

    if (continuous) {
      if (now >= nextBurstMs) {
        burst();
        nextBurstMs = now + 650 + Math.random() * 450;
      }
    } else if (elapsed < durationMs && now >= nextBurstMs) {
      burst();
      burstIndex++;
      nextBurstMs = now + (burstIndex < 3 ? 380 + Math.random() * 220 : 1100);
    }

    ctx.clearRect(0, 0, width, height);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!;
      p.life++;
      p.vy += 0.22;
      p.vx *= 0.992;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.spin;

      if (p.life > p.maxLife || p.y > height + 40) {
        particles.splice(i, 1);
        continue;
      }

      const alpha = Math.min(1, (p.maxLife - p.life) / 30);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }

    if (continuous || elapsed < durationMs || particles.length > 0) {
      rafId = requestAnimationFrame(tick);
    }
  };

  resize();
  const startDelay = window.setTimeout(() => {
    if (disposed) return;
    burst();
    burstIndex = 1;
    nextBurstMs = performance.now() + 400;
    rafId = requestAnimationFrame(tick);
  }, 120);

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  return () => {
    disposed = true;
    clearTimeout(startDelay);
    cancelAnimationFrame(rafId);
    ro.disconnect();
    ctx.clearRect(0, 0, width, height);
  };
}
