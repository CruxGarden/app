import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync } from 'node:fs';
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
  // Keep what the main process prints: when no window ever appears, this is
  // the only evidence of why (a native module built for the wrong ABI, a
  // missing shared library, a thrown error before createWindow).
  let output = '';
  const keep = (chunk: Buffer) => {
    output = (output + chunk.toString()).slice(-4000);
  };
  app.process().stdout?.on('data', keep);
  app.process().stderr?.on('data', keep);
  let page: Page;
  try {
    page = await app.firstWindow();
  } catch (err) {
    // The app writes its own boot log beside the isolated userData (AppLog);
    // an uncaught error before the window exists lands there, not on stderr.
    let appLog = '(no main.log written)';
    try {
      appLog = readFileSync(join(env.CRUX_USER_DATA, 'logs', 'main.log'), 'utf8').slice(-4000);
    } catch {
      /* the app never got as far as opening its log */
    }
    throw new Error(
      `${(err as Error).message}\n--- electron stdout/stderr ---\n${output || '(nothing printed)'}\n--- main.log ---\n${appLog}`,
    );
  }
  await page.waitForLoadState('domcontentloaded');
  return { app, page, dir };
}
