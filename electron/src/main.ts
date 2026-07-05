const { app, BrowserWindow, ipcMain, protocol, net, dialog, shell } = require('electron');
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

// ffmpeg-static provides a bundled ffmpeg binary
let ffmpegPath: string;
try {
  ffmpegPath = require('ffmpeg-static');
} catch {
  ffmpegPath = '';
}

let mainWindow: any = null;
let db: any = null;
let watcher: any = null;
let previewServer: any = null;
let devServers: any = null;
// References for the CRUX_SELFTEST integration test (see selftest.ts)
const selfTestHooks: { secrets?: any; projects?: any; toolchain?: any } = {};

const isDev = !app.isPackaged;

// Debug log to file — use a fixed path since app.getPath may not be ready
const logFile = path.join(require('os').homedir(), 'crux-garden-debug.log');
function debugLog(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(logFile, line); } catch {}
}
debugLog(`Starting Crux Garden. isDev=${isDev}, isPackaged=${app.isPackaged}, ffmpeg=${ffmpegPath}`);

// Set name for menu bar, but lock userData path so it doesn't change with the name
const userDataPath = app.getPath('userData');
app.setName('Crux Garden');
app.setPath('userData', userDataPath);

function getDbPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'cruxgarden.db');
}

function getBlobDir(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'blobs');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, '../build/icon' + (process.platform === 'win32' ? '.ico' : process.platform === 'darwin' ? '.icns' : '.png')),
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
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
      debugLog(`No built web app at ${indexPath} — run "npm run build:web" (or set CRUX_DEV_SERVER)`);
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

  // ── Project Folders (ADR 0001) ──────────────────────────────
  const desktopConfig = new DesktopConfig(app.getPath('userData'));
  const projects = new ProjectFolders(desktopConfig);
  selfTestHooks.projects = projects;

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
  watcher = new ProjectWatcher((batch: unknown) => {
    mainWindow?.webContents.send('project:changed', batch);
  });

  // Watch every registered Project Folder from the start — external edits
  // count whether or not the crux is open in the app.
  try {
    const rows = db.all("SELECT meta FROM cruxes WHERE type = 'workspace'") || [];
    for (const row of rows) {
      try {
        const meta = JSON.parse(row.meta || '{}');
        if (typeof meta.projectFolder === 'string') watcher.watch(meta.projectFolder);
      } catch { /* bad meta row — skip */ }
    }
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
    projects.folderExists(folder));
  ipcMain.handle('project:write-file', (_e: any, folder: string, relPath: string, data: Uint8Array) => {
    watcher.markSelfWrite(folder, relPath);
    return projects.writeFile(folder, relPath, data);
  });
  ipcMain.handle('project:read-file', (_e: any, folder: string, relPath: string) =>
    projects.readFile(folder, relPath));
  ipcMain.handle('project:delete-file', (_e: any, folder: string, relPath: string) => {
    watcher.markSelfWrite(folder, relPath);
    return projects.deleteFile(folder, relPath);
  });
  ipcMain.handle('project:rename-file', (_e: any, folder: string, fromRel: string, toRel: string) => {
    watcher.markSelfWrite(folder, fromRel);
    watcher.markSelfWrite(folder, toRel);
    return projects.renameFile(folder, fromRel, toRel);
  });
  ipcMain.handle('project:reveal', (_e: any, folder: string, relPath?: string) =>
    projects.reveal(folder, relPath));
  ipcMain.handle('project:watch', (_e: any, folder: string) => watcher.watch(folder));
  ipcMain.handle('project:unwatch', (_e: any, folder: string) => watcher.unwatch(folder));
  ipcMain.handle('project:list-files', (_e: any, folder: string) =>
    projects.listFiles(folder));

  // ── Preview server (ADR 0003) ───────────────────────────────
  previewServer = new PreviewServer((folder: string) => projects.resolveKnownFolder(folder));

  ipcMain.handle('preview:start', (_e: any, folder: string) => previewServer.start(folder));
  ipcMain.handle('preview:stop', (_e: any, folder: string) => previewServer.stop(folder));

  // Open a local preview URL in the default browser — locked to loopback
  ipcMain.handle('desktop:open-external', (_e: any, url: string) => {
    if (/^http:\/\/127\.0\.0\.1:\d+(\/|$)/.test(url)) shell.openExternal(url);
  });

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
    toolchain.isInstalled(folder));
  ipcMain.handle('toolchain:has-package-json', (_e: any, folder: string) =>
    toolchain.hasPackageJson(folder));
  ipcMain.handle('toolchain:install', (_e: any, folder: string) =>
    toolchain.install(folder));
  ipcMain.handle('toolchain:build', (_e: any, folder: string) =>
    toolchain.build(folder));
  ipcMain.handle('toolchain:scaffold', (_e: any, folder: string, args: string[]) => {
    // Template scaffolds only — no arbitrary pnpm surface from the renderer
    if (!Array.isArray(args) || !['dlx', 'create'].includes(args[0])) {
      throw new Error('scaffold args must start with dlx or create');
    }
    return toolchain.run(folder, args);
  });
  ipcMain.handle('devserver:start', (_e: any, folder: string) =>
    devServers.start(folder));
  ipcMain.handle('devserver:stop', (_e: any, folder: string) =>
    devServers.stop(folder));
  ipcMain.handle('devserver:status', (_e: any, folder: string) =>
    devServers.status(folder));
  ipcMain.handle('devserver:log', (_e: any, folder: string) =>
    devServers.lastLog(folder));

  // ── FFmpeg transcode handler ──────────────────────────────
  ipcMain.handle('ffmpeg:available', () => {
    return !!(ffmpegPath && fs.existsSync(ffmpegPath));
  });

  ipcMain.handle('ffmpeg:transcode', async (_e: any, opts: {
    inputData: Uint8Array;
    inputName: string;
    isAudio: boolean;
  }) => {
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
        await runFfmpeg([
          '-i', inputFile,
          '-c:a', 'aac', '-b:a', '192k',
          '-y', outputFile,
        ], _e.sender);
        results.push({
          name: path.basename(opts.inputName, inputExt) + '.m4a',
          data: new Uint8Array(fs.readFileSync(outputFile)),
          mimeType: 'audio/mp4',
        });
      } else {
        // Video: transcode to H.264 MP4 with faststart
        const outputFile = path.join(tmpDir, 'output.mp4');
        await runFfmpeg([
          '-i', inputFile,
          '-c:v', 'libx264', '-preset', 'fast', '-crf', '28',
          '-c:a', 'aac', '-b:a', '128k',
          '-movflags', '+faststart',
          '-y', outputFile,
        ], _e.sender);
        results.push({
          name: path.basename(opts.inputName, inputExt) + '.mp4',
          data: new Uint8Array(fs.readFileSync(outputFile)),
          mimeType: 'video/mp4',
        });
      }
    } finally {
      // Clean up temp files
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }

    return results;
  });
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
        duration = parseInt(durMatch[1]!) * 3600 + parseInt(durMatch[2]!) * 60 + parseFloat(durMatch[3]!);
      }
      // Parse progress
      const timeMatch = chunk.toString().match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (timeMatch && duration > 0) {
        const current = parseInt(timeMatch[1]!) * 3600 + parseInt(timeMatch[2]!) * 60 + parseFloat(timeMatch[3]!);
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
    let filePath = path.join(getWebAppDir(), decodeURIComponent(url.pathname));

    // SPA fallback: if the file doesn't exist, serve index.html
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(getWebAppDir(), 'index.html');
    }

    return net.fetch('file://' + filePath);
  });
}

// Register crux-app:// as a privileged scheme (must be before app.whenReady)
protocol.registerSchemesAsPrivileged([{
  scheme: 'crux-app',
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
  },
}]);

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
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (devServers) devServers.stopAll();
  if (previewServer) previewServer.stopAll();
  if (watcher) watcher.closeAll();
  if (db) db.close();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Belt and suspenders: no orphaned dev-server process groups, ever
app.on('before-quit', () => {
  if (devServers) devServers.stopAll();
});
