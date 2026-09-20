#!/usr/bin/env node
/**
 * Stage the native binaries the app ships with.
 *
 * `src/media-binaries.ts` looks for them at
 * `<resources>/bin/<platform>-<arch>/<name>`, so this script fills
 * `resources/bin/<platform>-<arch>/` for the machine it runs on, and
 * electron-builder copies that folder into the app.
 *
 * Only binaries that carry everything they need are staged: a copy is the
 * whole job. ffmpeg and ffprobe arrive as npm packages and need no staging at
 * all; pandoc and typst are single static binaries, so they are copied from
 * the build machine's own install.
 *
 * ImageMagick is deliberately **not** staged. Its Homebrew build records
 * absolute paths in the binary, in nineteen libraries and in 131 libtool
 * archives, and loads its formats as modules, so shipping it would mean
 * rewriting all of that at build time — a different trick on each platform,
 * and one that breaks whenever the upstream build changes. The app uses
 * ImageMagick when the machine has it, and the picture recipes fall back to
 * ffmpeg when it does not.
 *
 * Run it with `npm run binaries:stage`; the `dist:*` scripts run it first.
 * Nothing here fails a build: a tool missing on the build machine is reported
 * and left out, and the app falls back to the visitor's own copy.
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
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const target = join(root, 'resources', 'bin', `${process.platform}-${process.arch}`);
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

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

let staged = 0;
for (const name of TOOLS) {
  const source = findOnMachine(name);
  if (!source) {
    console.log(`· ${name}: not on this machine — the app will use the visitor's own copy`);
    continue;
  }
  const to = join(target, exe(name));
  copyFileSync(source, to);
  chmodSync(to, 0o755);
  console.log(`✓ ${name}: ${source}`);
  staged++;
}

if (!staged) {
  rmSync(target, { recursive: true, force: true });
  console.log('Nothing staged.');
} else {
  console.log(
    `Staged ${staged} tool${staged === 1 ? '' : 's'} into resources/bin/${process.platform}-${process.arch} (${(sizeOf(target) / 1048576).toFixed(1)} MB).`,
  );
}
