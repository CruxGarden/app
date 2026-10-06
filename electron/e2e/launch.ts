import { test, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fixtureKeychain } from './secret-storage-fixture';

/**
 * Launch the desktop app isolated from the developer's real data: a fresh
 * userData dir (SQLite + blobs + secrets) and a fresh Garden Root. Electron
 * must NOT inherit ELECTRON_RUN_AS_NODE from the shell.
 */
export async function launchApp(
  opts: {
    env?: Record<string, string>;
    dir?: string;
    sound?: boolean;
    args?: string[];
    openFiles?: string[];
    /** A fresh garden starts with AI tools on unless this is false (the product default is off). */
    ai?: boolean;
    /** The app's own tooltips over `title=` (off in the suite; see CRUX_PLAIN_TITLES). */
    titleTips?: boolean;
    /** Opt in only for a deliberate real OS-vault check; ordinary journeys use fixture encryption. */
    systemKeychain?: boolean;
  } = {},
): Promise<{ app: ElectronApplication; page: Page; dir: string }> {
  // Pass a previous run's `dir` to relaunch on the same garden (restart tests).
  const dir = opts.dir ?? mkdtempSync(join(tmpdir(), 'crux-e2e-'));
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  env.CRUX_TEST_PROFILE = dir;
  // Silent by default: the soundscape and cues are distracting while suites run.
  // Tests about sound pass `sound: true`.
  env.CRUX_SILENT = opts.sound ? '0' : '1';
  // AI tools on by default in the suite: most journeys drive the collaborator.
  // AI-off specs (and those that switch AI on themselves) pass `ai: false`.
  env.CRUX_AI = opts.ai === false ? 'off' : 'on';
  // Titles stay put unless a spec is about the app's tooltips: a shown tooltip
  // moves its control's title aside, and the pointer rests where tests leave it.
  env.CRUX_PLAIN_TITLES = opts.titleTips ? '0' : '1';
  Object.assign(env, opts.env);

  // Ubuntu runners (24.04+) restrict unprivileged user namespaces, so Chromium's
  // sandbox cannot start and firstWindow() times out. CI on Linux runs unsandboxed;
  // the sandbox is exercised by the macOS gate and by every developer run.
  // Chromium switches go before the app path: Electron reads `electron
  // [switches] <path>`, and anything after the path is handed to the app
  // instead. The performance suite passes --force-device-scale-factor=2,
  // because the plasma renderer sizes its canvas by min(devicePixelRatio,
  // quality) and at a scale factor of 1 every quality tier draws exactly the
  // same number of pixels — the sweep measures nothing.
  const executablePath = process.env.CRUX_PACKAGED_APP;
  const args = [...(opts.args ?? []), ...(executablePath ? [] : ['.']), ...(opts.openFiles ?? [])];
  if (process.platform === 'linux' && process.env.CI) args.push('--no-sandbox');
  // A journey that records passes CRUX_FAKE_MEDIA=1: the main process adds Chromium's fake camera
  // and microphone switches itself (see src/main.ts).
  const app = await electron.launch({
    args,
    cwd: join(__dirname, '..'),
    env,
    ...(executablePath ? { executablePath } : {}),
  });
  // Install before waiting for the renderer so restart reads use the same fixture key.
  if (!opts.systemKeychain) await fixtureKeychain(app, true);
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
      appLog = readFileSync(join(dir, 'userData', 'logs', 'main.log'), 'utf8').slice(-4000);
    } catch {
      /* the app never got as far as opening its log */
    }
    throw new Error(
      `${(err as Error).message}\n--- electron stdout/stderr ---\n${output || '(nothing printed)'}\n--- main.log ---\n${appLog}`,
      { cause: err },
    );
  }
  // Test teardown is intentionally noninteractive. Lifecycle tests exercise
  // the real close request explicitly; ordinary finally blocks must still
  // stop Electron and its managed servers after a failed assertion.
  const close = app.close.bind(app);
  const diagnostics = !!process.env.CRUX_E2E_DIAGNOSTICS;
  // Capture while the test is live: its timeout can expire before finally runs.
  const diagnosticInfo = diagnostics ? test.info() : undefined;
  if (diagnostics)
    // Playwright's HAR body collector can re-fetch a binary response through
    // Network.loadNetworkResource. Diagnostics must not repeat app requests
    // (or consume a second metered download), so retain actions/screenshots
    // without network/DOM snapshots. Failure screenshots/context remain below.
    await app.context().tracing.start({ screenshots: true, snapshots: false, sources: false });
  let diagnosticsSaved = false;
  const rendererErrors: string[] = [];
  page.on('pageerror', (error) => rendererErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') rendererErrors.push(message.text().slice(0, 1000));
    if (rendererErrors.length > 20) rendererErrors.shift();
  });
  app.close = async () => {
    if (diagnostics && !diagnosticsSaved) {
      diagnosticsSaved = true;
      let mainLog = '';
      try {
        mainLog = readFileSync(join(dir, 'userData', 'logs', 'main.log'), 'utf8')
          .split('\n')
          .filter((line) => /^\[.*\] (INFO|WARN|ERROR) /.test(line))
          .slice(-25)
          .map((line) => line.slice(0, 1500))
          .join('\n');
      } catch {
        /* No boot log was produced. */
      }
      try {
        // Persist before attaching: a timed-out test may reject attachment work.
        const info = diagnosticInfo!;
        const log = info.outputPath(`electron-${basename(dir)}.json`);
        writeFileSync(log, JSON.stringify({ rendererErrors, mainLog }, null, 2));
        const trace = info.outputPath(`electron-${basename(dir)}.zip`);
        await app.context().tracing.stop({ path: trace });
        await info.attach('isolated-runtime-diagnostics', {
          path: log,
          contentType: 'application/json',
        });
        await info.attach('electron-runtime-trace', { path: trace });
      } catch (error) {
        // Diagnostics must never prevent closing the isolated runtime.
        console.warn('Could not retain all runtime diagnostics:', error);
      }
    }
    await app
      .evaluate(({ ipcMain, BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows().find((w) => {
          const url = w.webContents.getURL();
          return (
            url.startsWith('crux-app://') ||
            (!!process.env.CRUX_DEV_SERVER && url.startsWith(process.env.CRUX_DEV_SERVER))
          );
        });
        if (window)
          ipcMain.emit(
            'workspace:close-guard',
            { sender: window.webContents, senderFrame: window.webContents.mainFrame },
            false,
          );
        // A native editor's late save/dirty update can remount the renderer's
        // close subscription between this evaluation and app.quit(). Teardown
        // is noninteractive: prevent it from rearming the guard after clearing it.
        ipcMain.removeAllListeners('workspace:close-guard');
      })
      .catch(() => {});
    await close();
  };
  try {
    // Vite loads the unbundled module graph on a cold start. Packaged/dist
    // journeys keep the normal deadline; dev-server jobs need extra time.
    await page.waitForLoadState('domcontentloaded', {
      timeout: env.CRUX_DEV_SERVER ? 90_000 : 30_000,
    });
  } catch (err) {
    await app.close().catch(() => {});
    throw err;
  }
  return { app, page, dir };
}
