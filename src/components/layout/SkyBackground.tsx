import { useEffect, useRef } from 'react';

interface CloudPuff {
  ox: number; // offset from cloud center
  oy: number;
  r: number;  // radius
}

interface Cloud {
  x: number;
  y: number;
  scale: number;
  opacity: number;
  speed: number; // drift multiplier
  puffs: CloudPuff[];
}

function getCssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function getCssNum(name: string, fallback: number): number {
  const v = getCssVar(name, '');
  return v ? parseFloat(v) : fallback;
}

function createPuffs(): CloudPuff[] {
  const count = 5 + Math.floor(Math.random() * 6); // 5-10 puffs
  const puffs: CloudPuff[] = [];
  for (let i = 0; i < count; i++) {
    puffs.push({
      ox: (Math.random() - 0.5) * 140,
      oy: (Math.random() - 0.5) * 50,
      r: 40 + Math.random() * 70,
    });
  }
  return puffs;
}

function createClouds(w: number, h: number): Cloud[] {
  const clouds: Cloud[] = [];

  // Background layer — smaller, slower, more transparent
  for (let i = 0; i < 6; i++) {
    clouds.push({
      x: Math.random() * (w + 400) - 200,
      y: h * 0.1 + Math.random() * h * 0.35,
      scale: 0.4 + Math.random() * 0.4,
      opacity: 0.3 + Math.random() * 0.2,
      speed: 0.3 + Math.random() * 0.3,
      puffs: createPuffs(),
    });
  }

  // Foreground layer — larger, faster, more opaque
  for (let i = 0; i < 5; i++) {
    clouds.push({
      x: Math.random() * (w + 400) - 200,
      y: h * 0.15 + Math.random() * h * 0.45,
      scale: 0.7 + Math.random() * 0.6,
      opacity: 0.5 + Math.random() * 0.4,
      speed: 0.6 + Math.random() * 0.5,
      puffs: createPuffs(),
    });
  }

  return clouds;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export default function SkyBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cloudsRef = useRef<Cloud[]>([]);
  const rafRef = useRef<number>(0);
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = window.innerWidth;
    let h = window.innerHeight;

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = w;
      canvas!.height = h;
      cloudsRef.current = createClouds(w, h);
    }

    resize();
    window.addEventListener('resize', resize);

    let lastTime = 0;

    function draw(time: number) {
      const dt = lastTime ? (time - lastTime) / 1000 : 0;
      lastTime = time;

      const skyTop = getCssVar('--sky-top', '#4a90d9');
      const skyBottom = getCssVar('--sky-bottom', '#87ceeb');
      const cloudColor = getCssVar('--cloud-color', '#ffffff');
      const cloudOpacity = getCssNum('--cloud-opacity', 0.9);
      const speed = getCssNum('--cloud-speed', 1);
      const [cr, cg, cb] = hexToRgb(cloudColor);

      // Sky gradient
      const grad = ctx!.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, skyTop);
      grad.addColorStop(1, skyBottom);
      ctx!.fillStyle = grad;
      ctx!.fillRect(0, 0, w, h);

      // Clouds
      for (const cloud of cloudsRef.current) {
        // Drift
        if (!reducedMotion) {
          cloud.x += cloud.speed * speed * dt * 12;
          // Wrap around
          const cloudWidth = cloud.scale * 120;
          if (cloud.x > w + cloudWidth) cloud.x = -cloudWidth;
        }

        const alpha = cloud.opacity * cloudOpacity;
        ctx!.save();
        ctx!.translate(cloud.x, cloud.y);
        ctx!.scale(cloud.scale, cloud.scale);

        for (const puff of cloud.puffs) {
          const grad = ctx!.createRadialGradient(
            puff.ox, puff.oy, 0,
            puff.ox, puff.oy, puff.r,
          );
          grad.addColorStop(0, `rgba(${cr},${cg},${cb},${alpha})`);
          grad.addColorStop(0.4, `rgba(${cr},${cg},${cb},${alpha * 0.6})`);
          grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
          ctx!.beginPath();
          ctx!.arc(puff.ox, puff.oy, puff.r, 0, Math.PI * 2);
          ctx!.fillStyle = grad;
          ctx!.fill();
        }

        ctx!.restore();
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
