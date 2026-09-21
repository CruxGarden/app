import type { AgentRuntimeDeps } from './agent-runtime';
const {
  app,
  BrowserWindow,
  ipcMain,
  protocol,
  dialog,
  shell,
  desktopCapturer,
  net,
} = require('electron');
const { Readable } = require('node:stream');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { SqliteNative } = require('./sqlite-native');
const { SecretStore } = require('./secrets');
const { DesktopConfig, ProjectFolders } = require('./projects');
const { ProjectWatcher } = require('./watcher');
const { PreviewServer } = require('./preview-server');
const { Toolchain } = require('./toolchain');
const { DevServerManager } = require('./dev-server');
const { AppLog } = require('./log');
const { Updater } = require('./updater');
const { AgentHost } = require('./mcp-server');
const { AgentProvider } = require('./agent-provider');
const { AgentRuntimeRegistry, AgentToolBroker } = require('./agent-runtime');
const { CodexProvider } = require('./codex-provider');

// ffmpeg-static provides a bundled ffmpeg binary
let ffmpegPath: string;
try {
  ffmpegPath = require('ffmpeg-static');
} catch {
  ffmpegPath = '';
}

let mainWindow: any = null;
// Docked mode (GARDEN-SCHEDULER-PLAN): closing the window hides it; the app
// lives on in the menu bar until Quit. `quitting` tells the close handler the
// difference between the red button and Cmd+Q / the tray's Quit.
let docked = false;
let quitting = false;
let tray: any = null;
function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  mainWindow.show();
  mainWindow.focus();
}
function setDocked(on: boolean) {
  docked = on;
  if (on && !tray) {
    const { Tray, Menu, nativeImage } = require('electron');
    const image = nativeImage
      .createFromPath(path.join(__dirname, '../build/icon.png'))
      .resize({ width: 18, height: 18 });
    if (process.platform === 'darwin') image.setTemplateImage(false);
    tray = new Tray(image);
    tray.setToolTip('Crux Garden');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open Crux Garden', click: () => showMainWindow() },
        { type: 'separator' },
        {
          label: 'Quit Crux Garden',
          click: () => {
            quitting = true;
            app.quit();
          },
        },
      ]),
    );
    tray.on('click', () => showMainWindow());
  } else if (!on && tray) {
    tray.destroy();
    tray = null;
  }
}
let workspaceCloseGuard = false;
let workspaceClosePending = false;
let workspaceMayClose = false;
function requestWorkspaceClose(event: any): boolean {
  if (!workspaceCloseGuard || workspaceMayClose || !mainWindow) return false;
  event.preventDefault();
  if (!workspaceClosePending) {
    workspaceClosePending = true;
    mainWindow.webContents.send('workspace:close-request');
  }
  return true;
}
ipcMain.on('workspace:close-guard', (event: any, enabled: boolean) => {
  if (event.sender === mainWindow?.webContents) workspaceCloseGuard = enabled;
});
ipcMain.on('workspace:close-response', (event: any, approved: boolean) => {
  if (event.sender !== mainWindow?.webContents || !workspaceClosePending) return;
  workspaceClosePending = false;
  if (approved) {
    workspaceMayClose = true;
    app.quit();
  }
});
let db: any = null;
let watcher: any = null;
let previewServer: any = null;
let devServers: any = null;
let agentHost: any = null;
let agentProvider: any = null;
// References for the CRUX_SELFTEST integration test (see selftest.ts)
const selfTestHooks: { secrets?: any; projects?: any; toolchain?: any } = {};

const isDev = !app.isPackaged;

// Identity. Packaged builds are "Crux Garden" (Info.plist), so userData is
// ~/Library/Application Support/Crux Garden — where users' gardens live from the
// first release on. Dev keeps Electron's default (the package name) so a dev
// database never collides with the installed app's. The name is set before any
// getPath() call so both paths are stable. CRUX_USER_DATA overrides it so
// automated UI tests (Playwright) run against a throwaway database.
if (app.isPackaged) app.setName('Crux Garden');
// Test-only (read like the other CRUX_* knobs): Chromium's fake camera and microphone, and no
// media prompts, so a recording journey runs without hardware or a permission dialog.
if (process.env.CRUX_FAKE_MEDIA) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
}
const userDataPath = process.env.CRUX_USER_DATA || app.getPath('userData');
app.setPath('userData', userDataPath);
// Logs: installed builds write to the OS logs folder (macOS: ~/Library/Logs/Crux
// Garden). Dev and isolated test runs write beside their own userData so they
// never share a main.log with the installed app. Always on, never sent (ADR 0008).
const logsDir =
  isDev || process.env.CRUX_USER_DATA ? path.join(userDataPath, 'logs') : app.getPath('logs');
const appLog = new AppLog(logsDir);
appLog.attach(process, app);
// Isolated runs (Playwright, CI) have nobody to dismiss Electron's error dialog:
// an uncaught error before the window exists would sit there until the test
// times out with nothing on stderr. Say it and exit instead.
if (process.env.CRUX_USER_DATA) {
  const fatal = (kind: string) => (err: unknown) => {
    console.error(`[main] ${kind}: ${(err as Error)?.stack || String(err)}`);
    app.exit(1);
  };
  process.on('uncaughtException', fatal('uncaught'));
  // A native module built for the wrong ABI surfaces here (dynamic import).
  process.on('unhandledRejection', fatal('unhandled rejection'));
}
function debugLog(msg: string) {
  appLog.info(msg);
}
debugLog(
  `Starting Crux Garden ${app.getVersion()}. isDev=${isDev}, isPackaged=${app.isPackaged}, ffmpeg=${ffmpegPath}`,
);

function getDbPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'cruxgarden.db');
}

function getBlobDir(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'blobs');
}

/**
 * Local inference CORS shim (Phase A4): the AI SDK runs in the renderer, whose
 * origin is crux-app:// (packaged) or the Vite dev server. Ollama / LM Studio
 * only accept browser requests from localhost origins, so rewrite the Origin
 * on requests to their ports and stamp permissive CORS on the responses.
 *
 * SCOPING IS THE WHOLE SECURITY STORY. webRequest filters match on URL only,
 * and this session is shared with every iframe in the app — including
 * `{cruxId}.publish.crux.garden` pages (other people's published cruxes) and
 * AI-authored preview content. Unscoped, this shim would hand any of them the
 * user's local model server, and the forged Origin would defeat OLLAMA_ORIGINS,
 * the one control Ollama ships for exactly this. So: the app's own top-level
 * document gets the shim; everything else is blocked outright.
 */
const LOCAL_AI_URLS = [
  'http://127.0.0.1:11434/*',
  'http://localhost:11434/*',
  'http://127.0.0.1:1234/*',
  'http://localhost:1234/*',
];

/** True only for requests issued by the app's own top-level document. */
function isAppTopFrame(details: any): boolean {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (!details.webContents || details.webContents.id !== mainWindow.webContents.id) return false;
  const frame = details.frame;
  // No frame info (or a subframe) → not the app document. Iframes never qualify.
  return !!frame && frame.parent === null;
}

function setupLocalAiCors(session: any) {
  session.webRequest.onBeforeSendHeaders({ urls: LOCAL_AI_URLS }, (details: any, callback: any) => {
    if (!isAppTopFrame(details)) {
      callback({ cancel: true });
      return;
    }
    details.requestHeaders['Origin'] = 'http://localhost';
    callback({ requestHeaders: details.requestHeaders });
  });
  session.webRequest.onHeadersReceived({ urls: LOCAL_AI_URLS }, (details: any, callback: any) => {
    if (!isAppTopFrame(details)) {
      callback({});
      return;
    }
    const headers = details.responseHeaders ?? {};
    // Replace whatever the server sent — the renderer origin must pass
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase().startsWith('access-control-')) delete headers[key];
    }
    headers['Access-Control-Allow-Origin'] = ['*'];
    headers['Access-Control-Allow-Headers'] = ['*'];
    headers['Access-Control-Allow-Methods'] = ['GET, POST, OPTIONS'];
    callback({ responseHeaders: headers });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(
      __dirname,
      '../build/icon' +
        (process.platform === 'win32' ? '.ico' : process.platform === 'darwin' ? '.icns' : '.png'),
    ),
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Schedules tick in the window; a hidden window in docked mode must
      // keep its timers.
      backgroundThrottling: false,
    },
  });

  setupLocalAiCors(mainWindow.webContents.session);
  // Screen capture for embedded apps (Record): the system picker where the OS has one (macOS 15+),
  // otherwise the primary screen with system audio.
  // Camera and microphone for embedded apps (Record): the OS asks its own question; Electron's
  // request is answered yes so the app can proceed to it. Everything else keeps Electron's default.
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents: any, _permission: string, callback: any) => callback(true),
  );
  // The synchronous check gates media in cross-origin frames (the Workshop's app frame):
  // camera and microphone are a person's to grant in the OS dialog, so the app may ask.
  mainWindow.webContents.session.setPermissionCheckHandler(
    (_webContents: any, _permission: string) => true,
  );
  mainWindow.webContents.session.setDisplayMediaRequestHandler(
    (_request: any, callback: any) => {
      desktopCapturer
        .getSources({ types: ['screen', 'window'] })
        .then((sources: any[]) => {
          if (!sources.length) return callback({});
          callback({ video: sources[0], audio: 'loopback' });
        })
        .catch(() => callback({}));
    },
    { useSystemPicker: true },
  );
  let cyclingWorkspaces = false;
  mainWindow.webContents.on('before-input-event', (event: any, input: any) => {
    if (input.isComposing || input.modifiers?.includes('altgr')) return;
    const down = input.type === 'keyDown';
    const search =
      down && (input.control || input.meta) && input.alt && input.key?.toLowerCase() === 'k';
    const cycle = down && input.control && input.key === 'Tab';
    const commit = input.type === 'keyUp' && input.key === 'Control' && cyclingWorkspaces;
    const cancel = down && input.key === 'Escape' && cyclingWorkspaces;
    if (!search && !cycle && !commit && !cancel) return;
    event.preventDefault();
    // A cross-origin frame can retain the native keyboard target after DOM focus changes.
    if (search || cycle) mainWindow.webContents.focus();
    if (cycle) cyclingWorkspaces = true;
    if (commit || cancel) cyclingWorkspaces = false;
    mainWindow.webContents.send(
      'workspace:command',
      search
        ? 'search'
        : cycle
          ? input.shift
            ? 'previous'
            : 'next'
          : commit
            ? 'commit'
            : 'cancel',
    );
  });
  mainWindow.on('blur', () => {
    if (cyclingWorkspaces) {
      cyclingWorkspaces = false;
      mainWindow?.webContents.send('workspace:command', 'cancel');
    }
  });
  mainWindow.on('close', (event: any) => {
    // The red button in docked mode: put the window away, keep the garden running.
    if (docked && !quitting) {
      event.preventDefault();
      mainWindow.hide();
      return;
    }
    requestWorkspaceClose(event);
  });

  // The preload re-runs on every top-level navigation, so navigating this
  // window anywhere else would hand `electronAPI` — BYOK secrets, raw SQL,
  // filesystem access, `pnpm dlx` — to that page. Nothing may navigate the
  // shell: in-app routing is client-side, and real links open in the browser.
  const isAppUrl = (target: string) => {
    if (target.startsWith('crux-app://')) return true;
    const dev = process.env.CRUX_DEV_SERVER;
    return !!dev && target.startsWith(dev);
  };

  mainWindow.webContents.on('will-navigate', (event: any, target: string) => {
    if (!isAppUrl(target)) event.preventDefault();
  });
  mainWindow.webContents.on('will-redirect', (event: any, target: string) => {
    if (!isAppUrl(target)) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
    // Popups never inherit the app context; http(s) goes to the real browser.
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Default: serve the built web app from dist/ (bundled resources when
  // packaged). A Vite dev server is opt-in via CRUX_DEV_SERVER for HMR work.
  const devServerUrl = process.env.CRUX_DEV_SERVER;
  if (devServerUrl) {
    debugLog(`Loading from dev server: ${devServerUrl}`);
    mainWindow.loadURL(devServerUrl);
  } else {
    const indexPath = path.join(getWebAppDir(), 'index.html');
    if (!fs.existsSync(indexPath)) {
      debugLog(
        `No built web app at ${indexPath} — run "npm run build:web" (or set CRUX_DEV_SERVER)`,
      );
    }
    mainWindow.loadURL('crux-app:///index.html');
  }

  mainWindow.webContents.on('did-fail-load', (_e: any, code: number, desc: string, url: string) => {
    debugLog(`did-fail-load: ${code} ${desc} ${url}`);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    debugLog('Page loaded successfully');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── SQLite IPC handlers ──────────────────────────────────────

function setupIpc() {
  db = new SqliteNative(getDbPath(), getBlobDir());

  ipcMain.handle('sqlite:run', (_e: any, sql: string, params?: unknown[]) => {
    return db.run(sql, params);
  });

  ipcMain.handle('sqlite:get', (_e: any, sql: string, params?: unknown[]) => {
    return db.get(sql, params);
  });

  ipcMain.handle('sqlite:all', (_e: any, sql: string, params?: unknown[]) => {
    return db.all(sql, params);
  });

  ipcMain.handle('sqlite:export', () => {
    return db.export();
  });

  ipcMain.handle('sqlite:import', (_e: any, data: ArrayBuffer) => {
    return db.import(data);
  });

  ipcMain.handle('sqlite:close', () => {
    return db.close();
  });

  // Blob storage
  ipcMain.handle('sqlite:blob-write', (_e: any, fingerprint: string, data: Uint8Array) => {
    return db.blobWrite(fingerprint, data);
  });

  ipcMain.handle('sqlite:blob-read', (_e: any, fingerprint: string) => {
    return db.blobRead(fingerprint);
  });

  ipcMain.handle('sqlite:blob-delete', (_e: any, fingerprint: string) => {
    return db.blobDelete(fingerprint);
  });

  ipcMain.handle('sqlite:blob-exists', (_e: any, fingerprint: string) => {
    return db.blobExists(fingerprint);
  });

  ipcMain.handle('sqlite:blob-wipe-all', () => {
    return db.blobWipeAll();
  });

  // ── Secrets (BYOK API keys — safeStorage, never in SQLite) ──
  const secrets = new SecretStore(app.getPath('userData'));
  selfTestHooks.secrets = secrets;

  ipcMain.handle('secrets:available', () => secrets.available());
  ipcMain.handle('secrets:get', (_e: any, key: string) => secrets.get(key));
  ipcMain.handle('secrets:set', (_e: any, key: string, value: string) => secrets.set(key, value));
  ipcMain.handle('secrets:delete', (_e: any, key: string) => secrets.delete(key));

  // ── Local inference (Ollama / LM Studio, Phase A4) ──────────
  const { detectLocalAi } = require('./localai');
  ipcMain.handle('localai:detect', () => detectLocalAi());

  // ── Project Folders (ADR 0001) ──────────────────────────────
  const desktopConfig = new DesktopConfig(app.getPath('userData'));
  const projects = new ProjectFolders(desktopConfig);
  selfTestHooks.projects = projects;

  if (process.platform === 'darwin') {
    const { FigmaDesktop } = require('./figma-desktop');
    const { screen, systemPreferences } = require('electron');
    const figmaDesktop = new FigmaDesktop(() => mainWindow, screen, systemPreferences);
    const { CompanionDesktop } = require('./companion-desktop');
    const blenderDesktop = new CompanionDesktop(
      () => mainWindow,
      screen,
      systemPreferences,
      'blender',
    );
    const trustedFigmaCaller = (event: any) => {
      if (
        event.sender !== mainWindow?.webContents ||
        event.senderFrame !== mainWindow?.webContents.mainFrame
      )
        throw new Error('Window placement is only available from Garden.');
    };
    ipcMain.handle('blender:open', (event: any) => {
      trustedFigmaCaller(event);
      return blenderDesktop.open();
    });
    ipcMain.handle('blender:status', (event: any) => {
      trustedFigmaCaller(event);
      return blenderDesktop.status();
    });
    ipcMain.handle('blender:arrange', (event: any, side: 'left' | 'right') => {
      trustedFigmaCaller(event);
      return blenderDesktop.arrange(side);
    });
    ipcMain.handle('blender:restore', (event: any) => {
      trustedFigmaCaller(event);
      return blenderDesktop.restore();
    });
    ipcMain.handle('figma:open', (event: any) => {
      trustedFigmaCaller(event);
      return figmaDesktop.open();
    });
    ipcMain.handle('figma:status', (event: any) => {
      trustedFigmaCaller(event);
      return figmaDesktop.status();
    });
    ipcMain.handle('figma:arrange', (event: any, side: 'left' | 'right') => {
      trustedFigmaCaller(event);
      return figmaDesktop.arrange(side);
    });
    ipcMain.handle('figma:restore', (event: any) => {
      trustedFigmaCaller(event);
      return figmaDesktop.restore();
    });
  }

  ipcMain.handle('desktop:config', () => ({
    gardenRoot: desktopConfig.gardenRoot,
  }));

  ipcMain.handle('desktop:choose-garden-root', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose your Garden folder',
      defaultPath: desktopConfig.gardenRoot,
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Use This Folder',
    });
    if (result.canceled || !result.filePaths[0]) return null;
    desktopConfig.setGardenRoot(result.filePaths[0]);
    projects.ensureGardenRoot();
    return result.filePaths[0];
  });

  // Watcher: external edits flow disk → store (ADR 0001 invariant)
  watcher = new ProjectWatcher(
    (batch: unknown) => {
      mainWindow?.webContents.send('project:changed', batch);
    },
    (absPath: string) => projects.ownWriteMtime(absPath),
  );

  // Watch every registered Project Folder from the start — external edits
  // count whether or not the crux is open in the app.
  try {
    const rows = db.all("SELECT meta FROM cruxes WHERE type = 'workspace'") || [];
    let watched = 0;
    for (const row of rows) {
      try {
        const meta = JSON.parse(row.meta || '{}');
        if (typeof meta.projectFolder === 'string') {
          watcher.watch(meta.projectFolder);
          watched++;
        }
      } catch {
        /* bad meta row — skip */
      }
    }
    for (const copy of db.all("SELECT project_folder FROM working_copies WHERE phase = 'ready'") ||
      []) {
      if (copy.project_folder) watcher.watch(copy.project_folder);
    }
    debugLog(`Watcher bootstrap: watching ${watched} project folder(s)`);
  } catch (err: any) {
    debugLog(`Watcher bootstrap failed: ${err?.message}`);
  }

  ipcMain.handle('project:create-folder', (_e: any, slug: string) => {
    const folder = projects.createFolder(slug);
    watcher.watch(folder);
    return folder;
  });
  ipcMain.handle('project:ensure-folder', (_e: any, folder: string) => {
    const resolved = projects.ensureFolder(folder);
    watcher.watch(resolved);
    return resolved;
  });
  ipcMain.handle('project:folder-exists', (_e: any, folder: string) =>
    projects.folderExists(folder),
  );
  ipcMain.handle(
    'project:write-file',
    (_e: any, folder: string, relPath: string, data: Uint8Array) => {
      return projects.writeFile(folder, relPath, data);
    },
  );
  ipcMain.handle('project:read-file', (_e: any, folder: string, relPath: string) =>
    projects.readFile(folder, relPath),
  );
  ipcMain.handle('project:delete-file', (_e: any, folder: string, relPath: string) => {
    return projects.deleteFile(folder, relPath);
  });
  ipcMain.handle(
    'project:rename-file',
    (_e: any, folder: string, fromRel: string, toRel: string) => {
      return projects.renameFile(folder, fromRel, toRel);
    },
  );
  ipcMain.handle('project:reveal', (_e: any, folder: string, relPath?: string) =>
    projects.reveal(folder, relPath),
  );
  ipcMain.handle('project:watch', (_e: any, folder: string) => watcher.watch(folder));
  ipcMain.handle('project:unwatch', (_e: any, folder: string) => watcher.unwatch(folder));
  // Cut the watcher's debounce short: the batches come back on the reply (an event sent
  // during the handler could arrive after it), and the renderer records them itself.
  ipcMain.handle('project:flush', (_e: any, folder?: string) => watcher?.flush(folder) ?? []);
  ipcMain.handle('project:list-files', (_e: any, folder: string) => projects.listFiles(folder));
  ipcMain.handle('project:capture', (_e: any, folder: string) => projects.capture(folder));
  ipcMain.handle('project:set-mode', (_e: any, folder: string, relPath: string, mode: number) =>
    projects.setMode(folder, relPath, mode),
  );
  ipcMain.handle(
    'project:materialize',
    (_e: any, folder: string, entries: { path: string; fingerprint: string; mode?: number }[]) =>
      projects.materialize(folder, getBlobDir(), entries),
  );

  // ── Preview server (ADR 0003) ───────────────────────────────
  previewServer = new PreviewServer((folder: string) => projects.resolveKnownFolder(folder));

  ipcMain.handle('preview:start', (_e: any, folder: string) => previewServer.start(folder));
  ipcMain.handle('preview:stop', (_e: any, folder: string) => previewServer.stop(folder));

  // Screenshot a local preview URL in a hidden window (snapshot thumbnails —
  // desktop preview has no injected capture script, ADR 0003).
  const { capturePreviewUrl } = require('./capture');
  ipcMain.handle('preview:capture', (_e: any, url: string) => capturePreviewUrl(url));

  // Open a local preview URL in the default browser — locked to loopback
  ipcMain.handle('desktop:open-external', (_e: any, url: string) => {
    if (/^http:\/\/127\.0\.0\.1:\d+(\/|$)/.test(url)) shell.openExternal(url);
  });

  // https only — never file:, never the app's own scheme
  ipcMain.handle('desktop:open-web', (_e: any, url: string) => {
    if (/^https:\/\/[^\s]+$/i.test(url)) shell.openExternal(url);
  });

  // logsDir / userDataDir are shown in Settings → Desktop so a user can find and
  // attach their own logs. They are local filesystem paths that reveal the account
  // name: they must never be put into any telemetry or crash-report payload (ADR 0008).
  ipcMain.handle('desktop:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
    arch: process.arch,
    packaged: app.isPackaged,
    logsDir,
    userDataDir: app.getPath('userData'),
  }));
  ipcMain.handle('desktop:set-docked', (_e: any, on: boolean) => setDocked(!!on));
  ipcMain.handle('desktop:open-logs', () => {
    shell.openPath(logsDir);
  });

  // ── Updates (ADR 0007): GitHub Releases via electron-updater ─────
  const updater = new Updater({
    app,
    autoCheck: () => desktopConfig.autoUpdate,
    setAutoCheck: (on: boolean) => desktopConfig.setAutoUpdate(on),
    log: appLog,
    onChange: (state: any) => {
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send('updates:changed', state);
    },
  });
  ipcMain.handle('updates:state', () => updater.getState());
  ipcMain.handle('updates:check', () => updater.check());
  ipcMain.handle('updates:download', () => updater.download());
  ipcMain.handle('updates:install', () => updater.install());
  ipcMain.handle('updates:set-auto', (_e: any, on: boolean) => updater.setAutoCheck(!!on));
  if (!process.env.CRUX_USER_DATA) updater.scheduleLaunchCheck();

  // ── Agent Host (ADR 0013): one MCP server per switched-on crux ──────
  // Servers live here; every tool call is forwarded to the renderer, which
  // runs the same executor the built-in collaborator uses.
  const lookupCrux = (cruxId: string) => {
    const row = db.get('SELECT slug, title, meta FROM cruxes WHERE id = ? AND deleted IS NULL', [
      cruxId,
    ]);
    if (!row) {
      const copy = db.get(
        "SELECT w.project_folder, w.title FROM working_copies w JOIN cruxes c ON c.id = w.crux_id WHERE w.id = ? AND w.phase = 'ready' AND w.role = 'task' AND c.deleted IS NULL",
        [cruxId],
      );
      return copy?.project_folder
        ? { slug: `task-${cruxId}`, title: copy.title, folder: copy.project_folder }
        : null;
    }
    try {
      const meta = JSON.parse(row.meta || '{}');
      if (typeof meta.projectFolder !== 'string') return null;
      return { slug: row.slug, title: row.title || '', folder: meta.projectFolder };
    } catch {
      return null;
    }
  };
  // ── Native tools (MAKING-THE-AD-PARITY gap 13) ──────────────────────
  // Run a media binary inside a crux's Project Folder: ffmpeg, ffprobe or
  // ImageMagick, each resolved per platform (media-binaries.ts). The working
  // directory is the folder; every path-like argument must stay inside it;
  // only the `file` protocol is allowed; no shell is involved.
  ipcMain.handle('native:tools', async (_e: any, opts?: { refresh?: boolean }) => {
    const { mediaTools, clearMediaToolCache } =
      require('./media-binaries') as typeof import('./media-binaries');
    const { canInstall } = require('./media-install') as typeof import('./media-install');
    if (opts?.refresh) clearMediaToolCache();
    const found = await mediaTools(
      app.isPackaged ? process.resourcesPath : null,
      false,
      app.getPath('userData'),
    );
    return found.map((info) => ({ ...info, installable: !info.path && canInstall(info.tool) }));
  });

  /**
   * A document to PDF. Pandoc cannot make one without a PDF engine (LaTeX,
   * gigabytes), so it writes a standalone page and the app prints it in a
   * locked-down hidden window — see print-pdf.ts. An HTML source skips the
   * first step.
   */
  ipcMain.handle(
    'native:pdf',
    async (
      _e: any,
      opts: { cruxId: string; path: string; out?: string; pageSize?: string; landscape?: boolean },
    ) => {
      const { mediaToolPath } = require('./media-binaries') as typeof import('./media-binaries');
      const { printHtmlToPdf } = require('./print-pdf') as typeof import('./print-pdf');
      const crux = lookupCrux(opts.cruxId);
      if (!crux) throw new Error('This crux has no Project Folder');
      const folder = path.resolve(crux.folder);
      const source = String(opts.path ?? '');
      if (!source || source.startsWith('/') || source.includes('..'))
        throw new Error(`Use paths relative to the crux folder: ${source}`);
      const base =
        source
          .replace(/\.[^./]+$/, '')
          .split('/')
          .pop() || 'document';
      const out = String(opts.out ?? `exports/${base}.pdf`);
      if (out.startsWith('/') || out.includes('..'))
        throw new Error(`Use paths relative to the crux folder: ${out}`);

      const resources = app.isPackaged ? process.resourcesPath : null;
      const userData = app.getPath('userData');
      const pandoc = await mediaToolPath('pandoc', resources, userData);
      const isHtml = /\.html?$/i.test(source);

      // Typst really typesets — page breaks, page numbers, a table of
      // contents — so it is the engine when the machine has it. Its template
      // insists on a font that exists, and if anything about that fails the
      // browser route below still makes a PDF.
      const typst = await mediaToolPath('typst', resources, userData);
      if (!isHtml && pandoc && typst) {
        const { typstFont } = require('./print-pdf') as typeof import('./print-pdf');
        const font = await typstFont(typst);
        const viaTypst = await new Promise<string | null>((resolve) => {
          execFile(
            pandoc,
            [source, '--pdf-engine', typst, ...(font ? ['-V', `mainfont=${font}`] : []), '-o', out],
            { cwd: folder, timeout: 5 * 60_000 },
            (error: Error | null, _stdout: string, stderr: string) =>
              resolve(error ? String(stderr || error.message).slice(0, 500) : null),
          );
        });
        if (!viaTypst) {
          const at = path.join(folder, out);
          return {
            path: out,
            bytes: fs.existsSync(at) ? fs.statSync(at).size : 0,
            engine: 'typst',
          };
        }
        appLog.info(`[pdf] typst declined, printing instead: ${viaTypst}`);
      }

      let page = source;
      let temporary: string | null = null;
      if (!isHtml) {
        if (!pandoc)
          throw new Error('Pandoc is needed to turn this into a page first, and it is missing.');
        temporary = `.crux/print/${base}.html`;
        fs.mkdirSync(path.join(folder, '.crux', 'print'), { recursive: true });
        await new Promise<void>((resolve, reject) => {
          execFile(
            pandoc,
            [source, '--standalone', '--embed-resources', '-o', temporary!],
            { cwd: folder, timeout: 5 * 60_000 },
            (error: Error | null, _stdout: string, stderr: string) =>
              error ? reject(new Error(String(stderr || error.message).slice(0, 2000))) : resolve(),
          );
        });
        page = temporary;
      }
      try {
        const { bytes } = await printHtmlToPdf(folder, page, out, {
          pageSize: opts.pageSize,
          landscape: opts.landscape,
        });
        return { path: out, bytes, engine: 'browser' };
      } finally {
        // The intermediate page is scaffolding, and .crux/ is never ingested.
        if (temporary) fs.rmSync(path.join(folder, temporary), { force: true });
      }
    },
  );

  // Containers: a Crux's own stack, through Docker Compose (see containers.ts).
  /**
   * The Project runner: code that lives outside the Crux, run from it.
   *
   * Choosing a folder is the approval — it is the only call that grants one,
   * and it goes through the OS dialog, so nothing a Crux carries can point the
   * app at a folder the person never picked.
   */
  ipcMain.handle('project:choose', async () => {
    const { approveFolder, readProject } =
      require('./project-runner') as typeof import('./project-runner');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose the project to run',
      properties: ['openDirectory'],
      buttonLabel: 'Use This Folder',
    });
    const folder = result.canceled ? null : result.filePaths[0];
    if (!folder) return null;
    approveFolder(folder);
    return readProject(folder);
  });

  ipcMain.handle('project:read', async (_e: any, opts: { folder: string }) => {
    const { readProject, folderApproved } =
      require('./project-runner') as typeof import('./project-runner');
    const folder = String(opts?.folder ?? '');
    if (!folder) return null;
    const info = readProject(folder);
    return info ? { ...info, approved: folderApproved(folder) } : null;
  });

  ipcMain.handle('project:state', async (_e: any, opts: { cruxId: string }) => {
    const { projectState } = require('./project-runner') as typeof import('./project-runner');
    return projectState(String(opts?.cruxId ?? ''));
  });

  ipcMain.handle(
    'project:start',
    async (
      _e: any,
      opts: {
        cruxId: string;
        folder: string;
        script: string;
        args?: string[];
        port?: number;
        env?: Record<string, string>;
      },
    ) => {
      const { startProject } = require('./project-runner') as typeof import('./project-runner');
      return startProject(opts);
    },
  );

  ipcMain.handle('project:stop', async (_e: any, opts: { cruxId: string }) => {
    const { stopProject } = require('./project-runner') as typeof import('./project-runner');
    await stopProject(String(opts?.cruxId ?? ''));
    return true;
  });

  ipcMain.handle('containers:runner', async (_e: any, opts?: { refresh?: boolean }) => {
    const { composeRunner, clearComposeRunnerCache } =
      require('./containers') as typeof import('./containers');
    if (opts?.refresh) clearComposeRunnerCache();
    return composeRunner(opts?.refresh);
  });

  ipcMain.handle('containers:inspect', async (_e: any, opts: { cruxId: string; file?: string }) => {
    const { inspectCompose } = require('./containers') as typeof import('./containers');
    const crux = lookupCrux(opts.cruxId);
    if (!crux) throw new Error('This crux has no Project Folder');
    return inspectCompose(path.resolve(crux.folder), opts.file);
  });

  ipcMain.handle(
    'containers:resolve',
    async (_e: any, opts: { cruxId: string; profiles?: string[] }) => {
      const { composeConfig, portsInUse, readOverride } =
        require('./containers') as typeof import('./containers');
      const crux = lookupCrux(opts.cruxId);
      if (!crux) throw new Error('This crux has no Project Folder');
      const folder = path.resolve(crux.folder);
      const resolution = await composeConfig(folder, opts.profiles ?? []);
      const wanted = resolution.services.flatMap((service) =>
        service.ports.map((port) => Number(port.host)).filter(Boolean),
      );
      const { connectionsFor } = require('./containers') as typeof import('./containers');
      return {
        ...resolution,
        taken: await portsInUse(wanted),
        overrides: readOverride(folder),
        // What a neighbour needs to reach this stack, from what Compose resolved.
        connections: connectionsFor(resolution.services),
      };
    },
  );

  ipcMain.handle(
    'containers:override',
    async (_e: any, opts: { cruxId: string; wishes: unknown }) => {
      const { writeOverride } = require('./containers') as typeof import('./containers');
      const crux = lookupCrux(opts.cruxId);
      if (!crux) throw new Error('This crux has no Project Folder');
      const wishes = Array.isArray(opts.wishes)
        ? (opts.wishes as { service?: unknown }[]).filter(
            (wish) => typeof wish?.service === 'string' && /^[\w.-]{1,64}$/.test(wish.service),
          )
        : [];
      return writeOverride(path.resolve(crux.folder), wishes as never);
    },
  );

  ipcMain.handle('containers:free-port', async (_e: any, opts?: { from?: number }) => {
    const { freePort } = require('./containers') as typeof import('./containers');
    return freePort(typeof opts?.from === 'number' ? opts.from : 8000);
  });

  ipcMain.handle(
    'containers:compose',
    async (
      e: any,
      opts: {
        cruxId: string;
        verb: string;
        service?: string;
        tail?: number;
        timeoutMs?: number;
        profiles?: string[];
        /** Values for `${NAME}` in the file; the Crux's secrets travel this way. */
        env?: Record<string, string>;
        /** The command for `run` or `exec`, as a list. */
        command?: string[];
        /** Wait until what was started is healthy. */
        wait?: boolean;
      },
    ) => {
      const { runCompose, COMPOSE_VERBS } =
        require('./containers') as typeof import('./containers');
      const verb = opts?.verb as (typeof COMPOSE_VERBS)[number];
      if (!COMPOSE_VERBS.includes(verb)) throw new Error(`Not allowed: ${opts?.verb}`);
      const crux = lookupCrux(opts.cruxId);
      if (!crux) throw new Error('This crux has no Project Folder');
      return runCompose({ ...opts, verb, folder: path.resolve(crux.folder) }, (line) => {
        if (!e.sender.isDestroyed())
          e.sender.send('containers:output', { cruxId: opts.cruxId, verb, line });
      });
    },
  );

  ipcMain.handle('native:install', async (e: any, opts: { tool: string }) => {
    const { MEDIA_TOOLS } = require('./media-binaries') as typeof import('./media-binaries');
    const { installMediaTool } = require('./media-install') as typeof import('./media-install');
    const tool = opts?.tool as (typeof MEDIA_TOOLS)[number];
    if (!MEDIA_TOOLS.includes(tool)) throw new Error(`Unknown native tool: ${opts?.tool}`);
    return installMediaTool(tool, app.getPath('userData'), (progress) => {
      if (!e.sender.isDestroyed()) e.sender.send('native:install-progress', progress);
    });
  });

  ipcMain.handle(
    'native:run',
    async (e: any, opts: { cruxId: string; tool: string; args: unknown[]; timeoutMs?: number }) => {
      const { MEDIA_TOOLS, mediaToolPath } =
        require('./media-binaries') as typeof import('./media-binaries');
      const tool = opts.tool as (typeof MEDIA_TOOLS)[number];
      if (!MEDIA_TOOLS.includes(tool)) throw new Error(`Unknown native tool: ${opts.tool}`);
      const binary = await mediaToolPath(
        tool,
        app.isPackaged ? process.resourcesPath : null,
        app.getPath('userData'),
      );
      if (!binary)
        throw new Error(
          tool === 'magick'
            ? 'ImageMagick is not on this machine. Install it (brew install imagemagick, apt install imagemagick, or imagemagick.org) and look again.'
            : tool === 'pandoc'
              ? 'Pandoc is not on this machine. Install it (brew install pandoc, apt install pandoc, or pandoc.org) and look again.'
              : tool === 'typst'
                ? 'Typst is not on this machine. Install it (brew install typst, or typst.app) and look again.'
                : `${tool} is not available on this machine`,
        );
      const crux = lookupCrux(opts.cruxId);
      if (!crux) throw new Error('This crux has no Project Folder');
      const folder = path.resolve(crux.folder);
      const args = (opts.args ?? []).map((a) => String(a));
      for (const a of args) {
        if (a.startsWith('-')) continue;
        if (/^[a-z][a-z0-9+.-]*:/i.test(a) && !/^[a-z]:[\\/]/i.test(a))
          throw new Error(`Protocols are not allowed: ${a}`);
        if (path.isAbsolute(a)) throw new Error(`Use paths relative to the crux folder: ${a}`);
        if (a.includes('/') || a.includes('\\') || /\.[a-z0-9]{1,5}$/i.test(a)) {
          const resolved = path.resolve(folder, a);
          if (resolved !== folder && !resolved.startsWith(folder + path.sep))
            throw new Error(`Path outside the crux folder: ${a}`);
        }
      }
      // Neither ffmpeg nor ImageMagick creates directories, and for both the
      // output is the last argument. A folder under the crux is made for it.
      const last = args.at(-1);
      if (last && !last.startsWith('-'))
        fs.mkdirSync(path.dirname(path.resolve(folder, last)), { recursive: true });
      // Each program takes its own preamble: ffprobe has no -nostdin, and
      // ImageMagick reads a delegate config that can name other programs, so
      // the limits keep one bad file from taking the machine with it.
      const magickLimits = [
        '-limit',
        'memory',
        '1GiB',
        '-limit',
        'map',
        '2GiB',
        '-limit',
        'time',
        '600',
      ];
      // ImageMagick 7 takes its sub-command first (`magick identify …`), so the
      // limits go after it; a convert-style pipeline takes them at the front.
      const magickCommands = new Set([
        'identify',
        'montage',
        'mogrify',
        'composite',
        'convert',
        'compare',
        'stream',
        'display',
        'animate',
        'import',
      ]);
      const full =
        tool === 'magick'
          ? magickCommands.has(args[0] ?? '')
            ? [args[0]!, ...magickLimits, ...args.slice(1)]
            : [...magickLimits, ...args]
          : tool === 'pandoc' || tool === 'typst'
            ? args
            : tool === 'ffprobe'
              ? ['-hide_banner', '-protocol_whitelist', 'file,pipe', ...args]
              : ['-nostdin', '-hide_banner', '-protocol_whitelist', 'file,pipe', ...args];
      const started = Date.now();
      return new Promise<{ code: number; ms: number; stderrTail: string; stdout: string }>(
        (resolve, reject) => {
          const proc = execFile(binary, full, {
            cwd: folder,
            maxBuffer: 50 * 1024 * 1024,
            timeout: Math.min(opts.timeoutMs ?? 10 * 60_000, 30 * 60_000),
          });
          let stderr = '';
          let duration = 0;
          proc.stderr?.on('data', (chunk: string) => {
            stderr += chunk;
            if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
            const durMatch = stderr.match(/Duration:\s+(\d+):(\d+):(\d+\.\d+)/);
            if (durMatch && !duration)
              duration =
                parseInt(durMatch[1]!) * 3600 +
                parseInt(durMatch[2]!) * 60 +
                parseFloat(durMatch[3]!);
            const timeMatch = chunk.toString().match(/time=(\d+):(\d+):(\d+\.\d+)/);
            if (timeMatch && duration > 0) {
              const current =
                parseInt(timeMatch[1]!) * 3600 +
                parseInt(timeMatch[2]!) * 60 +
                parseFloat(timeMatch[3]!);
              e.sender.send('native:progress', {
                cruxId: opts.cruxId,
                tool: opts.tool,
                progress: Math.min(current / duration, 1),
              });
            }
          });
          let stdout = '';
          proc.stdout?.on('data', (chunk: string) => {
            stdout += chunk;
            if (stdout.length > 200_000) stdout = stdout.slice(-100_000);
          });
          proc.on('close', (code: number) =>
            resolve({
              code: code ?? -1,
              ms: Date.now() - started,
              stderrTail: stderr.slice(-2000),
              stdout: stdout.slice(-100_000),
            }),
          );
          proc.on('error', reject);
        },
      );
    },
  );

  // ── Frames from the preview (step 5): into <crux folder>/<subdir>/ ──
  ipcMain.handle(
    'preview:record',
    async (
      e: any,
      opts: {
        cruxId: string;
        url: string;
        subdir?: string;
        fps?: number;
        maxSeconds?: number;
        width?: number;
        height?: number;
      },
    ) => {
      const crux = lookupCrux(opts.cruxId);
      if (!crux) throw new Error('This crux has no Project Folder');
      const folder = path.resolve(crux.folder);
      const sub = (opts.subdir ?? 'frames').replace(/\\/g, '/');
      if (path.isAbsolute(sub) || sub.split('/').some((p) => p === '..' || p === ''))
        throw new Error(`Use a folder name inside the crux: ${sub}`);
      const dir = path.resolve(folder, sub);
      if (!dir.startsWith(folder + path.sep))
        throw new Error('Frames must land inside the crux folder');
      const { recordPreviewUrl } = require('./record') as typeof import('./record');
      return recordPreviewUrl(
        opts.url,
        {
          dir,
          fps: opts.fps ?? 30,
          maxSeconds: Math.min(opts.maxSeconds ?? 60, 180),
          width: opts.width ?? 1280,
          height: opts.height ?? 720,
        },
        (frames, seconds) =>
          e.sender.send('native:progress', {
            cruxId: opts.cruxId,
            tool: 'record',
            progress: Math.min(seconds / Math.min(opts.maxSeconds ?? 60, 180), 1),
            frames,
          }),
      );
    },
  );

  agentHost = new AgentHost({
    lookupCrux,
    resolveKnownFolder: (folder: string) => projects.resolveKnownFolder(folder),
    sendToRenderer: (request: unknown) => {
      if (!mainWindow || mainWindow.isDestroyed()) return false;
      mainWindow.webContents.send('agent-host:request', request);
      return true;
    },
    onChanged: (servers: unknown) => {
      for (const w of BrowserWindow.getAllWindows())
        w.webContents.send('agent-host:changed', servers);
    },
    // Packaged: dist/ sits inside app.asar; the launcher is unpacked so plain
    // `node` can run it (asarUnpack in package.json).
    stdioScript: path
      .join(__dirname, 'mcp-stdio.js')
      .replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep),
    version: app.getVersion(),
    log: debugLog,
  });
  ipcMain.handle('agent-host:list', () => agentHost.list());
  ipcMain.handle('agent-host:enable', (_e: any, cruxId: string) => agentHost.enable(cruxId));
  ipcMain.handle('agent-host:disable', (_e: any, cruxId: string) => agentHost.disable(cruxId));
  ipcMain.handle('agent-host:regenerate', (_e: any, cruxId: string) => agentHost.enable(cruxId));
  ipcMain.on('agent-host:response', (_e: any, response: unknown) =>
    agentHost.handleResponse(response),
  );

  // Agent Provider (ADR 0019): Claude Code driven by the SDK, in this process.
  const toolBroker = new AgentToolBroker((request: unknown) => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    mainWindow.webContents.send('agent:tool-request', request);
    return true;
  });
  ipcMain.on('agent:tool-response', (event: any, response: any) => {
    if (event.sender !== mainWindow?.webContents) return;
    toolBroker.answer(response.requestId, response.result);
  });
  const runtimeDeps: AgentRuntimeDeps = {
    callTool: (options, name, input, signal) => toolBroker.call(options, name, input, signal),
    sendEvent: (runId: string, event: unknown) => {
      for (const w of BrowserWindow.getAllWindows())
        if (!w.isDestroyed()) w.webContents.send('agent:event', { runId, event });
    },
    sendPermission: (request: unknown) => {
      if (!mainWindow || mainWindow.isDestroyed()) return false;
      mainWindow.webContents.send('agent:permission', request);
      return true;
    },
    log: debugLog,
    version: app.getVersion(),
    mock: process.env.CRUX_AGENT_MOCK === '1',
  };
  agentProvider = new AgentRuntimeRegistry([
    new AgentProvider(runtimeDeps),
    new CodexProvider(runtimeDeps),
  ]);
  ipcMain.handle('agent:status', (_e: any, force: boolean, provider?: string) =>
    agentProvider.status(force, provider),
  );
  ipcMain.handle('agent:start', (_e: any, opts: any) => {
    // The folder must be one of ours: the SDK gets the resolved path, nothing else.
    const cwd = projects.resolveKnownFolder(opts?.cwd);
    const owner = lookupCrux(opts?.cruxId);
    if (!owner || projects.resolveKnownFolder(owner.folder) !== cwd)
      throw new Error('The agent directory does not match its open Working Copy.');
    if (
      db.get("SELECT id FROM task_merges WHERE crux_id = ? AND phase = 'applying'", [opts.cruxId])
    )
      throw new Error('Recover the pending merge before starting an agent in Main.');
    return agentProvider.start({ ...opts, cwd });
  });
  ipcMain.handle('agent:interrupt', (_e: any, runId: string) => agentProvider.interrupt(runId));
  ipcMain.on('agent:answer', (_e: any, a: { requestId: string; allow: boolean }) =>
    agentProvider.answer(a.requestId, !!a.allow),
  );

  // Cruxes switched on in an earlier run come back with their token intact,
  // so a client configured last week still connects.
  try {
    const rows = db.all("SELECT id, meta FROM cruxes WHERE type = 'workspace'") || [];
    for (const row of rows) {
      try {
        const meta = JSON.parse(row.meta || '{}');
        if (meta?.settings?.agentHost === true && typeof meta.projectFolder === 'string') {
          agentHost
            .resume(row.id)
            .catch((err: any) =>
              debugLog(`Agent host resume failed for ${row.id}: ${err?.message}`),
            );
        }
      } catch {
        /* bad meta row — skip */
      }
    }
  } catch (err: any) {
    debugLog(`Agent host bootstrap failed: ${err?.message}`);
  }

  // ── Toolchain + site dev servers (ADR 0004/0005) ────────────
  const toolchain = new Toolchain(
    (folder: string) => projects.resolveKnownFolder(folder),
    (folder: string, line: string) => {
      mainWindow?.webContents.send('toolchain:output', { folder, line });
    },
  );
  selfTestHooks.toolchain = toolchain;
  devServers = new DevServerManager(
    (folder: string) => projects.resolveKnownFolder(folder),
    (folder: string, status: string, url: string | null) => {
      mainWindow?.webContents.send('devserver:status', { folder, status, url });
    },
  );

  ipcMain.handle('toolchain:is-installed', (_e: any, folder: string) =>
    toolchain.isInstalled(folder),
  );
  ipcMain.handle('toolchain:has-package-json', (_e: any, folder: string) =>
    toolchain.hasPackageJson(folder),
  );
  ipcMain.handle('toolchain:install', (_e: any, folder: string) => toolchain.install(folder));
  ipcMain.handle('toolchain:build', (_e: any, folder: string) => toolchain.build(folder));
  ipcMain.handle('toolchain:scaffold', (_e: any, folder: string, args: string[]) => {
    // Template scaffolds only — no arbitrary pnpm surface from the renderer
    if (!Array.isArray(args) || !['dlx', 'create'].includes(args[0])) {
      throw new Error('scaffold args must start with dlx or create');
    }
    return toolchain.run(folder, args);
  });
  ipcMain.handle('devserver:start', (_e: any, folder: string, opts?: { port?: number }) =>
    devServers.start(folder, opts ?? {}),
  );
  ipcMain.handle('devserver:restart', (_e: any, folder: string, opts?: { port?: number }) =>
    devServers.restart(folder, opts ?? {}),
  );
  ipcMain.handle('devserver:stop', (_e: any, folder: string) => devServers.stop(folder));
  ipcMain.handle('devserver:status', (_e: any, folder: string) => devServers.status(folder));
  ipcMain.handle('devserver:log', (_e: any, folder: string) => devServers.lastLog(folder));

  // ── FFmpeg transcode handler ──────────────────────────────
  // Find media (V1-GAPS-PLAN.md §2.7): the renderer asks the main process to fetch a public
  // catalogue or a file, so no page origin or CORS rule stands between a person and a result.
  // https only, a size cap, a timeout; the caller checks the type of what came back.
  ipcMain.handle('media:fetch', async (_e: any, url: string, options?: { maxBytes?: number }) => {
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      throw new Error('Not a URL.');
    }
    const base = process.env.CRUX_MEDIA_API;
    if (target.protocol !== 'https:' && !(base && url.startsWith(base)))
      throw new Error('Only https sources are fetched.');
    const cap = Math.min(options?.maxBytes ?? 64_000_000, 512_000_000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await net.fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': `CruxGarden/${app.getVersion()} (https://crux.garden)`,
          Accept: '*/*',
        },
      });
      const length = Number(response.headers.get('content-length') || 0);
      if (length > cap)
        throw new Error(`That file is larger than the ${Math.round(cap / 1_000_000)} MB limit.`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > cap)
        throw new Error(`That file is larger than the ${Math.round(cap / 1_000_000)} MB limit.`);
      return {
        ok: response.ok,
        status: response.status,
        mimeType: (response.headers.get('content-type') || '').split(';')[0].trim(),
        bytes: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
      };
    } finally {
      clearTimeout(timer);
    }
  });

  ipcMain.handle('ffmpeg:available', () => {
    return !!(ffmpegPath && fs.existsSync(ffmpegPath));
  });

  ipcMain.handle(
    'ffmpeg:transcode',
    async (
      _e: any,
      opts: {
        inputData: Uint8Array;
        inputName: string;
        isAudio: boolean;
      },
    ) => {
      if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
        throw new Error('FFmpeg not available');
      }

      const tmpDir = path.join(app.getPath('temp'), 'crux-transcode-' + Date.now());
      fs.mkdirSync(tmpDir, { recursive: true });

      const inputExt = path.extname(opts.inputName) || (opts.isAudio ? '.wav' : '.mp4');
      const inputFile = path.join(tmpDir, 'input' + inputExt);
      fs.writeFileSync(inputFile, Buffer.from(opts.inputData));

      const results: Array<{ name: string; data: Uint8Array; mimeType: string }> = [];

      try {
        if (opts.isAudio) {
          // Audio: transcode to AAC M4A
          const outputFile = path.join(tmpDir, 'output.m4a');
          await runFfmpeg(
            ['-i', inputFile, '-c:a', 'aac', '-b:a', '192k', '-y', outputFile],
            _e.sender,
          );
          results.push({
            name: path.basename(opts.inputName, inputExt) + '.m4a',
            data: new Uint8Array(fs.readFileSync(outputFile)),
            mimeType: 'audio/mp4',
          });
        } else {
          // Video: transcode to H.264 MP4 with faststart
          const outputFile = path.join(tmpDir, 'output.mp4');
          await runFfmpeg(
            [
              '-i',
              inputFile,
              '-c:v',
              'libx264',
              '-preset',
              'fast',
              '-crf',
              '28',
              '-c:a',
              'aac',
              '-b:a',
              '128k',
              '-movflags',
              '+faststart',
              '-y',
              outputFile,
            ],
            _e.sender,
          );
          results.push({
            name: path.basename(opts.inputName, inputExt) + '.mp4',
            data: new Uint8Array(fs.readFileSync(outputFile)),
            mimeType: 'video/mp4',
          });
        }
      } finally {
        // Clean up temp files
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {}
      }

      return results;
    },
  );
}

function runFfmpeg(args: string[], sender: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = execFile(ffmpegPath, args, { maxBuffer: 50 * 1024 * 1024 });

    let stderr = '';
    let duration = 0;

    proc.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
      // Parse duration from FFmpeg output
      const durMatch = stderr.match(/Duration:\s+(\d+):(\d+):(\d+\.\d+)/);
      if (durMatch && !duration) {
        duration =
          parseInt(durMatch[1]!) * 3600 + parseInt(durMatch[2]!) * 60 + parseFloat(durMatch[3]!);
      }
      // Parse progress
      const timeMatch = chunk.toString().match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (timeMatch && duration > 0) {
        const current =
          parseInt(timeMatch[1]!) * 3600 + parseInt(timeMatch[2]!) * 60 + parseFloat(timeMatch[3]!);
        const progress = Math.min(current / duration, 1);
        sender.send('ffmpeg:progress', progress);
      }
    });

    proc.on('close', (code: number) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
    });

    proc.on('error', reject);
  });
}

// ── Custom protocol for serving built files ──────────────────

function getWebAppDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app')
    : path.join(__dirname, '../../dist');
}

function registerAppProtocol() {
  protocol.handle('crux-app', (request: any) => {
    const url = new URL(request.url);
    const root = path.resolve(getWebAppDir());

    // Chromium canonicalizes ./.. segments but leaves %2F encoded; decoding
    // after canonicalization resurrects separators, so an encoded traversal
    // would escape the web root. Reject those outright, then re-assert
    // containment on the resolved path — this origin can otherwise read any
    // file the user can.
    const rawPath = url.pathname;
    if (/%2f|%5c/i.test(rawPath)) {
      return new Response('Forbidden', { status: 403 });
    }

    let filePath = path.resolve(root, '.' + decodeURIComponent(rawPath));
    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
      return new Response('Forbidden', { status: 403 });
    }

    // SPA fallback: if the file doesn't exist, serve index.html
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(root, 'index.html');
    }

    // Serve from disk ourselves rather than net.fetch('file://…'): media
    // elements ask with a Range header (a Mood's track loops from here), which
    // the file: scheme does not honour, and the content type must be right.
    const size = fs.statSync(filePath).size;
    const type = contentTypeFor(filePath);
    const range = request.headers.get('range');
    const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
    if (m && (m[1] || m[2])) {
      const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
      const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      if (start >= size || start > end) {
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${size}` },
        });
      }
      const stream = fs.createReadStream(filePath, { start, end });
      return new Response(Readable.toWeb(stream) as any, {
        status: 206,
        headers: {
          'Content-Type': type,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes',
        },
      });
    }
    return new Response(Readable.toWeb(fs.createReadStream(filePath)) as any, {
      status: 200,
      headers: {
        'Content-Type': type,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
      },
    });
  });
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.opus': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};
function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

// Embedded apps that share memory between AudioWorklets and the page (web-synth's
// transport, compressor, FM synth, spectrogram) need SharedArrayBuffer. The shell
// cannot be cross-origin isolated without breaking every other embedded app and
// preview, so Chromium's feature flag enables it for non-isolated contexts.
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');

// Register crux-app:// as a privileged scheme (must be before app.whenReady)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'crux-app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

// ── App lifecycle ────────────────────────────────────────────

app.whenReady().then(() => {
  registerAppProtocol();
  setupIpc();

  // Integration self-test: CRUX_SELFTEST=1 npx electron .  (see selftest.ts)
  if (process.env.CRUX_SELFTEST) {
    const { runSelfTest } = require('./selftest');
    runSelfTest({
      app,
      db,
      secrets: selfTestHooks.secrets,
      projects: selfTestHooks.projects,
      previewServer,
      toolchain: selfTestHooks.toolchain,
      devServers,
      debugLog,
    });
    return;
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else if (mainWindow && !mainWindow.isVisible()) showMainWindow();
  });
});

// On macOS the app stays alive with no windows (dock icon reopens one), so the
// data layer must survive here — tearing down SQLite/watcher on window close
// left `activate` reopening a window whose every IPC call threw. Only the
// per-window servers stop. Full teardown belongs to quit (below), which is
// also the ONLY path Cmd+Q takes: window-all-closed does not fire then.
app.on('window-all-closed', () => {
  if (devServers) devServers.stopAll();
  if (previewServer) previewServer.stopAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Await owned processes and the watcher before closing SQLite and quitting.
let teardown: Promise<void> | null = null;
let teardownDone = false;
app.on('before-quit', (event: any) => {
  quitting = true;
  if (requestWorkspaceClose(event)) return;
  if (teardownDone) return;
  event.preventDefault();
  if (teardown) return;
  teardown = (async () => {
    await agentHost?.stopAll();
    await agentProvider?.stopAll();
    await devServers?.stopAll();
    // A project the person started is a child of this app, and goes with it.
    await (require('./project-runner') as typeof import('./project-runner')).stopAllProjects();
    await previewServer?.stopAll();
    await watcher?.closeAll();
    db?.close();
    teardownDone = true;
    app.quit();
  })().catch((error: unknown) => {
    teardown = null;
    debugLog(`Could not finish shutdown: ${String(error)}`);
  });
});
