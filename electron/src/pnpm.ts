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

/** Environment for a pnpm child process (Electron-as-Node, non-interactive). */
export function pnpmEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    // Non-interactive; no update banners in captured logs
    CI: '1',
    PNPM_HOME: path.join(app.getPath('userData'), 'pnpm'),
    ...extra,
  };
}
