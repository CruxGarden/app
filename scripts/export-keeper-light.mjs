#!/usr/bin/env node
/**
 * Light Keeper — same robot, daytime sky, clean bright metals, warm sun.
 * For use on light-mode backgrounds.
 */

import { writeFileSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const S = 128;

// ── Bright, warm palette — sunlit robot ─────────────

// Sky gradient — soft blue to pale horizon
const SKY_TOP = [110, 160, 210];
const SKY_MID = [150, 190, 225];
const SKY_BOT = [195, 215, 235];
const SKY_HORIZON = [220, 230, 240];

// Clouds
const CLOUD = [235, 240, 248];
const CLOUD_SH = [210, 220, 235];

// Clean, polished metal — warm silver
const HEAD = [180, 175, 168];
const HEAD_HI = [210, 206, 200];
const HEAD_LT = [225, 222, 218];
const HEAD_SH = [145, 140, 132];
const HEAD_DK = [115, 110, 102];
const HEAD_VDK = [88, 82, 75];

// Bright, alive eye — vivid green in sunlight
const EYE_SOCKET = [55, 52, 48];
const EYE_OUTER = [30, 100, 45];
const EYE_MID = [55, 175, 80];
const EYE_BRIGHT = [85, 210, 110];
const EYE_CORE = [140, 235, 160];
const EYE_SPEC = [200, 245, 215];
const EYE_GLOW_SOFT = [45, 130, 60];

// Polished bronze — warm, golden
const EAR = [165, 140, 90];
const EAR_HI = [195, 170, 115];
const EAR_SH = [130, 108, 68];
const EAR_DK = [100, 82, 52];
const EAR_VDK = [75, 60, 38];

const NECK = [110, 105, 95];
const NECK_HI = [140, 134, 124];
const NECK_RING = [85, 80, 72];
const NECK_DK = [95, 90, 82];

// Fresh scarf — olive green, vibrant
const SCARF = [105, 125, 75];
const SCARF_HI = [128, 148, 95];
const SCARF_LT = [142, 160, 108];
const SCARF_SH = [82, 100, 58];
const SCARF_DK = [62, 78, 42];
const SCARF_VDK = [48, 60, 32];

const SHOULDER = [160, 155, 145];
const SHOULDER_HI = [190, 185, 175];
const SHOULDER_SH = [125, 120, 110];
const SHOULDER_DK = [95, 90, 80];

// Warm chest plate — copper/bronze
const CHEST = [150, 125, 85];
const CHEST_HI = [175, 150, 105];
const CHEST_SH = [118, 98, 65];
const CHEST_DK = [90, 72, 48];

const RIVET = [145, 140, 130];
const RIVET_SH = [110, 105, 95];

// Sun highlight
const SUN_GLINT = [255, 250, 235];
const SCRATCH_LT = [215, 210, 200];
const SCRATCH_DK = [95, 88, 80];

// Antenna light — warm amber instead of green
const ANTENNA_GLOW = [220, 180, 60];
const ANTENNA_BRIGHT = [245, 220, 100];

function set(buf, x, y, c) {
  if (x < 0 || x >= S || y < 0 || y >= S) return;
  const i = (y * S + x) * 3;
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
}

function rect(buf, x, y, w, h, c) {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      set(buf, x + dx, y + dy, c);
}

function circ(buf, cx, cy, r, c) {
  const r2 = r * r;
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++)
      if (x * x + y * y <= r2) set(buf, cx + x, cy + y, c);
}

function ellipse(buf, cx, cy, rx, ry, c) {
  for (let y = -ry; y <= ry; y++)
    for (let x = -rx; x <= rx; x++)
      if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1)
        set(buf, cx + x, cy + y, c);
}

function lerp(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

// ── Build the image ─────────────────────────────────

const buf = new Uint8Array(S * S * 3);

// Sky gradient
for (let y = 0; y < S; y++) {
  const t = y / S;
  let c;
  if (t < 0.3) c = lerp(SKY_TOP, SKY_MID, t / 0.3);
  else if (t < 0.7) c = lerp(SKY_MID, SKY_BOT, (t - 0.3) / 0.4);
  else c = lerp(SKY_BOT, SKY_HORIZON, (t - 0.7) / 0.3);
  for (let x = 0; x < S; x++) set(buf, x, y, c);
}

// Clouds — soft horizontal wisps
function cloud(cx, cy, w, h) {
  for (let dy = -h; dy <= h; dy++) {
    for (let dx = -w; dx <= w; dx++) {
      const dist = (dx * dx) / (w * w) + (dy * dy) / (h * h);
      if (dist <= 1) {
        const fade = 1 - dist;
        const c = lerp(CLOUD_SH, CLOUD, fade);
        set(buf, cx + dx, cy + dy, c);
      }
    }
  }
}
cloud(25, 12, 18, 4);
cloud(90, 8, 22, 3);
cloud(55, 20, 14, 3);
cloud(105, 18, 12, 3);

// ── Antenna ──────────────────────────────────────────
rect(buf, 62, 4, 2, 12, HEAD_SH);
rect(buf, 63, 4, 1, 12, HEAD);
circ(buf, 62, 4, 2, ANTENNA_GLOW);
set(buf, 62, 3, ANTENNA_BRIGHT);
set(buf, 63, 3, ANTENNA_BRIGHT);

// ── Head ─────────────────────────────────────────────
// Main head block
rect(buf, 38, 16, 50, 44, HEAD);
// Top curve
rect(buf, 42, 14, 42, 2, HEAD);
rect(buf, 46, 12, 34, 2, HEAD_HI);
// Brow ridge
rect(buf, 38, 28, 50, 4, HEAD_SH);

// Head highlights (sunlit left side)
rect(buf, 38, 16, 6, 12, HEAD_HI);
rect(buf, 38, 16, 3, 8, HEAD_LT);
// Sun glint
set(buf, 40, 17, SUN_GLINT);
set(buf, 41, 17, SUN_GLINT);
set(buf, 40, 18, SUN_GLINT);

// Head shadow (right side)
rect(buf, 82, 16, 6, 44, HEAD_SH);
rect(buf, 85, 20, 3, 38, HEAD_DK);

// Jaw line
rect(buf, 38, 56, 50, 4, HEAD_SH);
rect(buf, 40, 58, 46, 2, HEAD_DK);

// Forehead texture
for (let x = 44; x < 82; x += 6) {
  set(buf, x, 18, HEAD_SH);
  set(buf, x + 1, 18, HEAD_SH);
}

// ── Eye ──────────────────────────────────────────────
const EX = 64, EY = 38;
// Socket
ellipse(buf, EX, EY, 16, 10, EYE_SOCKET);
// Outer ring
ellipse(buf, EX, EY, 14, 8, EYE_OUTER);
// Mid glow
ellipse(buf, EX, EY, 11, 6, EYE_MID);
// Inner bright
ellipse(buf, EX, EY, 8, 5, EYE_BRIGHT);
// Core
ellipse(buf, EX, EY, 5, 3, EYE_CORE);
// Specular
circ(buf, EX - 3, EY - 2, 2, EYE_SPEC);
set(buf, EX + 4, EY - 1, EYE_SPEC);

// ── Ears ─────────────────────────────────────────────
// Left ear
rect(buf, 28, 24, 10, 22, EAR);
rect(buf, 28, 24, 4, 22, EAR_HI);
rect(buf, 28, 24, 2, 16, [EAR_HI[0] + 15, EAR_HI[1] + 15, EAR_HI[2] + 10]); // sun catch
rect(buf, 35, 24, 3, 22, EAR_SH);
rect(buf, 28, 44, 10, 2, EAR_DK);
// Right ear
rect(buf, 88, 24, 10, 22, EAR);
rect(buf, 95, 24, 3, 22, EAR_SH);
rect(buf, 96, 26, 2, 18, EAR_DK);
rect(buf, 88, 44, 10, 2, EAR_DK);

// ── Neck ─────────────────────────────────────────────
rect(buf, 48, 60, 30, 10, NECK);
rect(buf, 48, 60, 8, 10, NECK_HI);
rect(buf, 48, 62, 30, 2, NECK_RING);
rect(buf, 48, 66, 30, 2, NECK_RING);
rect(buf, 72, 60, 6, 10, NECK_DK);

// ── Scarf ────────────────────────────────────────────
// Draped across chest, flowing
rect(buf, 30, 70, 66, 16, SCARF);
rect(buf, 30, 70, 66, 3, SCARF_HI);
rect(buf, 30, 70, 20, 6, SCARF_LT); // sunlit fold
rect(buf, 30, 83, 66, 3, SCARF_SH);

// Fold details
for (let x = 38; x < 90; x += 8) {
  rect(buf, x, 74, 2, 8, SCARF_SH);
  rect(buf, x + 3, 73, 1, 10, SCARF_HI);
}

// Scarf tail (left)
rect(buf, 24, 76, 8, 20, SCARF);
rect(buf, 24, 76, 3, 20, SCARF_HI);
rect(buf, 29, 76, 3, 20, SCARF_SH);
rect(buf, 24, 94, 8, 2, SCARF_DK);

// Scarf tail (right)
rect(buf, 94, 78, 8, 18, SCARF);
rect(buf, 99, 78, 3, 18, SCARF_SH);
rect(buf, 94, 94, 8, 2, SCARF_DK);

// ── Shoulders ────────────────────────────────────────
rect(buf, 20, 70, 12, 24, SHOULDER);
rect(buf, 20, 70, 4, 24, SHOULDER_HI);
rect(buf, 28, 70, 4, 24, SHOULDER_SH);
rect(buf, 20, 92, 12, 2, SHOULDER_DK);

rect(buf, 94, 70, 14, 24, SHOULDER);
rect(buf, 104, 70, 4, 24, SHOULDER_SH);
rect(buf, 106, 74, 2, 18, SHOULDER_DK);
rect(buf, 94, 92, 14, 2, SHOULDER_DK);

// ── Chest ────────────────────────────────────────────
rect(buf, 32, 86, 62, 42, CHEST);
rect(buf, 32, 86, 16, 38, CHEST_HI);
rect(buf, 32, 86, 6, 30, [CHEST_HI[0] + 10, CHEST_HI[1] + 10, CHEST_HI[2] + 8]); // sun
rect(buf, 84, 86, 10, 42, CHEST_SH);
rect(buf, 90, 90, 4, 36, CHEST_DK);

// Rivets
for (const [rx, ry] of [[36, 90], [36, 100], [36, 110], [88, 90], [88, 100], [88, 110]]) {
  circ(buf, rx, ry, 2, RIVET);
  set(buf, rx - 1, ry - 1, RIVET_SH);
}

// Chest panel lines
rect(buf, 50, 92, 26, 1, CHEST_SH);
rect(buf, 50, 106, 26, 1, CHEST_SH);

// ── Fill bottom ──────────────────────────────────────
for (let y = 120; y < S; y++) {
  for (let x = 20; x < 108; x++) {
    set(buf, x, y, CHEST_DK);
  }
}

// ── Scratches / wear (subtle, not grungy) ────────────
const scratches = [
  [45, 32, 4], [72, 35, 3], [55, 52, 5], [80, 48, 3],
  [40, 88, 3], [75, 95, 4], [60, 105, 3],
];
for (const [sx, sy, len] of scratches) {
  for (let i = 0; i < len; i++) {
    set(buf, sx + i, sy, SCRATCH_LT);
    set(buf, sx + i, sy + 1, SCRATCH_DK);
  }
}

// ── Encode ───────────────────────────────────────────

const palette = [];
const paletteMap = new Map();
const indices = new Uint8Array(S * S);

for (let i = 0; i < S * S; i++) {
  const r = buf[i * 3], g = buf[i * 3 + 1], b = buf[i * 3 + 2];
  const key = `${r},${g},${b}`;
  if (!paletteMap.has(key)) {
    paletteMap.set(key, palette.length);
    palette.push([r, g, b]);
  }
  indices[i] = paletteMap.get(key);
}

const data = {
  size: S,
  palette,
  pixels: Buffer.from(indices).toString('base64'),
};

const out = resolve(__dirname, '../src/images/keeper-light.pxl.json');
writeFileSync(out, JSON.stringify(data));
console.log(`Wrote ${out} (${palette.length} colors)`);
