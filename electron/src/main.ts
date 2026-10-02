import { PackageImports } from './package-imports';
import { installDesktopCli } from './desktop-cli-install';
import { readLaunchSettings } from './launch-settings';
import type { GraphSelection, PrivateGraphImport } from '@cruxgarden/local-api';
import type {
  LocalWorkingCopyCreate,
  LocalCruxCreate,
  LocalCruxUpdate,
  FileContentRead,
  FileContentSelection,
  FileContentEdit,
  GrowthSnapshotCreate,
  GrowthContentRestore,
  EditCheckpointCapture,
} from '@cruxgarden/local-api';
import { downloadMedia } from './media-download';
import { requestMedia } from './media-transport';
import { transcodeMedia } from './media-transcode';
import type { TranscodeRequest } from './bridge';
import { lookupProjectCrux } from './native-storage';
import type { AgentRuntimeDeps } from './agent-runtime';
import { registerBrowserPanel } from './www-browser';
import { gardenIpc, isGardenUrl } from './garden-ipc';
import { installWorkspacePermissions } from './workspace-permissions';
import { INSTALLATION_COMMANDS, type InstallationCommand } from './bridge';
const { app, BrowserWindow, protocol, dialog, shell } = require('electron');
const { Readable } = require('node:stream');
const path = require('path');
const fs = require('fs');
const { SqliteApi } = require('./sqlite-api');
const { SecretStore } = require('./secrets');
const { DesktopConfig, ProjectFolders } = require('./projects');
const { ProjectWatcher } = require('./watcher');
const { PreviewServer } = require('./preview-server');
const { isInside } = require('./paths');
const { Toolchain } = require('./toolchain');
const { DevServerManager } = require('./dev-server');
const { AppLog } = require('./log');
const { Updater } = require('./updater');
const { AgentHost } = require('./mcp-server');
const { AgentProvider } = require('./agent-provider');
const { AgentRuntimeRegistry, AgentToolBroker } = require('./agent-runtime');
const { CodexProvider } = require('./codex-provider');

const launchSettings = readLaunchSettings(app.isPackaged);
let mainWindow: any = null;
const gardenBridge = gardenIpc(() => mainWindow, launchSettings.devServer);
const fromGarden = gardenBridge.handle;
const packageImports = new PackageImports(() => {
  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send('package-imports:changed');
});
packageImports.add(process.argv.slice(1));
// macOS delivers open-file before ready; retain it until a Garden is selected.
app.on('open-file', (event: Electron.Event, file: string) => {
  event.preventDefault();
  packageImports.add([file]);
  if (app.isReady())
    void startup
      .then(() => {
        if (!quitting) showMainWindow();
      })
      .catch(() => undefined);
});
fromGarden('package-imports:pending', () => packageImports.pending());
fromGarden('package-imports:read', (_event: Electron.IpcMainInvokeEvent, id: string) =>
  packageImports.read(id),
);
fromGarden('package-imports:dismiss', (_event: Electron.IpcMainInvokeEvent, id: string) =>
  packageImports.dismiss(id),
);
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
  if (mainWindow.isMinimized()) mainWindow.restore();
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
gardenBridge.on('workspace:close-guard', (_event: Electron.IpcMainEvent, enabled: boolean) => {
  workspaceCloseGuard = enabled;
});
gardenBridge.on('workspace:close-response', (_event: Electron.IpcMainEvent, approved: boolean) => {
  if (!workspaceClosePending) return;
  workspaceClosePending = false;
  if (approved) {
    workspaceMayClose = true;
    app.quit();
  } else {
    // A cancelled Quit is no longer a shutdown request. Keep relaunch/docked
    // activation working while the person continues editing.
    quitting = false;
  }
});
let db: import('./sqlite-api').SqliteApi;
let watcher: any = null;
let previewServer: any = null;
let devServers: any = null;
let agentHost: any = null;
let agentHostReady = false;
let agentProvider: any = null;
// References for the CRUX_SELFTEST integration test (see selftest.ts)
const selfTestHooks: { secrets?: any; projects?: any; toolchain?: any } = {};

const isDev = !app.isPackaged;

// Identity. Packaged builds are "Crux Garden" (Info.plist), so userData is
// ~/Library/Application Support/Crux Garden — where users' gardens live from the
// first release on. Dev keeps Electron's default (the package name) so a dev
// database never collides with the installed app's. The name is set before any
// getPath() call so both paths are stable. CRUX_TEST_PROFILE isolates it so
// automated UI tests (Playwright) run against a throwaway database.
if (app.isPackaged) app.setName('Crux Garden');
// Test-only (read like the other CRUX_* knobs): Chromium's fake camera and microphone, and no
// media prompts, so a recording journey runs without hardware or a permission dialog.
if (launchSettings.fakeMedia) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
}
const requestedUserData = launchSettings.userData || app.getPath('userData');
fs.mkdirSync(requestedUserData, { recursive: true });
// A symlink/path alias must not turn the same profile into a second owner.
const userDataPath = fs.realpathSync(requestedUserData);
app.setPath('userData', userDataPath);
// Acquire before opening logs, SQLite, watchers or agent servers. Keep the lock
// through teardown; Electron releases it when this process exits (including crash).
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on('second-instance', (_event: Electron.Event, argv: string[], cwd: string) => {
  packageImports.add(argv.slice(1), cwd);
  // Electron emits this after ready, but asynchronous API startup may still be
  // running. Never create a window against an uninitialized storage/IPC host.
  void startup
    .then(() => {
      if (!quitting) showMainWindow();
    })
    .catch(() => {
      // The startup handler below reports the failure and quits.
    });
});
// Logs: installed builds write to the OS logs folder (macOS: ~/Library/Logs/Crux
// Garden). Dev and isolated test runs write beside their own userData so they
// never share a main.log with the installed app. Always on, never sent (ADR 0008).
const logsDir =
  isDev || launchSettings.userData ? path.join(userDataPath, 'logs') : app.getPath('logs');
const appLog = new AppLog(logsDir);
appLog.attach(process, app);
// Isolated runs (Playwright, CI) have nobody to dismiss Electron's error dialog:
// an uncaught error before the window exists would sit there until the test
// times out with nothing on stderr. Say it and exit instead.
if (launchSettings.testing) {
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
debugLog(`Starting Crux Garden ${app.getVersion()}. isDev=${isDev}, isPackaged=${app.isPackaged}`);

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
      additionalArguments: [
        '--crux-launch-settings=' + encodeURIComponent(JSON.stringify(launchSettings.renderer)),
      ],
      contextIsolation: true,
      nodeIntegration: false,
      // Schedules tick in the window; a hidden window in docked mode must
      // keep its timers.
      backgroundThrottling: false,
    },
  });

  agentHostReady = false;
  mainWindow.webContents.on(
    'did-start-navigation',
    (details: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>) => {
      if (details.isMainFrame && !details.isSameDocument) agentHostReady = false;
    },
  );

  // Creative input in a cross-origin Workshop frame never bubbles to the
  // host document. Observe native input without intercepting it, retaining
  // only the kind of activity, and cap IPC traffic during a drag.
  const activityAt = new Map<string, number>();
  const creativeActivity = (kind: 'writing' | 'interaction' | 'arranging') => {
    const now = performance.now();
    if (now - (activityAt.get(kind) ?? -Infinity) < 200) return;
    activityAt.set(kind, now);
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send('desktop:creative-activity', kind);
  };
  mainWindow.on('move', () => creativeActivity('arranging'));
  mainWindow.webContents.on(
    'before-mouse-event',
    (_event: unknown, mouse: Electron.MouseInputEvent) => {
      if (mouse.type === 'mouseUp') creativeActivity('interaction');
      else if (mouse.type === 'mouseMove' && mouse.modifiers?.some((m) => m.endsWith('buttondown')))
        creativeActivity('arranging');
    },
  );
  setupLocalAiCors(mainWindow.webContents.session);
  installWorkspacePermissions(
    mainWindow,
    (origin) => previewServer?.ownerForOrigin(origin) ?? devServers?.ownerForOrigin(origin),
    launchSettings.devServer,
  );
  let cyclingWorkspaces = false;
  mainWindow.webContents.on('before-input-event', (event: any, input: any) => {
    if (input.type === 'keyDown') {
      if (input.key?.length === 1 || ['Enter', 'Backspace', 'Delete'].includes(input.key)) {
        creativeActivity(input.control || input.meta ? 'interaction' : 'writing');
      }
    }
    if (input.isComposing || input.modifiers?.includes('altgr')) return;
    const down = input.type === 'keyDown';
    const search =
      down && (input.control || input.meta) && input.alt && input.key?.toLowerCase() === 'k';
    const navigate =
      down &&
      (input.control || input.meta) &&
      !input.alt &&
      !input.shift &&
      input.key?.toLowerCase() === 'k';
    const cycle = down && input.control && input.key === 'Tab';
    const commit = input.type === 'keyUp' && input.key === 'Control' && cyclingWorkspaces;
    const cancel = down && input.key === 'Escape' && cyclingWorkspaces;
    if (!navigate && !search && !cycle && !commit && !cancel) return;
    event.preventDefault();
    // A cross-origin frame can retain the native keyboard target after DOM focus changes.
    if (navigate || search || cycle) mainWindow.webContents.focus();
    if (cycle) cyclingWorkspaces = true;
    if (commit || cancel) cyclingWorkspaces = false;
    mainWindow.webContents.send(
      'workspace:command',
      navigate
        ? 'navigate'
        : search
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
  const isAppUrl = (target: string) => isGardenUrl(target, launchSettings.devServer);

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
  const devServerUrl = launchSettings.devServer;
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

async function setupIpc() {
  registerBrowserPanel(() => mainWindow, gardenBridge);
  // The actual local API is the sole desktop database owner.
  const localDb = await SqliteApi.open(getDbPath(), getBlobDir());
  db = localDb;
  db.onChange((change) => {
    if (mainWindow && !mainWindow.webContents.isDestroyed())
      mainWindow.webContents.send('sqlite:changed', change);
  });

  const fileContent = () => {
    return db.fileContent;
  };
  fromGarden('content:finish-projection', (_e: unknown, id: string) =>
    fileContent().finishProjection(id),
  );
  fromGarden('content:head', (_e: unknown, id: string) => fileContent().head(id));
  fromGarden('content:list', (_e: unknown, input: FileContentSelection) =>
    fileContent().list(input),
  );
  fromGarden('content:read', (_e: unknown, input: FileContentRead) => fileContent().read(input));
  fromGarden('content:lookup', (_e: unknown, input: FileContentRead) =>
    fileContent().lookup(input),
  );
  fromGarden('content:edit', (_e: unknown, input: FileContentEdit) => fileContent().edit(input));
  fromGarden('content:restore', (_e: unknown, input: GrowthContentRestore) =>
    fileContent().restore(input),
  );
  fromGarden('content:snapshot', (_e: unknown, input: GrowthSnapshotCreate) =>
    fileContent().snapshot(input),
  );

  fromGarden('sqlite:merge-crux-meta', (_e: any, id: string, patch: Record<string, unknown>) => {
    assertFolderMetadata(patch);
    return db.mergeCruxMeta(id, patch);
  });

  fromGarden('sqlite:update-crux', (_e: any, id: string, patch: LocalCruxUpdate) => {
    assertFolderMetadata(patch.meta);
    return db.updateCrux(id, patch);
  });

  fromGarden(
    'sqlite:update-working-copy-meta',
    (_e: any, id: string, patch: Record<string, unknown>, title?: string) => {
      return db.updateWorkingCopyMeta(id, patch, title);
    },
  );

  fromGarden('sqlite:prepare-working-copy-folder', (_e: unknown, id: string, revision: number) => {
    return db.prepareWorkingCopyFolder(id, revision, (copyId, current) => {
      const folder =
        current && projects.folderExists(current)
          ? current
          : projects.createFolder(`task-${copyId}`);
      watcher.watch(folder);
      return folder;
    });
  });
  fromGarden(
    'sqlite:finish-working-copy-setup',
    (_e: unknown, id: string, revision: number, phase: 'ready' | 'failed') => {
      return db.finishWorkingCopySetup(id, revision, phase);
    },
  );

  fromGarden(
    'sqlite:inspect-task-history',
    (_e: unknown, input: Parameters<NonNullable<typeof db.inspectTaskHistory>>[0]) =>
      db.inspectTaskHistory!(input),
  );
  fromGarden(
    'sqlite:read-task-history-file',
    (
      _e: unknown,
      input: Parameters<NonNullable<typeof db.readTaskHistoryFile>>[0],
      root: string,
      path: string,
    ) => db.readTaskHistoryFile!(input, root, path),
  );

  fromGarden('sqlite:working-copy-base', (_e: unknown, id: string) => {
    return db.workingCopyBase(id);
  });
  fromGarden('sqlite:create-working-copy', (_e: unknown, input: LocalWorkingCopyCreate) => {
    return db.createWorkingCopy(input);
  });

  fromGarden(
    'sqlite:save-task-review',
    (_e: unknown, reviewData: string, expectedData?: string) => {
      return db.saveTaskReview(reviewData, expectedData);
    },
  );

  fromGarden('sqlite:begin-task-merge', (_e: unknown, id: string, reviewData: string) => {
    return db.beginTaskMerge(id, reviewData);
  });

  fromGarden('sqlite:release-task-review', (_e: unknown, id: string) => {
    return db.releaseTaskReview(id);
  });

  fromGarden('sqlite:complete-task-merge', (_e: unknown, id: string) => {
    return db.completeTaskMerge(id);
  });

  fromGarden(
    'sqlite:set-working-copy-archived',
    (_e: unknown, id: string, archived: boolean, revision: number) => {
      if (!db.setWorkingCopyArchived)
        throw new Error('Owned Task lifecycle commands are unavailable');
      return db.setWorkingCopyArchived(id, archived, revision);
    },
  );

  fromGarden('sqlite:set-crux-trashed', (_e: unknown, id: string, trashed: boolean) => {
    return db.setCruxTrashed(id, trashed);
  });
  fromGarden('sqlite:delete-crux', (_e: unknown, id: string) => {
    return db.deleteCrux(id);
  });

  // Raw SQL is a read path for the app and a fixture path for isolated test
  // profiles. Every write the app makes is a named command of the API owner.
  const testProfile = launchSettings.testing;
  fromGarden(
    'sqlite:run',
    (event: Electron.IpcMainInvokeEvent, sql: string, params?: unknown[]) => {
      if (!testProfile) throw new Error('Raw SQL writes are closed; use a named command.');
      return db.run(sql, params);
    },
  );

  fromGarden(
    'sqlite:get',
    (event: Electron.IpcMainInvokeEvent, sql: string, params?: unknown[]) => {
      return db.get(sql, params);
    },
  );

  fromGarden(
    'sqlite:all',
    (event: Electron.IpcMainInvokeEvent, sql: string, params?: unknown[]) => {
      return db.all(sql, params);
    },
  );

  fromGarden('sqlite:export', () => {
    return db.export();
  });

  fromGarden(
    'sqlite:inspect-import',
    (_e: unknown, data: ArrayBuffer, availableFingerprints?: string[]) =>
      db.inspectImport(data, availableFingerprints),
  );
  fromGarden('sqlite:import', (_e: any, data: ArrayBuffer) => {
    return db.import(data);
  });

  fromGarden('sqlite:close', () => {
    return db.close();
  });

  // Blob storage
  fromGarden('sqlite:blob-write', (_e: any, fingerprint: string, data: Uint8Array) => {
    return db.blobWrite(fingerprint, data);
  });

  fromGarden('sqlite:blob-read', (_e: any, fingerprint: string) => {
    return db.blobRead(fingerprint);
  });

  fromGarden('sqlite:blob-delete', (_e: any, fingerprint: string) => {
    return db.blobDelete(fingerprint);
  });

  fromGarden('sqlite:blob-exists', (_e: any, fingerprint: string) => {
    return db.blobExists(fingerprint);
  });

  fromGarden('sqlite:blob-wipe-all', () => {
    return db.blobWipeAll();
  });

  // ── Secrets (BYOK API keys — safeStorage, never in SQLite) ──
  const secrets = new SecretStore(app.getPath('userData'));
  selfTestHooks.secrets = secrets;

  fromGarden('secrets:available', () => secrets.available());
  fromGarden('secrets:get', (_e: any, key: string) => secrets.get(key));
  fromGarden('secrets:set', (_e: any, key: string, value: string) => secrets.set(key, value));
  fromGarden('secrets:delete', (_e: any, key: string) => secrets.delete(key));

  // ── Local inference (Ollama / LM Studio, Phase A4) ──────────
  const { detectLocalAi } = require('./localai');
  fromGarden('localai:detect', () => detectLocalAi());

  // ── Project Folders (ADR 0001) ──────────────────────────────
  const desktopConfig = new DesktopConfig(app.getPath('userData'), launchSettings.gardenRoot);
  const projects = new ProjectFolders(desktopConfig);
  // Metadata may retain a host-allocated folder, but cannot turn an arbitrary
  // path into a filesystem grant (including after a restart).
  const assertFolderMetadata = (meta?: Record<string, unknown>) => {
    if (meta?.projectFolder != null) projects.resolveKnownFolder(meta.projectFolder);
  };
  localDb.setProjectionHost(
    (folder: string, files: import('@cruxgarden/local-api').FileEntry[]) => {
      const { createHash } = require('node:crypto');
      const entries = files.filter((file) => file.path.toLowerCase() !== 'preview.jpg');
      const wanted = new Set(entries.map((file) => file.path));
      projects.ensureFolder(folder);
      for (const path of projects.listFiles(folder))
        if (!wanted.has(path)) projects.deleteFile(folder, path);
      for (let offset = 0; offset < entries.length; offset += 2000)
        projects.materialize(folder, getBlobDir(), entries.slice(offset, offset + 2000));
      for (const entry of entries) {
        const bytes = projects.readFile(folder, entry.path);
        if (
          bytes.length !== entry.size ||
          createHash('sha256').update(bytes).digest('hex') !== entry.fingerprint
        )
          throw new Error(`Restored file failed verification: ${entry.path}`);
      }
      if (projects.listFiles(folder).some((path: string) => !wanted.has(path)))
        throw new Error('Project Folder changed during restoration');
    },
  );

  localDb.setImportHost(
    require('./import-workspaces').importedWorkspacePreparer(projects, getBlobDir()),
  );

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
    fromGarden('blender:open', (_event: any) => {
      return blenderDesktop.open();
    });
    fromGarden('blender:status', (_event: any) => {
      return blenderDesktop.status();
    });
    fromGarden('blender:arrange', (event: any, side: 'left' | 'right') => {
      return blenderDesktop.arrange(side);
    });
    fromGarden('blender:restore', (_event: any) => {
      return blenderDesktop.restore();
    });
    fromGarden('figma:open', (_event: any) => {
      return figmaDesktop.open();
    });
    fromGarden('figma:status', (_event: any) => {
      return figmaDesktop.status();
    });
    fromGarden('figma:arrange', (event: any, side: 'left' | 'right') => {
      return figmaDesktop.arrange(side);
    });
    fromGarden('figma:restore', (_event: any) => {
      return figmaDesktop.restore();
    });
  }

  fromGarden('desktop:config', () => ({
    gardenRoot: desktopConfig.gardenRoot,
  }));

  fromGarden('desktop:choose-garden-root', async () => {
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
    const rows = await db.all<{ meta: string | null }>(
      "SELECT meta FROM cruxes WHERE type = 'workspace'",
    );
    let watched = 0;
    for (const row of rows) {
      try {
        const meta = JSON.parse(row.meta || '{}');
        if (typeof meta.projectFolder === 'string') {
          watcher.watch(projects.registerFolder(meta.projectFolder));
          watched++;
        }
      } catch {
        /* bad meta row — skip */
      }
    }
    // Unfinished setup must remain inspectable after restart. Register its
    // committed folder, but admit watcher edits only after recovery succeeds.
    for (const copy of await db.all<{ project_folder: string | null; phase: string }>(
      "SELECT project_folder, phase FROM working_copies WHERE phase IN ('ready', 'preparing', 'failed')",
    )) {
      if (!copy.project_folder) continue;
      const folder = projects.registerFolder(copy.project_folder);
      if (copy.phase === 'ready') watcher.watch(folder);
    }
    debugLog(`Watcher bootstrap: watching ${watched} project folder(s)`);
  } catch (err: any) {
    debugLog(`Watcher bootstrap failed: ${err?.message}`);
  }

  fromGarden('history:list', (event: Electron.IpcMainInvokeEvent, id: string) => {
    return localDb.fileContent.history(id);
  });
  fromGarden(
    'history:capture',
    (event: Electron.IpcMainInvokeEvent, input: EditCheckpointCapture) => {
      return localDb.fileContent.checkpoint(input);
    },
  );
  fromGarden(
    'history:inspect',
    (event: Electron.IpcMainInvokeEvent, id: string, checkpointId: string) => {
      return localDb.fileContent.inspectCheckpoint(id, checkpointId);
    },
  );
  fromGarden(
    'history:restore',
    (
      event: Electron.IpcMainInvokeEvent,
      input: FileContentSelection & { checkpointId: string },
    ) => {
      return localDb.fileContent.restoreCheckpoint(input);
    },
  );
  fromGarden('garden:enter-local', (_event: Electron.IpcMainInvokeEvent) => {
    return localDb.enterLocalGarden();
  });
  fromGarden('garden-mood:read', (event: Electron.IpcMainInvokeEvent, id: string) => {
    return localDb.gardenMood.read(id);
  });
  fromGarden('garden-mood:resolve', (event: Electron.IpcMainInvokeEvent, id: string) => {
    return localDb.gardenMood.resolve(id);
  });
  fromGarden(
    'garden-mood:select',
    (
      event: Electron.IpcMainInvokeEvent,
      input: Parameters<import('./bridge').GardenMoodBridge['select']>[0],
    ) => {
      return localDb.gardenMood.select(input);
    },
  );
  fromGarden(
    'installation',
    (event: Electron.IpcMainInvokeEvent, name: InstallationCommand, ...args: unknown[]) => {
      if (!(INSTALLATION_COMMANDS as readonly string[]).includes(name))
        throw new Error('Unknown installation command');
      if (name === 'setWorkingCopyFolder') projects.resolveKnownFolder(args[1]);
      return (localDb.installation[name] as (...a: unknown[]) => unknown)(...args);
    },
  );
  fromGarden('settings:list', (_event: Electron.IpcMainInvokeEvent) => {
    return localDb.settings.list();
  });
  fromGarden('settings:put', (event: Electron.IpcMainInvokeEvent, key: string, value: string) => {
    return localDb.settings.put(key, value);
  });
  fromGarden('settings:remove', (event: Electron.IpcMainInvokeEvent, key: string) => {
    return localDb.settings.remove(key);
  });
  fromGarden(
    'garden-membership:add',
    (event: Electron.IpcMainInvokeEvent, input: { gardenId: string; memberId: string }) => {
      return localDb.gardenMembership.add(input);
    },
  );
  fromGarden(
    'garden-membership:parents',
    (event: Electron.IpcMainInvokeEvent, memberId: string) => {
      return localDb.gardenMembership.parents(memberId);
    },
  );
  fromGarden(
    'garden-membership:move',
    (
      event: Electron.IpcMainInvokeEvent,
      input: { gardenId: string; memberId: string; expectedParents: string[] },
    ) => {
      return localDb.gardenMembership.move(input);
    },
  );
  fromGarden(
    'garden-membership:remove',
    (event: Electron.IpcMainInvokeEvent, gardenId: string, memberId: string) => {
      return localDb.gardenMembership.remove(gardenId, memberId);
    },
  );
  fromGarden(
    'garden-membership:list',
    (
      event: Electron.IpcMainInvokeEvent,
      gardenId: string,
      options?: { limit?: number; after?: string },
    ) => {
      return localDb.gardenMembership.list(gardenId, options);
    },
  );
  fromGarden(
    'archive:replacement-token',
    (event: Electron.IpcMainInvokeEvent, selection: GraphSelection) => {
      return localDb.privateArchiveReplacementToken(selection);
    },
  );
  fromGarden('archive:export', (event: Electron.IpcMainInvokeEvent, selection: GraphSelection) => {
    return localDb.exportPrivateArchive(selection);
  });
  fromGarden('archive:inspect', (event: Electron.IpcMainInvokeEvent, bytes: Uint8Array) => {
    return localDb.inspectPrivateArchive(bytes);
  });
  fromGarden(
    'archive:import',
    async (
      event: Electron.IpcMainInvokeEvent,
      bytes: Uint8Array,
      input: Omit<PrivateGraphImport, 'graph'>,
    ) => {
      const result = await localDb.importPrivateArchive(bytes, input);
      // Watch only committed registrations; failed preparation never becomes a writer.
      for (const id of Object.values(result.ids)) {
        const row = await db.get<{ meta: string }>(
          'SELECT meta FROM cruxes WHERE id = ? AND deleted IS NULL',
          [id],
        );
        const folder = row
          ? JSON.parse(row.meta).projectFolder
          : (
              await db.get<{ project_folder: string }>(
                "SELECT project_folder FROM working_copies WHERE id = ? AND phase = 'ready'",
                [id],
              )
            )?.project_folder;
        if (folder) watcher.watch(folder);
      }
      return result;
    },
  );

  fromGarden('sqlite:create-crux', (event: Electron.IpcMainInvokeEvent, input: LocalCruxCreate) => {
    assertFolderMetadata(input.meta);
    return db.createCrux(input, (slug) => {
      const folder = projects.createFolder(slug);
      watcher.watch(folder);
      return folder;
    });
  });

  fromGarden('project:create-folder', (_e: any, slug: string) => {
    const folder = projects.createFolder(slug);
    watcher.watch(folder);
    return folder;
  });
  fromGarden('project:ensure-folder', (_e: any, folder: string) => {
    const resolved = projects.ensureFolder(folder);
    watcher.watch(resolved);
    return resolved;
  });
  fromGarden('project:folder-exists', (_e: any, folder: string) => projects.folderExists(folder));
  fromGarden('project:write-file', (_e: any, folder: string, relPath: string, data: Uint8Array) => {
    return projects.writeFile(folder, relPath, data);
  });
  fromGarden('project:read-file', (_e: any, folder: string, relPath: string) =>
    projects.readFile(folder, relPath),
  );
  fromGarden('project:delete-file', (_e: any, folder: string, relPath: string) => {
    return projects.deleteFile(folder, relPath);
  });
  fromGarden('project:rename-file', (_e: any, folder: string, fromRel: string, toRel: string) => {
    return projects.renameFile(folder, fromRel, toRel);
  });
  fromGarden('project:reveal', (_e: any, folder: string, relPath?: string) =>
    projects.reveal(folder, relPath),
  );
  fromGarden('project:watch', (_e: any, folder: string) =>
    watcher.watch(projects.resolveKnownFolder(folder)),
  );
  fromGarden('project:unwatch', (_e: any, folder: string) =>
    watcher.unwatch(projects.resolveKnownFolder(folder)),
  );
  // Cut the watcher's debounce short: the batches come back on the reply (an event sent
  // during the handler could arrive after it), and the renderer records them itself.
  fromGarden(
    'project:flush',
    (_e: any, folder?: string) =>
      watcher?.flush(folder === undefined ? undefined : projects.resolveKnownFolder(folder)) ?? [],
  );
  fromGarden('project:list-files', (_e: any, folder: string) => projects.listFiles(folder));
  fromGarden(
    'project:reconcile',
    (_e: any, folder: string, indexed: { path: string; fingerprint: string | null }[]) =>
      projects.reconcile(folder, indexed),
  );
  fromGarden('project:capture', (_e: any, folder: string) => projects.capture(folder));
  fromGarden('project:ignored-paths', (_e: any, folder: string, paths: string[]) =>
    projects.ignoredPaths(folder, paths),
  );
  fromGarden('project:capture-manifest', (_e: any, folder: string, indexedPaths: string[]) =>
    projects.captureManifest(folder, getBlobDir(), indexedPaths),
  );
  fromGarden('project:set-mode', (_e: any, folder: string, relPath: string, mode: number) =>
    projects.setMode(folder, relPath, mode),
  );
  fromGarden(
    'project:materialize',
    (_e: any, folder: string, entries: { path: string; fingerprint: string; mode?: number }[]) =>
      projects.materialize(folder, getBlobDir(), entries),
  );

  // ── Preview server (ADR 0003) ───────────────────────────────
  previewServer = new PreviewServer((folder: string) => projects.resolveKnownFolder(folder));

  fromGarden('preview:start', (_e: any, folder: string) => previewServer.start(folder));
  fromGarden('preview:stop', (_e: any, folder: string) => previewServer.stop(folder));

  // Screenshot a local preview URL in a hidden window (snapshot thumbnails —
  // desktop preview has no injected capture script, ADR 0003).
  const { capturePreviewUrl } = require('./capture');
  fromGarden('preview:capture', (_e: any, url: string) => capturePreviewUrl(url));

  // Open a local preview URL in the default browser — locked to loopback
  fromGarden('desktop:open-external', (_e: any, url: string) => {
    if (/^http:\/\/127\.0\.0\.1:\d+(\/|$)/.test(url)) shell.openExternal(url);
  });

  // https only — never file:, never the app's own scheme
  fromGarden('desktop:open-web', (_e: any, url: string) => {
    if (/^https:\/\/[^\s]+$/i.test(url)) shell.openExternal(url);
  });

  // logsDir / userDataDir are shown in Settings → Desktop so a user can find and
  // attach their own logs. They are local filesystem paths that reveal the account
  // name: they must never be put into any telemetry or crash-report payload (ADR 0008).
  fromGarden('desktop:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
    arch: process.arch,
    packaged: app.isPackaged,
    logsDir,
    userDataDir: app.getPath('userData'),
  }));
  fromGarden('desktop:set-docked', (_e: any, on: boolean) => setDocked(!!on));
  fromGarden('desktop:open-logs', () => {
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
  fromGarden('updates:state', () => updater.getState());
  fromGarden('updates:check', () => updater.check());
  fromGarden('updates:download', () => updater.download());
  fromGarden('updates:install', () => updater.install());
  fromGarden('updates:set-auto', (_e: any, on: boolean) => updater.setAutoCheck(!!on));
  if (!launchSettings.testing) updater.scheduleLaunchCheck();

  // ── Agent Host (ADR 0013): one MCP server per switched-on crux ──────
  // Servers live here; every tool call is forwarded to the renderer, which
  // runs the same executor the built-in collaborator uses.
  const lookupCrux = async (cruxId: string) => {
    const crux = await lookupProjectCrux(db, cruxId);
    return crux ? { ...crux, folder: projects.resolveKnownFolder(crux.folder) } : null;
  };
  const requireCruxFolder = async (cruxId: string) => {
    const crux = await lookupCrux(cruxId);
    if (!crux) throw new Error('This crux has no Project Folder');
    return crux;
  };
  // ── Native tools (MAKING-THE-AD-PARITY gap 13) ──────────────────────
  // Run a media binary inside a crux's Project Folder: ffmpeg, ffprobe or
  // ImageMagick, each resolved per platform (media-binaries.ts). The working
  // directory is the folder; every path-like argument must stay inside it;
  // only the `file` protocol is allowed; no shell is involved.
  fromGarden('native:tools', async (_e: any, opts?: { refresh?: boolean }) => {
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

  fromGarden(
    'native:pdf',
    async (
      _e: any,
      opts: { cruxId: string; path: string; out?: string; pageSize?: string; landscape?: boolean },
    ) => {
      const { exportDocumentPdf } =
        require('./document-export') as typeof import('./document-export');
      const crux = await requireCruxFolder(opts.cruxId);
      return exportDocumentPdf(
        path.resolve(crux.folder),
        String(opts.path ?? ''),
        opts.out,
        {
          resources: app.isPackaged ? process.resourcesPath : null,
          userData: app.getPath('userData'),
        },
        { pageSize: opts.pageSize, landscape: opts.landscape },
      );
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
  fromGarden('project:choose', async () => {
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

  fromGarden('project:read', async (_e: any, opts: { folder: string }) => {
    const { readProject, folderApproved } =
      require('./project-runner') as typeof import('./project-runner');
    const folder = String(opts?.folder ?? '');
    if (!folder) return null;
    const info = readProject(folder);
    return info ? { ...info, approved: folderApproved(folder) } : null;
  });

  /**
   * What a linked folder holds, without taking any of it in.
   *
   * A Link of kind `folder` is for the things you do not want ingested — a
   * directory of footage, a dataset — so this reports what is there and how
   * much, and nothing is copied.
   */
  fromGarden('project:scan', async (_e: any, opts: { folder: string }) => {
    const { folderApproved } = require('./project-runner') as typeof import('./project-runner');
    const { scanFolder } = require('./folder-scan') as typeof import('./folder-scan');
    const folder = String(opts?.folder ?? '');
    if (!folder) return null;
    if (!folderApproved(folder))
      throw new Error('Choose this folder in Crux Garden before reading it.');
    return scanFolder(folder, { maxFiles: 5000 });
  });

  fromGarden('project:state', async (_e: any, opts: { cruxId: string }) => {
    const { projectState } = require('./project-runner') as typeof import('./project-runner');
    return projectState(String(opts?.cruxId ?? ''));
  });

  fromGarden(
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

  fromGarden('project:stop', async (_e: any, opts: { cruxId: string }) => {
    const { stopProject } = require('./project-runner') as typeof import('./project-runner');
    await stopProject(String(opts?.cruxId ?? ''));
    return true;
  });

  fromGarden('containers:runner', async (_e: any, opts?: { refresh?: boolean }) => {
    const { composeRunner, clearComposeRunnerCache } =
      require('./containers') as typeof import('./containers');
    if (opts?.refresh) clearComposeRunnerCache();
    return composeRunner(opts?.refresh);
  });

  fromGarden('containers:inspect', async (_e: any, opts: { cruxId: string; file?: string }) => {
    const { inspectCompose } = require('./containers') as typeof import('./containers');
    const crux = await requireCruxFolder(opts.cruxId);
    return inspectCompose(path.resolve(crux.folder), opts.file);
  });

  fromGarden(
    'containers:resolve',
    async (
      _e: any,
      opts: { cruxId: string; profiles?: string[]; env?: Record<string, string> },
    ) => {
      const { composeConfig, portsInUse, readOverride } =
        require('./containers') as typeof import('./containers');
      const crux = await requireCruxFolder(opts.cruxId);
      const folder = path.resolve(crux.folder);
      const resolution = await composeConfig(folder, opts.profiles ?? [], opts.env ?? {});
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

  /** This machine's own files for a Crux, which never travel with it. */
  fromGarden('containers:local', async (_e: any, opts: { cruxId: string; file: string }) => {
    const { readLocal } = require('./containers') as typeof import('./containers');
    const crux = await requireCruxFolder(opts.cruxId);
    return readLocal(path.resolve(crux.folder), String(opts.file ?? ''));
  });

  fromGarden(
    'containers:write-local',
    async (_e: any, opts: { cruxId: string; file: string; text: string }) => {
      const { writeLocal } = require('./containers') as typeof import('./containers');
      const crux = await requireCruxFolder(opts.cruxId);
      writeLocal(path.resolve(crux.folder), String(opts.file ?? ''), String(opts.text ?? ''));
      return true;
    },
  );

  fromGarden(
    'containers:override',
    async (_e: any, opts: { cruxId: string; wishes: unknown; env?: Record<string, string> }) => {
      const { writeOverride } = require('./containers') as typeof import('./containers');
      const crux = await requireCruxFolder(opts.cruxId);
      return writeOverride(
        path.resolve(crux.folder),
        opts.wishes as import('./containers').OverrideWish[],
        'compose.override.yaml',
        opts.env ?? {},
      );
    },
  );

  fromGarden('containers:ports-in-use', async (_e: any, opts: { ports: number[] }) => {
    const { portsInUse } = require('./containers') as typeof import('./containers');
    const ports = Array.isArray(opts?.ports) ? opts.ports.map(Number).filter(Boolean) : [];
    return portsInUse(ports);
  });

  fromGarden('containers:free-port', async (_e: any, opts?: { from?: number }) => {
    const { freePort } = require('./containers') as typeof import('./containers');
    return freePort(typeof opts?.from === 'number' ? opts.from : 8000);
  });

  fromGarden(
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
      const crux = await requireCruxFolder(opts.cruxId);
      return runCompose({ ...opts, verb, folder: path.resolve(crux.folder) }, (line) => {
        if (!e.sender.isDestroyed())
          e.sender.send('containers:output', { cruxId: opts.cruxId, verb, line });
      });
    },
  );

  fromGarden('native:install', async (e: any, opts: { tool: string }) => {
    const { MEDIA_TOOLS } = require('./media-binaries') as typeof import('./media-binaries');
    const { installMediaTool } = require('./media-install') as typeof import('./media-install');
    const tool = opts?.tool as (typeof MEDIA_TOOLS)[number];
    if (!MEDIA_TOOLS.includes(tool)) throw new Error(`Unknown native tool: ${opts?.tool}`);
    return installMediaTool(tool, app.getPath('userData'), (progress) => {
      if (!e.sender.isDestroyed()) e.sender.send('native:install-progress', progress);
    });
  });

  fromGarden(
    'native:run',
    async (e: any, opts: { cruxId: string; tool: string; args: unknown[]; timeoutMs?: number }) => {
      const replies = gardenBridge.replies(e);
      try {
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
        const crux = await requireCruxFolder(opts.cruxId);
        const folder = path.resolve(crux.folder);
        if (tool === 'typst') {
          const { runTypst } = require('./typst-command') as typeof import('./typst-command');
          return runTypst(binary, folder, opts.args, opts.timeoutMs);
        }
        if (tool === 'magick') {
          const { runMagick } = require('./magick-command') as typeof import('./magick-command');
          return runMagick(binary, folder, opts.args, opts.timeoutMs);
        }
        const { planPandocRun } = require('./pandoc-command') as typeof import('./pandoc-command');
        const { planFfmpegRun, planFfprobeRun } =
          require('./ffmpeg-command') as typeof import('./ffmpeg-command');
        const { runNativeProcess } =
          require('./native-process') as typeof import('./native-process');
        const plan =
          tool === 'pandoc'
            ? planPandocRun(folder, opts.args)
            : tool === 'ffmpeg'
              ? planFfmpegRun(folder, opts.args)
              : planFfprobeRun(folder, opts.args);
        for (const output of plan.outputs) fs.mkdirSync(path.dirname(output), { recursive: true });
        return await runNativeProcess(binary, plan.args, {
          cwd: folder,
          timeoutMs: opts.timeoutMs,
          onProgress: (progress) =>
            replies.send('native:progress', { cruxId: opts.cruxId, tool, progress }),
        });
      } finally {
        replies.dispose();
      }
    },
  );

  // ── Frames from the preview (step 5): into <crux folder>/<subdir>/ ──
  fromGarden(
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
      const crux = await requireCruxFolder(opts.cruxId);
      const folder = path.resolve(crux.folder);
      const sub = (opts.subdir ?? 'frames').replace(/\\/g, '/');
      if (path.isAbsolute(sub) || sub.split('/').some((p) => p === '..' || p === ''))
        throw new Error(`Use a folder name inside the crux: ${sub}`);
      const dir = path.resolve(folder, sub);
      if (!isInside(folder, dir) || dir === folder)
        throw new Error('Frames must land inside the crux folder');
      const { recordPreviewUrl } = require('./record') as typeof import('./record');
      return recordPreviewUrl(
        opts.url,
        {
          dir,
          fps: opts.fps ?? 30,
          maxSeconds: opts.maxSeconds ?? 60,
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

  gardenBridge.on('agent-host:ready', (_event: Electron.IpcMainEvent, ready: boolean) => {
    agentHostReady = ready === true;
  });
  agentHost = new AgentHost({
    gardenHostFolder: path.join(app.getPath('userData'), 'garden-agent-host'),
    lookupCrux,
    resolveKnownFolder: (folder: string) => projects.resolveKnownFolder(folder),
    sendToRenderer: (request: unknown) => {
      if (!agentHostReady || !mainWindow || mainWindow.isDestroyed()) return false;
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
  agentHost
    .resumeGarden()
    .catch((err: Error) => debugLog(`Garden agent host resume failed: ${err.message}`));
  fromGarden('agent-host:install-cli', () =>
    installDesktopCli({
      home: app.getPath('home'),
      executable: process.execPath,
      script: path
        .join(__dirname, 'desktop-cli.js')
        .replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep),
      profile: app.getPath('userData'),
    }),
  );
  fromGarden('agent-host:list', () => agentHost.list());
  fromGarden('agent-host:enable', (_e: any, cruxId: string) => agentHost.enable(cruxId));
  fromGarden('agent-host:disable', (_e: any, cruxId: string) => agentHost.disable(cruxId));
  fromGarden('agent-host:regenerate', (_e: any, cruxId: string) => agentHost.enable(cruxId));
  gardenBridge.on('agent-host:response', (_e: any, response: unknown) =>
    agentHost.handleResponse(response),
  );

  // Agent Provider (ADR 0019): Claude Code driven by the SDK, in this process.
  const toolBroker = new AgentToolBroker((request: unknown) => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    mainWindow.webContents.send('agent:tool-request', request);
    return true;
  });
  gardenBridge.on('agent:tool-response', (_event: Electron.IpcMainEvent, response: any) => {
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
    mock: launchSettings.renderer.test.agentMock,
  };
  agentProvider = new AgentRuntimeRegistry([
    new AgentProvider(runtimeDeps),
    new CodexProvider(runtimeDeps),
  ]);
  fromGarden('agent:status', (_e: any, force: boolean, provider?: string) =>
    agentProvider.status(force, provider),
  );
  fromGarden('agent:start', async (_e: any, opts: any) => {
    // The folder must be one of ours: the SDK gets the resolved path, nothing else.
    const cwd = projects.resolveKnownFolder(opts?.cwd);
    const owner = await lookupCrux(opts?.cruxId);
    if (!owner || projects.resolveKnownFolder(owner.folder) !== cwd)
      throw new Error('The agent directory does not match its open Working Copy.');
    if (
      await db.get(
        "SELECT id FROM task_merges WHERE crux_id = COALESCE((SELECT crux_id FROM working_copies WHERE id = ?), ?) AND phase = 'applying'",
        [opts.cruxId, opts.cruxId],
      )
    )
      throw new Error('Recover the pending merge before starting an agent in this workspace.');
    return agentProvider.start({ ...opts, cwd });
  });
  fromGarden('agent:interrupt', (_e: any, runId: string) => agentProvider.interrupt(runId));
  gardenBridge.on('agent:answer', (_e: any, a: { requestId: string; allow: boolean }) =>
    agentProvider.answer(a.requestId, !!a.allow),
  );

  // Cruxes switched on in an earlier run come back with their token intact,
  // so a client configured last week still connects.
  try {
    const rows = await db.all<{ id: string; meta: string | null }>(
      "SELECT id, meta FROM cruxes WHERE type = 'workspace'",
    );
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

  fromGarden('toolchain:is-installed', (_e: any, folder: string) => toolchain.isInstalled(folder));
  fromGarden('toolchain:has-package-json', (_e: any, folder: string) =>
    toolchain.hasPackageJson(folder),
  );
  fromGarden('toolchain:install', (_e: any, folder: string) => toolchain.install(folder));
  fromGarden('toolchain:build', (_e: any, folder: string) => toolchain.build(folder));
  fromGarden('devserver:start', (_e: any, folder: string, opts?: { port?: number }) =>
    devServers.start(folder, opts ?? {}),
  );
  fromGarden('devserver:restart', (_e: any, folder: string, opts?: { port?: number }) =>
    devServers.restart(folder, opts ?? {}),
  );
  fromGarden('devserver:stop', (_e: any, folder: string) => devServers.stop(folder));
  fromGarden('devserver:status', (_e: any, folder: string) => devServers.status(folder));
  fromGarden('devserver:log', (_e: any, folder: string) => devServers.lastLog(folder));

  // Public catalogues and media files use the same bounded desktop transport.
  fromGarden('media:fetch', (_event, url: string, options?: { maxBytes?: number }) =>
    downloadMedia(
      url,
      options?.maxBytes,
      requestMedia,
      `CruxGarden/${app.getVersion()} (https://crux.garden)`,
    ),
  );

  const ffmpegBinary = () => {
    const { mediaToolPath } = require('./media-binaries') as typeof import('./media-binaries');
    return mediaToolPath(
      'ffmpeg',
      app.isPackaged ? process.resourcesPath : null,
      app.getPath('userData'),
    );
  };
  fromGarden('ffmpeg:available', async () => !!(await ffmpegBinary()));

  fromGarden('ffmpeg:transcode', async (event, input: TranscodeRequest) => {
    const replies = gardenBridge.replies(event);
    try {
      const binary = await ffmpegBinary();
      if (!binary) throw new Error('FFmpeg not available');
      return await transcodeMedia(binary, app.getPath('temp'), input, (progress) => {
        replies.send('ffmpeg:progress', { requestId: input.requestId, progress });
      });
    } finally {
      replies.dispose();
    }
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
    if (!isInside(root, filePath)) {
      return new Response('Forbidden', { status: 403 });
    }

    // Built publications (the offline guide) have their own directory index.
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    // Ordinary workspace routes still use the SPA entry.
    if (!fs.existsSync(filePath)) {
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

const startup: Promise<void> = app.whenReady().then(async () => {
  registerAppProtocol();
  await setupIpc();
  if (quitting) return;

  // Integration self-test: CRUX_SELFTEST=1 npx electron .  (see selftest.ts)
  if (launchSettings.selfTest) {
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
void startup.catch((error: unknown) => {
  debugLog(`Could not start the desktop host: ${String(error)}`);
  app.quit();
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
    // Startup may be awaiting the API. Drain it before collecting resources
    // so a late bootstrap cannot create a watcher or server after teardown.
    await startup.catch(() => {});
    await agentHost?.stopAll();
    await agentProvider?.stopAll();
    await devServers?.stopAll();
    // A project the person started is a child of this app, and goes with it.
    await (require('./project-runner') as typeof import('./project-runner')).stopAllProjects();
    await previewServer?.stopAll();
    await watcher?.closeAll();
    await db?.close();
    teardownDone = true;
    app.quit();
  })().catch((error: unknown) => {
    teardown = null;
    debugLog(`Could not finish shutdown: ${String(error)}`);
  });
});
