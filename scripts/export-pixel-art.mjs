#!/usr/bin/env node
/**
 * Exports the Keeper pixel art build function output to a palette-indexed JSON file.
 *
 * Format (.pxl.json):
 *   name      — avatar name
 *   size      — grid dimension (128)
 *   palette   — array of [r,g,b] unique colours
 *   pixels    — base64-encoded Uint8Array of palette indices (one byte per pixel)
 *
 * Usage: node scripts/export-pixel-art.mjs
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Inline the build logic (can't import TSX directly) ──

const S = 128;

const BG_TOP = [22, 24, 38];
const BG_MID = [18, 20, 32];
const BG_BOT = [14, 16, 22];

const HEAD = [175, 165, 148];
const HEAD_HI = [198, 190, 172];
const HEAD_LT = [215, 207, 190];
const HEAD_SH = [138, 128, 112];
const HEAD_DK = [110, 102, 90];
const HEAD_VDK = [85, 78, 68];

const EYE_SOCKET = [55, 52, 46];
const EYE_OUTER = [25, 105, 40];
const EYE_MID = [55, 200, 85];
const EYE_BRIGHT = [110, 240, 130];
const EYE_CORE = [190, 255, 205];
const EYE_SPEC = [235, 255, 240];
const EYE_GLOW_SOFT = [40, 160, 60];

const EAR = [165, 132, 78];
const EAR_HI = [190, 160, 105];
const EAR_SH = [125, 98, 58];
const EAR_DK = [90, 72, 42];
const EAR_VDK = [68, 55, 32];

const NECK = [95, 88, 78];
const NECK_HI = [125, 115, 100];
const NECK_RING = [68, 62, 55];
const NECK_DK = [78, 72, 64];

const SCARF = [115, 130, 72];
const SCARF_HI = [145, 162, 95];
const SCARF_LT = [162, 178, 112];
const SCARF_SH = [88, 102, 55];
const SCARF_DK = [68, 80, 42];
const SCARF_VDK = [52, 62, 32];

const SHOULDER = [152, 142, 128];
const SHOULDER_HI = [178, 168, 152];
const SHOULDER_SH = [118, 110, 98];
const SHOULDER_DK = [88, 82, 72];

const CHEST = [140, 114, 74];
const CHEST_HI = [162, 136, 92];
const CHEST_SH = [108, 86, 55];
const CHEST_DK = [82, 66, 42];

const RIVET = [135, 128, 115];
const RIVET_SH = [100, 94, 82];

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

  for (let y = 0; y < S; y++) {
    const t = y / S;
    const c = t < 0.5
      ? [Math.round(BG_TOP[0]+(BG_MID[0]-BG_TOP[0])*(t*2)), Math.round(BG_TOP[1]+(BG_MID[1]-BG_TOP[1])*(t*2)), Math.round(BG_TOP[2]+(BG_MID[2]-BG_TOP[2])*(t*2))]
      : [Math.round(BG_MID[0]+(BG_BOT[0]-BG_MID[0])*((t-0.5)*2)), Math.round(BG_MID[1]+(BG_BOT[1]-BG_MID[1])*((t-0.5)*2)), Math.round(BG_MID[2]+(BG_BOT[2]-BG_MID[2])*((t-0.5)*2))];
    for (let x = 0; x < S; x++) set(buf, x, y, c);
  }

  for (const [sx, sy, b] of [[12,4,170],[38,7,155],[78,3,180],[105,6,160],[8,15,140],[118,10,150],[55,2,135],[92,9,145],[25,11,125],[70,5,165]]) {
    set(buf, sx, sy, [b, b+8, b+18]);
  }

  ellipse(buf,36,114,32,18,SHOULDER_DK); ellipse(buf,36,113,30,16,SHOULDER_SH); ellipse(buf,36,112,28,14,SHOULDER); ellipse(buf,32,110,18,10,SHOULDER_HI);
  ellipse(buf,92,114,32,18,SHOULDER_DK); ellipse(buf,92,113,30,16,SHOULDER_SH); ellipse(buf,92,112,28,14,SHOULDER); ellipse(buf,96,110,18,10,SHOULDER_HI);

  rect(buf,48,104,32,24,CHEST); rect(buf,50,106,28,22,CHEST_SH); rect(buf,52,104,24,5,CHEST_HI); rect(buf,54,108,20,2,CHEST);
  rect(buf,56,112,16,1,CHEST_DK); rect(buf,58,116,12,1,CHEST_DK);

  ellipse(buf,64,96,38,13,SCARF_SH); ellipse(buf,64,95,36,12,SCARF); ellipse(buf,64,94,32,8,SCARF_HI); ellipse(buf,64,93,28,5,SCARF_LT); ellipse(buf,64,94,24,4,SCARF_HI);

  for (let y=96; y<127; y++) { const p=(y-96)/31; const w=Math.max(2,Math.round(14-p*10)); const x0=Math.round(30+p*12); const sh=(y%4===0)?SCARF_VDK:(y%4===2)?SCARF_DK:SCARF_SH; rect(buf,x0,y,w,1,sh); if(w>3)set(buf,x0,y,SCARF); }
  for (let y=96; y<116; y++) { const p=(y-96)/20; const w=Math.max(2,Math.round(10-p*7)); const x0=Math.round(84-p*6); rect(buf,x0,y,w,1,(y%3===0)?SCARF_VDK:SCARF_DK); }

  ellipse(buf,64,96,8,5,SCARF_LT); ellipse(buf,64,97,6,4,SCARF_HI); ellipse(buf,64,98,4,3,SCARF); ellipse(buf,64,100,7,2,SCARF_DK);

  rect(buf,55,80,18,18,NECK); rect(buf,57,81,6,16,NECK_HI); rect(buf,67,82,4,14,NECK_DK);
  for (let ry=82; ry<=96; ry+=3) rect(buf,54,ry,20,1,NECK_RING);
  rect(buf,53,96,22,2,NECK_RING);

  ellipse(buf,64,46,32,34,HEAD);
  ellipse(buf,56,34,20,20,HEAD_HI); ellipse(buf,58,24,10,7,HEAD_LT); ellipse(buf,72,56,22,18,HEAD_SH); ellipse(buf,68,68,16,8,HEAD_DK); ellipse(buf,74,62,10,6,HEAD_VDK);

  for (let i=0; i<400; i++) { const a=rng()*Math.PI*2; const d=rng()*30; const px=Math.round(64+Math.cos(a)*d); const py=Math.round(46+Math.sin(a)*d*1.06); if(inHead(px,py)){const bg=get(buf,px,py);const o=(rng()-0.5)*18;set(buf,px,py,[Math.max(0,Math.min(255,Math.round(bg[0]+o))),Math.max(0,Math.min(255,Math.round(bg[1]+o-1))),Math.max(0,Math.min(255,Math.round(bg[2]+o-2)))]);} }
  for (let i=0; i<12; i++) { const sx=Math.round(40+rng()*48); const sy=Math.round(22+rng()*48); const len=Math.round(3+rng()*6); const angle=rng()*Math.PI; for(let j=0;j<len;j++){const px=Math.round(sx+Math.cos(angle)*j);const py=Math.round(sy+Math.sin(angle)*j);if(inHead(px,py))blend(buf,px,py,HEAD_DK,0.15);} }

  rect(buf,26,36,8,24,EAR); rect(buf,26,40,8,16,EAR_SH); rect(buf,27,36,6,5,EAR_HI);
  rect(buf,25,34,10,3,EAR_DK); rect(buf,25,60,10,3,EAR_DK); rect(buf,33,37,2,22,EAR_VDK);
  for(let sy=42;sy<=56;sy+=5){rect(buf,27,sy,5,2,EAR_VDK);rect(buf,28,sy,3,1,EAR_DK);}

  rect(buf,94,36,8,24,EAR); rect(buf,94,40,8,16,EAR_SH); rect(buf,95,36,6,5,EAR_HI);
  rect(buf,93,34,10,3,EAR_DK); rect(buf,93,60,10,3,EAR_DK); rect(buf,93,37,2,22,EAR_VDK);
  for(let sy=42;sy<=56;sy+=5){rect(buf,96,sy,5,2,EAR_VDK);rect(buf,97,sy,3,1,EAR_DK);}

  glow(buf,64,48,22,EYE_GLOW_SOFT,0.12);
  circ(buf,64,48,16,EYE_SOCKET); circ(buf,64,48,14,EYE_OUTER); circ(buf,64,48,11,EYE_MID); circ(buf,64,48,8,EYE_BRIGHT); circ(buf,64,48,5,EYE_CORE); circ(buf,64,48,3,EYE_SPEC);
  circ(buf,59,44,3,EYE_SPEC); circ(buf,58,43,2,[245,255,248]);
  set(buf,66,54,EYE_BRIGHT); set(buf,67,54,EYE_BRIGHT); set(buf,66,55,EYE_CORE);

  for(let spoke=0;spoke<12;spoke++){const angle=(spoke/12)*Math.PI*2;for(let d=6;d<11;d++){const px=Math.round(64+Math.cos(angle)*d);const py=Math.round(48+Math.sin(angle)*d);blend(buf,px,py,EYE_OUTER,0.25);}}
  circ(buf,64,48,4,EYE_CORE); circ(buf,64,48,2,EYE_SPEC); circ(buf,59,44,2,EYE_SPEC);

  for(const[rx,ry]of[[44,30],[84,30],[44,64],[84,64],[52,20],[76,20]]){circ(buf,rx,ry,2,RIVET);set(buf,rx+1,ry+1,RIVET_SH);}
  for(let x=50;x<=78;x++){blend(buf,x,26,HEAD_DK,0.35);blend(buf,x,27,HEAD_VDK,0.15);}
  for(let y=55;y<=68;y++){blend(buf,42,y,HEAD_DK,0.25);blend(buf,86,y,HEAD_DK,0.25);}

  rect(buf,62,9,4,5,HEAD_SH); rect(buf,63,9,2,3,HEAD); rect(buf,62,6,4,4,EAR); rect(buf,63,6,2,2,EAR_HI);
  set(buf,63,5,EYE_MID); set(buf,64,5,EYE_MID); set(buf,63,4,EYE_BRIGHT); set(buf,64,4,EYE_BRIGHT);

  for(const[rx,ry]of[[22,110],[44,106],[84,106],[106,110],[28,116],[100,116]]){circ(buf,rx,ry,1,RIVET);set(buf,rx+1,ry+1,RIVET_SH);}
  for(let x=10;x<=36;x++)blend(buf,x,108,SHOULDER_DK,0.3);
  for(let x=92;x<=118;x++)blend(buf,x,108,SHOULDER_DK,0.3);

  return buf;
}

// ── Export to palette-indexed JSON ───────────────────────

const rgb = buildKeeper();
const totalPixels = S * S;

// Build palette from unique colours
const colorMap = new Map();
const palette = [];
const indices = new Uint8Array(totalPixels);

for (let i = 0; i < totalPixels; i++) {
  const si = i * 3;
  const key = `${rgb[si]},${rgb[si + 1]},${rgb[si + 2]}`;
  if (!colorMap.has(key)) {
    colorMap.set(key, palette.length);
    palette.push([rgb[si], rgb[si + 1], rgb[si + 2]]);
  }
  indices[i] = colorMap.get(key);
}

console.log(`Palette: ${palette.length} unique colours`);
console.log(`Pixel data: ${indices.length} bytes → ${Buffer.from(indices).toString('base64').length} base64 chars`);

const output = {
  name: 'keeper',
  size: S,
  paletteCount: palette.length,
  palette,
  pixels: Buffer.from(indices).toString('base64'),
};

const outPath = resolve(__dirname, '../src/images/keeper.pxl.json');
writeFileSync(outPath, JSON.stringify(output));
console.log(`Written to ${outPath}`);
