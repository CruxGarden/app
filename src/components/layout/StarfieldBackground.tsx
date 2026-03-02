import { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  size: number;
  baseAlpha: number;
  twinkleSpeed: number;
  twinkleOffset: number;
  driftX: number;
  driftY: number;
}

function getCssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function getCssNum(name: string, fallback: number): number {
  const v = getCssVar(name, '');
  return v ? parseFloat(v) : fallback;
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

function createStars(count: number, w: number, h: number): Star[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    size: 0.5 + Math.random() * 2,
    baseAlpha: 0.3 + Math.random() * 0.7,
    twinkleSpeed: 0.1 + Math.random() * 0.5,
    twinkleOffset: Math.random() * Math.PI * 2,
    driftX: (Math.random() - 0.5) * 0.15,
    driftY: (Math.random() - 0.5) * 0.1,
  }));
}

export default function StarfieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
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
      const density = getCssNum('--star-density', 150);
      starsRef.current = createStars(density, w, h);
    }

    resize();
    window.addEventListener('resize', resize);

    let lastTime = 0;

    function draw(time: number) {
      const dt = lastTime ? (time - lastTime) / 1000 : 0;
      lastTime = time;

      const opacity = getCssNum('--star-opacity', 0.8);
      const speed = getCssNum('--star-speed', 1);
      const color = getCssVar('--star-color', '#e0e7ff');
      const [r, g, b] = hexToRgb(color);

      ctx!.clearRect(0, 0, w, h);

      for (const star of starsRef.current) {
        // Drift
        if (!reducedMotion) {
          star.x += star.driftX * speed * dt * 10;
          star.y += star.driftY * speed * dt * 10;

          // Wrap around
          if (star.x < -5) star.x = w + 5;
          if (star.x > w + 5) star.x = -5;
          if (star.y < -5) star.y = h + 5;
          if (star.y > h + 5) star.y = -5;
        }

        // Twinkle
        const twinkle = reducedMotion
          ? 1
          : 0.5 + 0.5 * Math.sin(time * 0.0004 * star.twinkleSpeed + star.twinkleOffset);
        const alpha = star.baseAlpha * twinkle * opacity;

        ctx!.beginPath();
        ctx!.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx!.fill();
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
