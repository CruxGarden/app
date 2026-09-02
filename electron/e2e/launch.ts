import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Launch the desktop app isolated from the developer's real data: a fresh
 * userData dir (SQLite + blobs + secrets) and a fresh Garden Root. Electron
 * must NOT inherit ELECTRON_RUN_AS_NODE from the shell.
 */
export async function launchApp(): Promise<{ app: ElectronApplication; page: Page; dir: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'crux-e2e-'));
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  env.CRUX_USER_DATA = join(dir, 'userData');
  env.CRUX_GARDEN_ROOT = join(dir, 'garden');

  const app = await electron.launch({ args: ['.'], cwd: join(__dirname, '..'), env });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page, dir };
}
