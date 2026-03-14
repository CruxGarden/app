import { useRef, useEffect, useMemo } from 'react';

/**
 * Configurable pixel grid rendered on a <canvas>, styled like an LCD panel.
 *
 * Data format:
 *   - `pixels` is a flat Uint8Array (or number[]) — row-major.
 *     Mono: length = size², RGB: size²×3, RGBA: size²×4.
 *   - Or pass a 2-D array (number[][]) and it will be flattened.
 *
 * Colour modes:
 *   - `mono`  — single colour LCD (default: green-on-dark)
 *   - `rgb`   — full-colour (RGB triples)
 *   - `rgba`  — full-colour with alpha
 */

export type ColorMode = 'mono' | 'rgb' | 'rgba';

export interface PixelGridProps {
  /** Pixel data — flat array or 2-D rows */
  pixels: number[] | Uint8Array | number[][];
  /** Grid resolution (default 64) */
  size?: number;
  /** Colour mode */
  mode?: ColorMode;
  /** Mono-mode foreground colour as [r, g, b] (default: accent green) */
  color?: [number, number, number];
  /** Mono-mode background colour as [r, g, b] (default: near-black) */
  bgColor?: [number, number, number];
  /** CSS pixel multiplier per grid cell (default 4 → 256px for 64-grid) */
  scale?: number;
  /** Extra className on the wrapper */
  className?: string;
  /** Show subtle grid lines between pixels */
  gridLines?: boolean;
  /** Grid line opacity 0-1 (default 0.08) */
  gridOpacity?: number;
}

function flatten(input: number[] | Uint8Array | number[][]): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (Array.isArray(input) && Array.isArray(input[0])) {
    const flat = (input as number[][]).flat();
    return Uint8Array.from(flat);
  }
  return Uint8Array.from(input as number[]);
}

export default function PixelGrid({
  pixels,
  size = 64,
  mode = 'mono',
  color = [0, 230, 118],
  bgColor = [10, 12, 10],
  scale = 4,
  className = '',
  gridLines = true,
  gridOpacity = 0.08,
}: PixelGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const data = useMemo(() => flatten(pixels), [pixels]);

  const cssSize = size * scale;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const bufW = size * scale * dpr;
    const bufH = size * scale * dpr;
    canvas.width = bufW;
    canvas.height = bufH;

    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    const img = ctx.createImageData(size, size);
    const d = img.data;

    for (let i = 0; i < size * size; i++) {
      const di = i * 4;

      if (mode === 'mono') {
        const v = data[i] ?? 0;
        const t = v / 255;
        d[di] = bgColor[0] + (color[0] - bgColor[0]) * t;
        d[di + 1] = bgColor[1] + (color[1] - bgColor[1]) * t;
        d[di + 2] = bgColor[2] + (color[2] - bgColor[2]) * t;
        d[di + 3] = 255;
      } else if (mode === 'rgb') {
        const si = i * 3;
        d[di] = data[si] ?? 0;
        d[di + 1] = data[si + 1] ?? 0;
        d[di + 2] = data[si + 2] ?? 0;
        d[di + 3] = 255;
      } else {
        const si = i * 4;
        d[di] = data[si] ?? 0;
        d[di + 1] = data[si + 1] ?? 0;
        d[di + 2] = data[si + 2] ?? 0;
        d[di + 3] = data[si + 3] ?? 255;
      }
    }

    // Put tiny image then scale up with nearest-neighbor
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = size;
    tmpCanvas.height = size;
    const tmpCtx = tmpCanvas.getContext('2d')!;
    tmpCtx.putImageData(img, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmpCanvas, 0, 0, bufW, bufH);

    // Optional grid lines
    if (gridLines) {
      const cellW = bufW / size;
      const cellH = bufH / size;
      ctx.strokeStyle = `rgba(255, 255, 255, ${gridOpacity})`;
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
  }, [data, mode, color, bgColor, size, scale, gridLines, gridOpacity]);

  return (
    <canvas
      ref={canvasRef}
      width={size * scale}
      height={size * scale}
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

// ── Helpers ──────────────────────────────────────────────

/** Create an empty (black) pixel buffer */
export function createPixelBuffer(size = 64, mode: ColorMode = 'mono'): Uint8Array {
  const channels = mode === 'mono' ? 1 : mode === 'rgb' ? 3 : 4;
  return new Uint8Array(size * size * channels);
}

/** Set a single pixel in a mono buffer */
export function setPixel(buf: Uint8Array, size: number, x: number, y: number, value: number) {
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  buf[y * size + x] = value;
}

/** Draw a filled rectangle into a mono buffer */
export function fillRect(
  buf: Uint8Array,
  size: number,
  x: number,
  y: number,
  w: number,
  h: number,
  value: number,
) {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      setPixel(buf, size, x + dx, y + dy, value);
}

/** Draw a filled circle into a mono buffer */
export function fillCircle(
  buf: Uint8Array,
  size: number,
  cx: number,
  cy: number,
  r: number,
  value: number,
) {
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++)
      if (x * x + y * y <= r * r)
        setPixel(buf, size, cx + x, cy + y, value);
}

/** Draw a 1px outline circle */
export function strokeCircle(
  buf: Uint8Array,
  size: number,
  cx: number,
  cy: number,
  r: number,
  value: number,
) {
  for (let angle = 0; angle < 360; angle++) {
    const rad = (angle * Math.PI) / 180;
    const x = Math.round(cx + r * Math.cos(rad));
    const y = Math.round(cy + r * Math.sin(rad));
    setPixel(buf, size, x, y, value);
  }
}

/** Draw a horizontal line */
export function hLine(buf: Uint8Array, size: number, x: number, y: number, len: number, value: number) {
  for (let i = 0; i < len; i++) setPixel(buf, size, x + i, y, value);
}

/** Draw a vertical line */
export function vLine(buf: Uint8Array, size: number, x: number, y: number, len: number, value: number) {
  for (let i = 0; i < len; i++) setPixel(buf, size, x, y + i, value);
}
