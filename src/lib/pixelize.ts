/**
 * Pixelize — convert any image to palette-indexed pixel art (.pxl.json format).
 *
 * Pipeline:
 *   1. Load image onto an offscreen canvas
 *   2. Downscale to target resolution (bilinear via canvas)
 *   3. Quantize colors using median-cut to reduce palette size
 *   4. Map each pixel to nearest palette entry → index buffer
 *   5. Output { size, palette, pixels } matching the .pxl.json format
 */

export interface PxlData {
  size: number;
  palette: number[][]; // [r, g, b][]
  pixels: string; // base64 of Uint8Array (≤255 colors) or Uint16Array (>255) palette indices
  depth?: 8 | 16; // bits per index, default 8 for backward compat
}

export interface PixelizeOptions {
  /** Target size in pixels (square). Default: 64 */
  size?: number;
  /** Max palette colors. Default: 65535. Set lower to force quantization for smaller files. */
  maxColors?: number;
}

/**
 * Convert an image source (File, Blob, or data URL) to pixel art.
 */
export async function pixelizeImage(
  source: File | Blob | string,
  options: PixelizeOptions = {},
): Promise<PxlData> {
  const size = options.size ?? 64;
  const maxColors = Math.min(options.maxColors ?? 65535, 65535);

  // Load image
  const img = await loadImage(source);

  // Downscale to target size using canvas (bilinear interpolation)
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'medium';
  ctx.drawImage(img, 0, 0, size, size);

  const imageData = ctx.getImageData(0, 0, size, size);
  const pixels = imageData.data; // RGBA flat array

  // Extract all pixel colors (skip fully transparent)
  const rgbPixels: [number, number, number][] = [];
  for (let i = 0; i < size * size; i++) {
    const r = pixels[i * 4]!;
    const g = pixels[i * 4 + 1]!;
    const b = pixels[i * 4 + 2]!;
    const a = pixels[i * 4 + 3]!;
    if (a < 128) {
      rgbPixels.push([0, 0, 0]); // transparent → black
    } else {
      rgbPixels.push([r, g, b]);
    }
  }

  // Quantize palette using median cut (only if needed)
  const palette = medianCut(rgbPixels, maxColors);

  // Auto-select depth based on palette size
  const depth: 8 | 16 = palette.length > 255 ? 16 : 8;

  // Map each pixel to nearest palette index
  let pixelsBase64: string;
  if (depth === 16) {
    const indices = new Uint16Array(size * size);
    for (let i = 0; i < rgbPixels.length; i++) {
      indices[i] = nearestPaletteIndex(rgbPixels[i]!, palette);
    }
    pixelsBase64 = arrayBufferToBase64(indices.buffer);
  } else {
    const indices = new Uint8Array(size * size);
    for (let i = 0; i < rgbPixels.length; i++) {
      indices[i] = nearestPaletteIndex(rgbPixels[i]!, palette);
    }
    pixelsBase64 = uint8ToBase64(indices);
  }

  return { size, palette, pixels: pixelsBase64, ...(depth === 16 ? { depth: 16 } : {}) };
}

// ── Image loading ────────────────────────────────────────────

async function loadImage(source: File | Blob | string): Promise<ImageBitmap> {
  if (typeof source === 'string') {
    // Data URL or regular URL
    const response = await fetch(source);
    const blob = await response.blob();
    return createImageBitmap(blob);
  }
  return createImageBitmap(source);
}

// ── Median Cut color quantization ────────────────────────────

function medianCut(
  pixels: [number, number, number][],
  maxColors: number,
): number[][] {
  // Deduplicate colors first
  const colorMap = new Map<string, { color: [number, number, number]; count: number }>();
  for (const [r, g, b] of pixels) {
    const key = `${r},${g},${b}`;
    const entry = colorMap.get(key);
    if (entry) {
      entry.count++;
    } else {
      colorMap.set(key, { color: [r, g, b], count: 1 });
    }
  }

  const uniqueColors = Array.from(colorMap.values());

  if (uniqueColors.length <= maxColors) {
    return uniqueColors.map((c) => [...c.color]);
  }

  // Recursive subdivision
  type Bucket = typeof uniqueColors;
  const buckets: Bucket[] = [uniqueColors];

  while (buckets.length < maxColors) {
    // Find the bucket with the widest range
    let bestBucket = 0;
    let bestRange = -1;
    let bestChannel = 0;

    for (let i = 0; i < buckets.length; i++) {
      const bucket = buckets[i]!;
      if (bucket.length <= 1) continue;

      for (let ch = 0; ch < 3; ch++) {
        const values = bucket.map((c) => c.color[ch]!);
        const range = Math.max(...values) - Math.min(...values);
        if (range > bestRange) {
          bestRange = range;
          bestBucket = i;
          bestChannel = ch;
        }
      }
    }

    if (bestRange <= 0) break; // can't split further

    const bucket = buckets[bestBucket]!;
    bucket.sort((a, b) => a.color[bestChannel]! - b.color[bestChannel]!);
    const mid = Math.floor(bucket.length / 2);
    buckets.splice(bestBucket, 1, bucket.slice(0, mid), bucket.slice(mid));
  }

  // Average each bucket to get the palette color
  return buckets.map((bucket) => {
    let totalR = 0, totalG = 0, totalB = 0, totalCount = 0;
    for (const entry of bucket) {
      totalR += entry.color[0] * entry.count;
      totalG += entry.color[1] * entry.count;
      totalB += entry.color[2] * entry.count;
      totalCount += entry.count;
    }
    return [
      Math.round(totalR / totalCount),
      Math.round(totalG / totalCount),
      Math.round(totalB / totalCount),
    ];
  });
}

// ── Nearest color matching ───────────────────────────────────

function nearestPaletteIndex(
  pixel: [number, number, number],
  palette: number[][],
): number {
  let bestIdx = 0;
  let bestDist = Infinity;

  for (let i = 0; i < palette.length; i++) {
    const p = palette[i]!;
    const dr = pixel[0] - p[0]!;
    const dg = pixel[1] - p[1]!;
    const db = pixel[2] - p[2]!;
    // Weighted distance (human eye is more sensitive to green)
    const dist = dr * dr * 2 + dg * dg * 4 + db * db * 3;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  return bestIdx;
}

// ── Base64 encoding ──────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return uint8ToBase64(bytes);
}

function uint8ToBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]!);
  }
  return btoa(binary);
}
