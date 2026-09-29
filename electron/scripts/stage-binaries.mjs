#!/usr/bin/env node
/** Stage the target's verified FFmpeg pair and corresponding sources.
 * Called by electron-builder's beforePack hook, including direct CI invocations.
 * Pandoc/Typst remain optional host tools; never copy them for a foreign target.
 */
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stageFfmpegBundle, verifyFfmpegBundle } from './ffmpeg-bundle.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';
const exe = (name) => (isWindows ? `${name}.exe` : name);

/** Binaries that carry everything they need, so a copy is enough. */
const TOOLS = ['pandoc', 'typst'];

/** Where a build machine keeps the tools, best first. */
function findOnMachine(name) {
  const dirs = isMac
    ? ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin']
    : isWindows
      ? [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean)
      : ['/usr/bin', '/usr/local/bin', '/bin'];
  for (const part of (process.env.PATH ?? '').split(isWindows ? ';' : ':'))
    if (part) dirs.push(part);
  for (const dir of dirs) {
    const candidate = join(dir, exe(name));
    try {
      if (statSync(candidate).isFile()) return realpathSync(candidate);
    } catch {
      /* not there */
    }
  }
  return null;
}

function sizeOf(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    total += entry.isDirectory() ? sizeOf(p) : statSync(p).size;
  }
  return total;
}

export function stageBinaries(platform = process.platform, arch = process.arch) {
  const sourceBundle = join(root, '.native-tools', `${platform}-${arch}`);
  const target = join(root, 'resources', 'bin', arch);
  verifyFfmpegBundle(sourceBundle, platform, arch);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  stageFfmpegBundle(sourceBundle, target, platform, arch);
  let staged = 2;
  if (platform === process.platform && arch === process.arch) {
    for (const name of TOOLS) {
      const source = findOnMachine(name);
      if (!source) {
        console.log(`· ${name}: not on this machine — the app will use the person's own copy`);
        continue;
      }
      const to = join(target, exe(name));
      copyFileSync(source, to);
      chmodSync(to, 0o755);
      console.log(`✓ ${name}: ${source}`);
      staged++;
    }
  }
  console.log(
    `Staged ${staged} tools for ${platform}-${arch}, with FFmpeg sources (${(sizeOf(target) / 1048576).toFixed(1)} MB).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  stageBinaries();
