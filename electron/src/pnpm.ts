const { app } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * The bundled pnpm (ADR 0004) — one definition shared by the toolchain and the
 * dev server, which each had their own copy with divergent environments (only
 * one set PNPM_HOME, so the two spawn paths used different global stores).
 */

export function pnpmEntry(): string {
  // Dev: electron/node_modules. Packaged: asar-unpacked (a plain-Node child
  // process cannot read scripts inside app.asar).
  const candidates = [
    path.join(app.getAppPath(), 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
    path.join(
      process.resourcesPath || '',
      'app.asar.unpacked',
      'node_modules',
      'pnpm',
      'bin',
      'pnpm.cjs',
    ),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('bundled pnpm not found');
}

/**
 * A directory holding a `node` that is really this Electron binary in Node
 * mode. pnpm runs package binaries (`astro`, postinstall scripts) through the
 * `node` on PATH — not through the process that launched pnpm — so without
 * this the packaged app depends on whatever Node the user happens to have:
 * none when launched from Finder (the dev server "exited before becoming
 * ready"), or an ancient system one ("Node.js v14 is not supported by
 * Astro"). Development hid it because a shell with a modern Node was always
 * present. Written once per userData and refreshed when the binary moves.
 */
export function nodeShimDir(): string {
  const dir = path.join(app.getPath('userData'), 'node-shim');
  fs.mkdirSync(dir, { recursive: true });
  if (process.platform === 'win32') {
    const cmd = path.join(dir, 'node.cmd');
    const body = `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${process.execPath}" %*\r\n`;
    if (!fs.existsSync(cmd) || fs.readFileSync(cmd, 'utf8') !== body) fs.writeFileSync(cmd, body);
  } else {
    const sh = path.join(dir, 'node');
    const body = `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${process.execPath}" "$@"\n`;
    if (!fs.existsSync(sh) || fs.readFileSync(sh, 'utf8') !== body) {
      fs.writeFileSync(sh, body);
    }
    fs.chmodSync(sh, 0o755);
  }
  return dir;
}

/** Environment for a pnpm child process (Electron-as-Node, non-interactive). */
export function pnpmEnv(extra: Record<string, string> = {}): Record<string, string> {
  const shim = nodeShimDir();
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    // Non-interactive; no update banners in captured logs
    CI: '1',
    PNPM_HOME: path.join(app.getPath('userData'), 'pnpm'),
    // Our own `node` first: package binaries and lifecycle scripts run on
    // Electron's Node, never on whatever the user's PATH holds (or lacks).
    PATH: [shim, process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin'].join(path.delimiter),
    ...extra,
  };
}
