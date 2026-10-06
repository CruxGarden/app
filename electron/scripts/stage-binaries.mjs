#!/usr/bin/env node
/** Stage the target's verified FFmpeg pair and corresponding sources.
 * Called by electron-builder's beforePack hook, including direct CI invocations.
 * Pandoc/Typst remain optional user-installed tools. A build-machine install
 * is not a reviewed redistributable bundle; never copy it into a release.
 */
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stageFfmpegBundle, verifyFfmpegBundle } from './ffmpeg-bundle.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
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
  console.log(
    `Staged 2 tools for ${platform}-${arch}, with FFmpeg sources (${(sizeOf(target) / 1048576).toFixed(1)} MB).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  stageBinaries();
