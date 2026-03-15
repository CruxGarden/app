#!/usr/bin/env node
/**
 * Convert keeper-avatar JPG images to .pxl.json pixel art format.
 *
 * Usage: node scripts/pixelize-keeper.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SIZES = [128, 64, 48];
const MAX_COLORS = 65535; // Uint16Array limit — keep all unique colors

async function pixelize(inputPath, outputPath, size, maxColors) {
  const img = await loadImage(readFileSync(inputPath));

  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, size, size);

  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;

  // Extract RGB pixels
  const rgbPixels = [];
  for (let i = 0; i < size * size; i++) {
    rgbPixels.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
  }

  // Quantize with median cut
  const palette = medianCut(rgbPixels, maxColors);

  // Map to palette indices — auto-select 8 or 16 bit depth
  const depth = palette.length > 255 ? 16 : 8;
  let pixelsBase64;

  if (depth === 16) {
    const indices = new Uint16Array(size * size);
    for (let i = 0; i < rgbPixels.length; i++) {
      indices[i] = nearestPaletteIndex(rgbPixels[i], palette);
    }
    pixelsBase64 = Buffer.from(indices.buffer).toString('base64');
  } else {
    const indices = new Uint8Array(size * size);
    for (let i = 0; i < rgbPixels.length; i++) {
      indices[i] = nearestPaletteIndex(rgbPixels[i], palette);
    }
    pixelsBase64 = Buffer.from(indices).toString('base64');
  }

  const pxl = { size, palette, pixels: pixelsBase64, ...(depth === 16 ? { depth: 16 } : {}) };
  writeFileSync(outputPath, JSON.stringify(pxl));
  console.log(`  ${outputPath} — ${size}×${size}, ${palette.length} colors`);
}

function medianCut(pixels, maxColors) {
  const colorMap = new Map();
  for (const [r, g, b] of pixels) {
    const key = `${r},${g},${b}`;
    const entry = colorMap.get(key);
    if (entry) entry.count++;
    else colorMap.set(key, { color: [r, g, b], count: 1 });
  }

  const uniqueColors = Array.from(colorMap.values());
  if (uniqueColors.length <= maxColors) {
    return uniqueColors.map((c) => [...c.color]);
  }

  let buckets = [uniqueColors];

  while (buckets.length < maxColors) {
    let bestBucket = 0, bestRange = -1, bestChannel = 0;

    for (let i = 0; i < buckets.length; i++) {
      const bucket = buckets[i];
      if (bucket.length <= 1) continue;
      for (let ch = 0; ch < 3; ch++) {
        const values = bucket.map((c) => c.color[ch]);
        const range = Math.max(...values) - Math.min(...values);
        if (range > bestRange) {
          bestRange = range;
          bestBucket = i;
          bestChannel = ch;
        }
      }
    }

    if (bestRange <= 0) break;

    const bucket = buckets[bestBucket];
    bucket.sort((a, b) => a.color[bestChannel] - b.color[bestChannel]);
    const mid = Math.floor(bucket.length / 2);
    buckets.splice(bestBucket, 1, bucket.slice(0, mid), bucket.slice(mid));
  }

  return buckets.map((bucket) => {
    let tR = 0, tG = 0, tB = 0, tC = 0;
    for (const e of bucket) {
      tR += e.color[0] * e.count;
      tG += e.color[1] * e.count;
      tB += e.color[2] * e.count;
      tC += e.count;
    }
    return [Math.round(tR / tC), Math.round(tG / tC), Math.round(tB / tC)];
  });
}

function nearestPaletteIndex(pixel, palette) {
  let bestIdx = 0, bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    const dr = pixel[0] - p[0];
    const dg = pixel[1] - p[1];
    const db = pixel[2] - p[2];
    const dist = dr * dr * 2 + dg * dg * 4 + db * db * 3;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// ── Main ──

const imagesDir = resolve(__dirname, '../src/images');

console.log('Converting keeper-avatar-dark.jpg...');
await pixelize(
  resolve(imagesDir, 'keeper-avatar-dark.jpg'),
  resolve(imagesDir, 'keeper-avatar-dark.pxl.json'),
  128,
  MAX_COLORS,
);

console.log('Converting keeper-avatar-light.jpg...');
await pixelize(
  resolve(imagesDir, 'keeper-avatar-light.jpg'),
  resolve(imagesDir, 'keeper-avatar-light.pxl.json'),
  128,
  MAX_COLORS,
);

console.log('Done!');
