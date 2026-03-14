import { useMemo, useRef, useEffect, useCallback } from 'react';
import PixelGrid, { type ColorMode } from './PixelGrid';
import keeperData from '@/images/keeper.pxl.json';
import keeperWeatheredData from '@/images/keeper-weathered.pxl.json';

/**
 * 128×128 pixel-art portrait of the Keeper, loaded from palette-indexed
 * .pxl.json files.
 *
 * Variants:
 *   - `default`    — clean, vibrant solarpunk robot
 *   - `weathered`  — aged, worn-down, serious
 *
 * To regenerate:
 *   node scripts/export-pixel-art.mjs
 *   node scripts/export-keeper-weathered.mjs
 */

interface PxlData {
  size: number;
  palette: number[][];
  pixels: string;
}

function decodePixelArt(data: PxlData, greenscale = false): Uint8Array {
  const { size, palette, pixels } = data;
  const indices = Uint8Array.from(atob(pixels), (c) => c.charCodeAt(0));
  const rgb = new Uint8Array(size * size * 3);

  for (let i = 0; i < size * size; i++) {
    const color = palette[indices[i]!]!;
    const oi = i * 3;

    if (greenscale) {
      // Luminance → desaturated accent green
      const lum = (0.299 * color[0]! + 0.587 * color[1]! + 0.114 * color[2]!) / 255;
      const grey = lum * 255;
      // Blend 35% accent green (0,230,118) with 65% grey
      rgb[oi] = Math.round(grey * 0.65);
      rgb[oi + 1] = Math.round(grey * 0.65 + lum * 230 * 0.35);
      rgb[oi + 2] = Math.round(grey * 0.65 + lum * 118 * 0.35);
    } else {
      rgb[oi] = color[0]!;
      rgb[oi + 1] = color[1]!;
      rgb[oi + 2] = color[2]!;
    }
  }

  return rgb;
}

const VARIANTS = {
  default: keeperData as PxlData,
  weathered: keeperWeatheredData as PxlData,
};

export type KeeperVariant = keyof typeof VARIANTS;

// Eye center and antenna tip coordinates (128×128 grid)
const EYE_CX = 64;
const EYE_CY = 48;
const EYE_R = 14;
const ANTENNA_X1 = 62;
const ANTENNA_X2 = 63;
const ANTENNA_Y = 4;

interface KeeperPixelAvatarProps {
  /** Which variant to render (default: 'default') */
  variant?: KeeperVariant;
  /** CSS pixel multiplier (default 3 → 384px) */
  scale?: number;
  className?: string;
  /** Show grid lines (default false) */
  gridLines?: boolean;
  /** Render as green phosphor monochrome (default true) */
  greenscale?: boolean;
  /** Enable subtle animation — eye pulse, scanline, antenna blink (default false) */
  animate?: boolean;
}

export default function KeeperPixelAvatar({
  variant = 'default',
  scale = 3,
  className = '',
  gridLines = false,
  greenscale = true,
  animate = false,
}: KeeperPixelAvatarProps) {
  const data = VARIANTS[variant];
  const basePixels = useMemo(() => decodePixelArt(data, greenscale), [data, greenscale]);

  // Static render — no animation
  if (!animate) {
    return (
      <PixelGrid
        pixels={basePixels}
        size={data.size}
        mode={'rgb' as ColorMode}
        scale={scale}
        className={className}
        gridLines={gridLines}
      />
    );
  }

  // Animated render — own canvas + rAF loop
  return (
    <AnimatedCanvas
      basePixels={basePixels}
      size={data.size}
      scale={scale}
      className={className}
      gridLines={gridLines}
    />
  );
}

interface AnimatedCanvasProps {
  basePixels: Uint8Array;
  size: number;
  scale: number;
  className: string;
  gridLines: boolean;
}

function AnimatedCanvas({ basePixels, size, scale, className, gridLines }: AnimatedCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const frameRef = useRef(new Uint8Array(size * size * 3));

  const drawFrame = useCallback(
    (t: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const dpr = window.devicePixelRatio || 1;
      const bufW = size * scale * dpr;
      const bufH = size * scale * dpr;

      if (canvas.width !== bufW || canvas.height !== bufH) {
        canvas.width = bufW;
        canvas.height = bufH;
      }

      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;

      const frame = frameRef.current;
      frame.set(basePixels);

      // ── Eye glow pulse — slow sine wave brightness ──
      const pulse = Math.sin(t * 0.0015) * 0.12 + Math.sin(t * 0.004) * 0.05;
      for (let dy = -EYE_R; dy <= EYE_R; dy++) {
        for (let dx = -EYE_R; dx <= EYE_R; dx++) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > EYE_R) continue;
          const px = EYE_CX + dx;
          const py = EYE_CY + dy;
          if (px < 0 || px >= size || py < 0 || py >= size) continue;

          const falloff = 1 - dist / EYE_R;
          const boost = pulse * falloff * falloff;
          const oi = (py * size + px) * 3;
          frame[oi] = Math.min(255, Math.round(frame[oi]! + boost * 60));
          frame[oi + 1] = Math.min(255, Math.round(frame[oi + 1]! + boost * 120));
          frame[oi + 2] = Math.min(255, Math.round(frame[oi + 2]! + boost * 55));
        }
      }

      // ── Scanline sweep — faint horizontal band moving down ──
      const scanPeriod = 8000; // ms per full sweep
      const scanY = ((t % scanPeriod) / scanPeriod) * size;
      const scanWidth = 3;
      for (let row = Math.floor(scanY); row < Math.floor(scanY) + scanWidth; row++) {
        const ry = row % size;
        const proximity = 1 - Math.abs(row - scanY) / scanWidth;
        const intensity = proximity * 0.06;
        for (let x = 0; x < size; x++) {
          const oi = (ry * size + x) * 3;
          frame[oi] = Math.min(255, Math.round(frame[oi]! + intensity * 40));
          frame[oi + 1] = Math.min(255, Math.round(frame[oi + 1]! + intensity * 80));
          frame[oi + 2] = Math.min(255, Math.round(frame[oi + 2]! + intensity * 40));
        }
      }

      // ── Antenna tip blink — intermittent soft flash ──
      const blinkCycle = (t % 3000) / 3000; // 3s cycle
      const blinkOn = blinkCycle < 0.15 || (blinkCycle > 0.25 && blinkCycle < 0.35);
      if (blinkOn) {
        const blinkBright = Math.sin(blinkCycle * Math.PI * 10) * 0.5 + 0.5;
        for (let ax = ANTENNA_X1; ax <= ANTENNA_X2; ax++) {
          const oi = (ANTENNA_Y * size + ax) * 3;
          frame[oi] = Math.min(255, Math.round(frame[oi]! + blinkBright * 30));
          frame[oi + 1] = Math.min(255, Math.round(frame[oi + 1]! + blinkBright * 100));
          frame[oi + 2] = Math.min(255, Math.round(frame[oi + 2]! + blinkBright * 50));
        }
      }

      // ── Render to canvas ──
      const img = ctx.createImageData(size, size);
      const d = img.data;
      for (let i = 0; i < size * size; i++) {
        const si = i * 3;
        const di = i * 4;
        d[di] = frame[si]!;
        d[di + 1] = frame[si + 1]!;
        d[di + 2] = frame[si + 2]!;
        d[di + 3] = 255;
      }

      const tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = size;
      tmpCanvas.height = size;
      const tmpCtx = tmpCanvas.getContext('2d')!;
      tmpCtx.putImageData(img, 0, 0);

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmpCanvas, 0, 0, bufW, bufH);

      // Grid lines
      if (gridLines) {
        const cellW = bufW / size;
        const cellH = bufH / size;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = Math.max(1, dpr * 0.5);
        for (let x = 1; x < size; x++) {
          const px = Math.round(x * cellW);
          ctx.beginPath();
          ctx.moveTo(px, 0);
          ctx.lineTo(px, bufH);
          ctx.stroke();
        }
        for (let y = 1; y < size; y++) {
          const py = Math.round(y * cellH);
          ctx.beginPath();
          ctx.moveTo(0, py);
          ctx.lineTo(bufW, py);
          ctx.stroke();
        }
      }

      rafRef.current = requestAnimationFrame(drawFrame);
    },
    [basePixels, size, scale, gridLines],
  );

  useEffect(() => {
    rafRef.current = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [drawFrame]);

  const cssSize = size * scale;

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        ...(!className.includes('w-') && !className.includes('h-')
          ? { width: cssSize, height: cssSize }
          : {}),
        imageRendering: 'pixelated',
        borderRadius: 'var(--radius)',
      }}
    />
  );
}
