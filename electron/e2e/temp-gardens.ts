import { readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Temp Gardens: every launchApp() makes a throwaway userData + Garden Root
 * under the system temp folder, and since the toolchain work each one can
 * carry a pnpm store and installed Astro projects. Left alone they filled a
 * disk (2026-09-14). The Playwright global setup removes leftovers older than
 * STALE_MS (a crashed or killed run), the global teardown removes this run's
 * gardens but keeps the newest KEEP_NEWEST so a failure can still be inspected.
 * CRUX_E2E_KEEP=1 turns both off.
 */
const PREFIXES = [
  'crux-e2e-',
  'crux-kan-rebuild-', // standalone source-rebuild proof from kan-app.spec.ts
  'crux-vault-fixture-',
  'crux-archives-',
  'crux-store-',
  'crux-packaged-',
  'crux-paths-',
];
const STALE_MS = 12 * 60 * 60 * 1000;
const KEEP_NEWEST = 3;

export function listTempGardens(): { path: string; mtime: number }[] {
  const root = tmpdir();
  let names: string[];
  try {
    names = readdirSync(root);
  } catch {
    return [];
  }
  const found: { path: string; mtime: number }[] = [];
  for (const name of names) {
    if (!PREFIXES.some((p) => name.startsWith(p))) continue;
    const path = join(root, name);
    try {
      const stat = statSync(path);
      if (stat.isDirectory()) found.push({ path, mtime: stat.mtimeMs });
    } catch {
      /* gone meanwhile */
    }
  }
  return found.sort((a, b) => b.mtime - a.mtime);
}

function remove(paths: string[], why: string) {
  if (!paths.length) return;
  let freed = 0;
  for (const path of paths) {
    try {
      rmSync(path, { recursive: true, force: true, maxRetries: 3 });
      freed++;
    } catch (error) {
      console.warn(`[temp-gardens] could not remove ${path}: ${(error as Error).message}`);
    }
  }
  console.log(`[temp-gardens] removed ${freed} ${why}`);
}

/** Before a run: leftovers older than STALE_MS from runs that never reached teardown. */
export function sweepStaleTempGardens(now = Date.now()) {
  if (process.env.CRUX_E2E_KEEP === '1') return;
  remove(
    listTempGardens()
      .filter((g) => now - g.mtime > STALE_MS)
      .map((g) => g.path),
    'stale temp Gardens from earlier runs',
  );
}

/** After a run: everything but the newest few, kept for inspecting a failure. */
export function sweepTempGardens(keepNewest = KEEP_NEWEST) {
  if (process.env.CRUX_E2E_KEEP === '1') return;
  remove(
    listTempGardens()
      .slice(keepNewest)
      .map((g) => g.path),
    `temp Gardens (kept the newest ${keepNewest}; CRUX_E2E_KEEP=1 keeps all)`,
  );
}
