import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Launch the desktop app isolated from the developer's real data: a fresh
 * userData dir (SQLite + blobs + secrets) and a fresh Garden Root. Electron
 * must NOT inherit ELECTRON_RUN_AS_NODE from the shell.
 */
export async function launchApp(
  opts: { env?: Record<string, string>; dir?: string } = {},
): Promise<{ app: ElectronApplication; page: Page; dir: string }> {
  // Pass a previous run's `dir` to relaunch on the same garden (restart tests).
  const dir = opts.dir ?? mkdtempSync(join(tmpdir(), 'crux-e2e-'));
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  env.CRUX_USER_DATA = join(dir, 'userData');
  env.CRUX_GARDEN_ROOT = join(dir, 'garden');
  Object.assign(env, opts.env);

  // Ubuntu runners (24.04+) restrict unprivileged user namespaces, so Chromium's
  // sandbox cannot start and firstWindow() times out. CI on Linux runs unsandboxed;
  // the sandbox is exercised by the macOS gate and by every developer run.
  const args = ['.'];
  if (process.platform === 'linux' && process.env.CI) args.push('--no-sandbox');
  const app = await electron.launch({ args, cwd: join(__dirname, '..'), env });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page, dir };
}
