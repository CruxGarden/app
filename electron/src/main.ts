const { app, BrowserWindow, ipcMain, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { SqliteNative } = require('./sqlite-native');

// ffmpeg-static provides a bundled ffmpeg binary
let ffmpegPath: string;
try {
  ffmpegPath = require('ffmpeg-static');
} catch {
  ffmpegPath = '';
}

let mainWindow: any = null;
let db: any = null;

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

  if (isDev) {
    mainWindow.loadURL('http://localhost:8080');
  } else {
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
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (db) db.close();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
