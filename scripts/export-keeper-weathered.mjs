#!/usr/bin/env node
/**
 * Weathered Keeper — aged, worn-down, serious. Less saturated, more texture,
 * dimmer eye, rust/oxidation, tattered scarf, grime in crevices.
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const S = 128;

// ── Muted, desaturated palette ──────────────────────────
// Everything pulled toward grey. Less contrast, more uniform.

const BG_TOP = [18, 18, 24];
const BG_MID = [14, 14, 18];
const BG_BOT = [10, 10, 12];

const HEAD = [142, 135, 125];
const HEAD_HI = [158, 152, 142];
const HEAD_LT = [168, 162, 152];
const HEAD_SH = [108, 102, 92];
const HEAD_DK = [82, 76, 68];
const HEAD_VDK = [62, 56, 48];

// Dimmer, less saturated eye — still green but tired
const EYE_SOCKET = [38, 36, 32];
const EYE_OUTER = [18, 62, 28];
const EYE_MID = [35, 125, 55];
const EYE_BRIGHT = [65, 155, 80];
const EYE_CORE = [110, 180, 125];
const EYE_SPEC = [155, 195, 165];
const EYE_GLOW_SOFT = [25, 85, 35];

// Tarnished bronze — darker, oxidised
const EAR = [118, 98, 62];
const EAR_HI = [138, 115, 78];
const EAR_SH = [88, 72, 48];
const EAR_DK = [65, 52, 35];
const EAR_VDK = [48, 38, 25];

const NECK = [72, 66, 58];
const NECK_HI = [92, 85, 75];
const NECK_RING = [52, 48, 42];
const NECK_DK = [60, 55, 48];

// Faded, dusty scarf — olive gone brownish
const SCARF = [82, 88, 58];
const SCARF_HI = [98, 105, 72];
const SCARF_LT = [108, 115, 80];
const SCARF_SH = [65, 72, 45];
const SCARF_DK = [50, 56, 34];
const SCARF_VDK = [38, 42, 25];

const SHOULDER = [118, 112, 102];
const SHOULDER_HI = [135, 128, 118];
const SHOULDER_SH = [90, 85, 76];
const SHOULDER_DK = [68, 62, 55];

const CHEST = [105, 88, 60];
const CHEST_HI = [122, 104, 72];
const CHEST_SH = [82, 68, 45];
const CHEST_DK = [62, 50, 34];

const RIVET = [100, 95, 85];
const RIVET_SH = [72, 68, 60];

// Grime / dirt
const GRIME = [55, 50, 40];
const GRIME_DK = [40, 36, 28];

// Damage / exposed metal
const SCRATCH_LT = [165, 158, 148];
const SCRATCH_DK = [58, 52, 45];

function set(buf, x, y, c) {
  if (x < 0 || x >= S || y < 0 || y >= S) return;
  const i = (y * S + x) * 3;
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
}

function get(buf, x, y) {
  if (x < 0 || x >= S || y < 0 || y >= S) return [0, 0, 0];
  const i = (y * S + x) * 3;
  return [buf[i], buf[i + 1], buf[i + 2]];
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
  const rx2 = rx * rx, ry2 = ry * ry;
  for (let y = -ry; y <= ry; y++)
    for (let x = -rx; x <= rx; x++)
      if ((x * x) * ry2 + (y * y) * rx2 <= rx2 * ry2)
        set(buf, cx + x, cy + y, c);
}

function blend(buf, x, y, c, a) {
  const bg = get(buf, x, y);
  set(buf, x, y, [
    Math.round(bg[0] + (c[0] - bg[0]) * a),
    Math.round(bg[1] + (c[1] - bg[1]) * a),
    Math.round(bg[2] + (c[2] - bg[2]) * a),
  ]);
}

function glow(buf, cx, cy, r, c, intensity) {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < r) {
        const a = intensity * (1 - dist / r) * (1 - dist / r);
        blend(buf, cx + dx, cy + dy, c, a);
      }
    }
}

function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inHead(px, py) {
  const dx = (px - 64) / 32;
  const dy = (py - 46) / 34;
  return dx * dx + dy * dy <= 1;
}

function buildKeeper() {
  const buf = new Uint8Array(S * S * 3);
  const rng = mulberry32(42);

  // ── Background — darker, no colour ────────────────
  for (let y = 0; y < S; y++) {
    const t = y / S;
    const c = t < 0.5
      ? [Math.round(BG_TOP[0]+(BG_MID[0]-BG_TOP[0])*(t*2)), Math.round(BG_TOP[1]+(BG_MID[1]-BG_TOP[1])*(t*2)), Math.round(BG_TOP[2]+(BG_MID[2]-BG_TOP[2])*(t*2))]
      : [Math.round(BG_MID[0]+(BG_BOT[0]-BG_MID[0])*((t-0.5)*2)), Math.round(BG_MID[1]+(BG_BOT[1]-BG_MID[1])*((t-0.5)*2)), Math.round(BG_MID[2]+(BG_BOT[2]-BG_MID[2])*((t-0.5)*2))];
    for (let x = 0; x < S; x++) set(buf, x, y, c);
  }

  // Fewer, dimmer stars
  for (const [sx, sy, b] of [[12,4,80],[78,3,90],[105,6,75],[55,2,70],[92,9,65]]) {
    set(buf, sx, sy, [b, b+2, b+5]);
  }

  // ── Shoulders — worn, dented ──────────────────────
  ellipse(buf,36,114,32,18,SHOULDER_DK);
  ellipse(buf,36,113,30,16,SHOULDER_SH);
  ellipse(buf,36,112,28,14,SHOULDER);
  ellipse(buf,32,110,18,10,SHOULDER_HI);

  ellipse(buf,92,114,32,18,SHOULDER_DK);
  ellipse(buf,92,113,30,16,SHOULDER_SH);
  ellipse(buf,92,112,28,14,SHOULDER);
  ellipse(buf,96,110,18,10,SHOULDER_HI);

  // Dents on shoulders
  circ(buf, 28, 112, 4, SHOULDER_DK);
  circ(buf, 29, 112, 3, SHOULDER_SH);
  circ(buf, 102, 114, 3, SHOULDER_DK);

  // Chest plate — battered
  rect(buf,48,104,32,24,CHEST);
  rect(buf,50,106,28,22,CHEST_SH);
  rect(buf,52,104,24,5,CHEST_HI);
  rect(buf,54,108,20,2,CHEST);
  rect(buf,56,112,16,1,CHEST_DK);
  rect(buf,58,116,12,1,CHEST_DK);
  // Chest damage
  rect(buf, 60, 110, 8, 1, SCRATCH_LT);
  rect(buf, 62, 114, 5, 1, SCRATCH_DK);

  // ── Scarf — faded, frayed ─────────────────────────
  ellipse(buf,64,96,38,13,SCARF_SH);
  ellipse(buf,64,95,36,12,SCARF);
  ellipse(buf,64,94,32,8,SCARF_HI);
  ellipse(buf,64,93,28,5,SCARF_LT);
  ellipse(buf,64,94,24,4,SCARF_HI);

  // Left drape — more tattered
  for (let y = 96; y < 127; y++) {
    const p = (y - 96) / 31;
    let w = Math.max(1, Math.round(14 - p * 10));
    const x0 = Math.round(30 + p * 12);
    // Fraying: irregular width toward the end
    if (p > 0.6) w = Math.max(1, w - Math.round(rng() * 3));
    const shade = (y % 4 === 0) ? SCARF_VDK : (y % 4 === 2) ? SCARF_DK : SCARF_SH;
    rect(buf, x0, y, w, 1, shade);
    if (w > 3) set(buf, x0, y, SCARF);
    // Worn holes
    if (p > 0.5 && rng() < 0.15) {
      const hx = x0 + Math.round(rng() * Math.max(0, w - 1));
      set(buf, hx, y, BG_BOT);
    }
  }

  // Right drape — shorter, more worn
  for (let y = 96; y < 114; y++) {
    const p = (y - 96) / 18;
    let w = Math.max(1, Math.round(10 - p * 8));
    const x0 = Math.round(84 - p * 6);
    if (p > 0.5) w = Math.max(1, w - Math.round(rng() * 2));
    rect(buf, x0, y, w, 1, (y % 3 === 0) ? SCARF_VDK : SCARF_DK);
  }

  // Faded knot
  ellipse(buf, 64, 96, 8, 5, SCARF_LT);
  ellipse(buf, 64, 97, 6, 4, SCARF_HI);
  ellipse(buf, 64, 98, 4, 3, SCARF);
  ellipse(buf, 64, 100, 7, 2, SCARF_DK);

  // Dirt on scarf
  for (let i = 0; i < 30; i++) {
    const sx = Math.round(40 + rng() * 48);
    const sy = Math.round(90 + rng() * 12);
    blend(buf, sx, sy, GRIME, 0.3);
  }

  // ── Neck — corroded ───────────────────────────────
  rect(buf, 55, 80, 18, 18, NECK);
  rect(buf, 57, 81, 6, 16, NECK_HI);
  rect(buf, 67, 82, 4, 14, NECK_DK);

  for (let ry = 82; ry <= 96; ry += 3) {
    rect(buf, 54, ry, 20, 1, NECK_RING);
  }
  rect(buf, 53, 96, 22, 2, NECK_RING);

  // Neck grime
  ellipse(buf, 68, 85, 2, 3, GRIME_DK);

  // ── Head — weathered, scarred ─────────────────────
  ellipse(buf, 64, 46, 32, 34, HEAD);

  // Shading — less contrast, flatter
  ellipse(buf, 56, 34, 20, 20, HEAD_HI);
  ellipse(buf, 58, 24, 10, 7, HEAD_LT);
  ellipse(buf, 72, 56, 22, 18, HEAD_SH);
  ellipse(buf, 68, 68, 16, 8, HEAD_DK);
  ellipse(buf, 74, 62, 10, 6, HEAD_VDK);

  // Heavy weathering — lots of texture
  for (let i = 0; i < 650; i++) {
    const a = rng() * Math.PI * 2;
    const d = rng() * 30;
    const px = Math.round(64 + Math.cos(a) * d);
    const py = Math.round(46 + Math.sin(a) * d * 1.06);
    if (inHead(px, py)) {
      const bg = get(buf, px, py);
      const offset = (rng() - 0.5) * 28; // more variation
      set(buf, px, py, [
        Math.max(0, Math.min(255, Math.round(bg[0] + offset))),
        Math.max(0, Math.min(255, Math.round(bg[1] + offset - 2))),
        Math.max(0, Math.min(255, Math.round(bg[2] + offset - 4))),
      ]);
    }
  }

  // Deep scratch marks
  for (let i = 0; i < 25; i++) {
    const sx = Math.round(38 + rng() * 52);
    const sy = Math.round(20 + rng() * 52);
    const len = Math.round(4 + rng() * 10);
    const angle = rng() * Math.PI;
    const isLight = rng() > 0.6;
    for (let j = 0; j < len; j++) {
      const px = Math.round(sx + Math.cos(angle) * j);
      const py = Math.round(sy + Math.sin(angle) * j);
      if (inHead(px, py)) {
        blend(buf, px, py, isLight ? SCRATCH_LT : SCRATCH_DK, 0.3);
      }
    }
  }

  // Grime accumulation in lower areas
  for (let x = 40; x < 88; x++) {
    for (let y = 60; y < 75; y++) {
      if (inHead(x, y)) {
        const t = (y - 60) / 15;
        blend(buf, x, y, GRIME, t * 0.2 * rng());
      }
    }
  }

  // Dent on the head
  circ(buf, 72, 32, 5, HEAD_DK);
  circ(buf, 73, 32, 4, HEAD_SH);
  circ(buf, 73, 31, 3, HEAD);
  set(buf, 74, 33, HEAD_VDK); // shadow edge

  // ── Ear sensors — tarnished ───────────────────────
  rect(buf, 26, 36, 8, 24, EAR);
  rect(buf, 26, 40, 8, 16, EAR_SH);
  rect(buf, 27, 36, 6, 5, EAR_HI);
  rect(buf, 25, 34, 10, 3, EAR_DK);
  rect(buf, 25, 60, 10, 3, EAR_DK);
  rect(buf, 33, 37, 2, 22, EAR_VDK);
  for (let sy = 42; sy <= 56; sy += 5) {
    rect(buf, 27, sy, 5, 2, EAR_VDK);
    rect(buf, 28, sy, 3, 1, EAR_DK);
  }
  // Left ear grime
  ellipse(buf, 28, 44, 2, 2, GRIME_DK);

  rect(buf, 94, 36, 8, 24, EAR);
  rect(buf, 94, 40, 8, 16, EAR_SH);
  rect(buf, 95, 36, 6, 5, EAR_HI);
  rect(buf, 93, 34, 10, 3, EAR_DK);
  rect(buf, 93, 60, 10, 3, EAR_DK);
  rect(buf, 93, 37, 2, 22, EAR_VDK);
  for (let sy = 42; sy <= 56; sy += 5) {
    rect(buf, 96, sy, 5, 2, EAR_VDK);
    rect(buf, 97, sy, 3, 1, EAR_DK);
  }
  // Right ear — one slot broken/dark
  rect(buf, 96, 47, 5, 3, EAR_VDK);
  rect(buf, 97, 48, 3, 1, [32, 28, 20]);

  // ── Eye — dim, flickering feel ────────────────────
  // Weaker ambient glow
  glow(buf, 64, 48, 18, EYE_GLOW_SOFT, 0.08);

  circ(buf, 64, 48, 16, EYE_SOCKET);
  circ(buf, 64, 48, 14, EYE_OUTER);
  circ(buf, 64, 48, 11, EYE_MID);
  circ(buf, 64, 48, 8, EYE_BRIGHT);
  circ(buf, 64, 48, 5, EYE_CORE);
  circ(buf, 64, 48, 3, EYE_SPEC);

  // Smaller, dimmer specular
  circ(buf, 59, 44, 2, EYE_SPEC);
  circ(buf, 58, 43, 1, [155, 195, 165]);

  set(buf, 66, 54, EYE_BRIGHT);
  set(buf, 66, 55, EYE_CORE);

  // Iris spokes — more prominent, asymmetric
  for (let spoke = 0; spoke < 12; spoke++) {
    const angle = (spoke / 12) * Math.PI * 2;
    for (let d = 5; d < 12; d++) {
      const px = Math.round(64 + Math.cos(angle) * d);
      const py = Math.round(48 + Math.sin(angle) * d);
      blend(buf, px, py, EYE_OUTER, 0.35);
    }
  }

  circ(buf, 64, 48, 4, EYE_CORE);
  circ(buf, 64, 48, 2, EYE_SPEC);
  circ(buf, 59, 44, 1, EYE_SPEC);

  // Dust/grime on the eye socket rim
  for (let a = 0; a < 360; a += 3) {
    const rad = (a * Math.PI) / 180;
    const px = Math.round(64 + Math.cos(rad) * 15);
    const py = Math.round(48 + Math.sin(rad) * 15);
    if (rng() < 0.3) blend(buf, px, py, GRIME, 0.4);
  }

  // Crack emanating from eye socket — a stress fracture
  for (let j = 0; j < 14; j++) {
    const px = 78 + j;
    const py = 48 - Math.round(j * 0.3) + (j > 8 ? 1 : 0);
    if (inHead(px, py)) {
      set(buf, px, py, HEAD_VDK);
      if (j % 3 === 0 && j > 4) set(buf, px, py + 1, HEAD_DK);
    }
  }

  // ── Head details — worn rivets ────────────────────
  for (const [rx, ry] of [[44,30],[84,30],[44,64],[84,64],[52,20],[76,20]]) {
    circ(buf, rx, ry, 2, RIVET);
    set(buf, rx + 1, ry + 1, RIVET_SH);
  }

  // Forehead seam — deeper, more prominent
  for (let x = 48; x <= 80; x++) {
    blend(buf, x, 26, HEAD_VDK, 0.5);
    blend(buf, x, 27, HEAD_VDK, 0.3);
    blend(buf, x, 28, HEAD_DK, 0.1);
  }

  // Cheek panel lines — deeper
  for (let y = 54; y <= 70; y++) {
    blend(buf, 42, y, HEAD_VDK, 0.4);
    blend(buf, 43, y, HEAD_DK, 0.15);
    blend(buf, 86, y, HEAD_VDK, 0.4);
    blend(buf, 85, y, HEAD_DK, 0.15);
  }

  // ── Antenna — bent, tip light dim ─────────────────
  rect(buf, 62, 9, 4, 5, HEAD_SH);
  rect(buf, 63, 9, 2, 3, HEAD);
  // Slightly bent
  rect(buf, 61, 6, 4, 4, EAR);
  rect(buf, 62, 6, 2, 2, EAR_SH); // not highlighted — tarnished
  // Dim tip — barely glowing
  set(buf, 62, 5, EYE_OUTER);
  set(buf, 63, 5, EYE_OUTER);
  set(buf, 62, 4, EYE_MID);
  // One pixel of the antenna broken off
  set(buf, 63, 4, BG_TOP);

  // ── Shoulder details ──────────────────────────────
  for (const [rx, ry] of [[22,110],[44,106],[84,106],[106,110],[28,116],[100,116]]) {
    circ(buf, rx, ry, 1, RIVET);
    set(buf, rx + 1, ry + 1, RIVET_SH);
  }

  // Shoulder seam lines
  for (let x = 10; x <= 36; x++) blend(buf, x, 108, SHOULDER_DK, 0.4);
  for (let x = 92; x <= 118; x++) blend(buf, x, 108, SHOULDER_DK, 0.4);

  // ── Overall grime/dust pass ───────────────────────
  // Subtle darkening toward edges (vignette)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x - 64) / 64;
      const dy = (y - 64) / 64;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.7) {
        blend(buf, x, y, [5, 5, 5], (dist - 0.7) * 0.4);
      }
    }
  }

  return buf;
}

// ── Export (with palette quantization to ≤256 colours) ──

const rgb = buildKeeper();
const totalPixels = S * S;

// First pass — gather unique colours
const rawColorMap = new Map();
const rawPalette = [];

for (let i = 0; i < totalPixels; i++) {
  const si = i * 3;
  const key = `${rgb[si]},${rgb[si + 1]},${rgb[si + 2]}`;
  if (!rawColorMap.has(key)) {
    rawColorMap.set(key, rawPalette.length);
    rawPalette.push([rgb[si], rgb[si + 1], rgb[si + 2]]);
  }
}

console.log(`Raw palette: ${rawPalette.length} unique colours`);

// Quantize if > 256: snap each colour to nearest in reduced set
// Simple median-cut-like: round components to reduce precision
let palette, indices;

if (rawPalette.length <= 256) {
  palette = rawPalette;
  indices = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    const si = i * 3;
    const key = `${rgb[si]},${rgb[si + 1]},${rgb[si + 2]}`;
    indices[i] = rawColorMap.get(key);
  }
} else {
  // Round components to reduce unique count, increasing step until ≤256
  let step = 2;
  let quantPalette, quantMap;
  while (step < 16) {
    quantMap = new Map();
    quantPalette = [];
    for (const c of rawPalette) {
      const qr = Math.round(c[0] / step) * step;
      const qg = Math.round(c[1] / step) * step;
      const qb = Math.round(c[2] / step) * step;
      const key = `${qr},${qg},${qb}`;
      if (!quantMap.has(key)) {
        quantMap.set(key, quantPalette.length);
        quantPalette.push([qr, qg, qb]);
      }
    }
    if (quantPalette.length <= 256) break;
    step++;
  }
  console.log(`Quantized to ${quantPalette.length} colours (step=${step})`);
  palette = quantPalette;

  // Re-index all pixels against quantized palette
  indices = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    const si = i * 3;
    const qr = Math.round(rgb[si] / step) * step;
    const qg = Math.round(rgb[si + 1] / step) * step;
    const qb = Math.round(rgb[si + 2] / step) * step;
    const key = `${qr},${qg},${qb}`;
    indices[i] = quantMap.get(key);
  }
}

console.log(`Final palette: ${palette.length} colours`);

const output = {
  name: 'keeper-weathered',
  size: S,
  paletteCount: palette.length,
  palette,
  pixels: Buffer.from(indices).toString('base64'),
};

const outPath = resolve(__dirname, '../src/images/keeper-weathered.pxl.json');
writeFileSync(outPath, JSON.stringify(output));
console.log(`Written to ${outPath}`);
