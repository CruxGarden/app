#!/usr/bin/env node
/**
 * Extract a square crop centered on the Keeper's eye from both
 * the weathered (dark) and light variants, saving as .pxl.json files.
 */

import { writeFileSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function extractEye(inputPath, outputPath, cx, cy, cropSize) {
  const data = JSON.parse(readFileSync(inputPath, 'utf8'));
  const { size, palette, pixels } = data;
  const indices = Uint8Array.from(Buffer.from(pixels, 'base64'));

  const half = Math.floor(cropSize / 2);
  const startX = cx - half;
  const startY = cy - half;

  // Build new pixel array for the cropped region
  const newPalette = [];
  const paletteMap = new Map();
  const newIndices = new Uint8Array(cropSize * cropSize);

  for (let dy = 0; dy < cropSize; dy++) {
    for (let dx = 0; dx < cropSize; dx++) {
      const srcX = startX + dx;
      const srcY = startY + dy;

      let color;
      if (srcX >= 0 && srcX < size && srcY >= 0 && srcY < size) {
        const srcIdx = srcY * size + srcX;
        color = palette[indices[srcIdx]];
      } else {
        color = [0, 0, 0]; // out of bounds = black
      }

      const key = `${color[0]},${color[1]},${color[2]}`;
      if (!paletteMap.has(key)) {
        paletteMap.set(key, newPalette.length);
        newPalette.push(color);
      }
      newIndices[dy * cropSize + dx] = paletteMap.get(key);
    }
  }

  const out = {
    size: cropSize,
    palette: newPalette,
    pixels: Buffer.from(newIndices).toString('base64'),
  };

  writeFileSync(outputPath, JSON.stringify(out));
  console.log(`Wrote ${outputPath} (${cropSize}x${cropSize}, ${newPalette.length} colors)`);
}

// Eye center coordinates (from the keeper scripts)
const EYE_X = 64;
const EYE_Y = 48;
const CROP = 48; // 48x48 square centered on eye

// Weathered (dark) variant only
extractEye(
  resolve(__dirname, '../src/images/keeper-weathered.pxl.json'),
  resolve(__dirname, '../src/images/keeper-eye.pxl.json'),
  EYE_X, EYE_Y, CROP,
);
