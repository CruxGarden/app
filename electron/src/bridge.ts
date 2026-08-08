/**
 * The IPC bridge contract — the single declaration of what Desktop Mode
 * exposes to the renderer.
 *
 * Both sides of the seam import this file: preload.ts implements it
 * (`const api: ElectronBridge = …`), and the renderer consumes it via
 * `app/src/lib/platform.ts`, which re-exports these types and declares
 * `window.electronAPI`. Adding or changing a bridge method here is the only
 * way to change the contract; hand-copied partial interfaces are gone.
 *
 * Types only — no runtime code.
 */

// ── sqlite ──────────────────────────────────────────────────────────────────

export interface SqliteBridge {
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  get(sql: string, params?: unknown[]): Promise<unknown>;
  all(sql: string, params?: unknown[]): Promise<unknown[]>;
  export(): Promise<ArrayBuffer>;
  import(data: ArrayBuffer): Promise<void>;
  close(): Promise<void>;
  blobWrite(fingerprint: string, data: Uint8Array): Promise<void>;
  blobRead(fingerprint: string): Promise<Uint8Array>;
  blobDelete(fingerprint: string): Promise<void>;
  blobExists(fingerprint: string): Promise<boolean>;
  blobWipeAll(): Promise<void>;
}

// ── desktop ─────────────────────────────────────────────────────────────────

export interface DesktopBridge {
  config(): Promise<{ gardenRoot: string }>;
  chooseGardenRoot(): Promise<string | null>;
  openExternal(url: string): Promise<void>;
}

// ── project (Project Folders, ADR 0001) ─────────────────────────────────────

export interface WatchEvent {
  type: 'write' | 'delete' | 'mkdir' | 'rmdir';
  relPath: string;
}

export interface ChangeBatch {
  folder: string;
  folderMissing?: boolean;
  events: WatchEvent[];
}

export interface ProjectBridge {
  createFolder(slug: string): Promise<string>;
  ensureFolder(folder: string): Promise<string>;
  folderExists(folder: string): Promise<boolean>;
  writeFile(folder: string, relPath: string, data: Uint8Array): Promise<void>;
  readFile(folder: string, relPath: string): Promise<Uint8Array>;
  deleteFile(folder: string, relPath: string): Promise<void>;
  renameFile(folder: string, fromRel: string, toRel: string): Promise<void>;
  reveal(folder: string, relPath?: string): Promise<void>;
  listFiles(folder: string): Promise<string[]>;
  watch(folder: string): Promise<void>;
  unwatch(folder: string): Promise<void>;
  onChanged(callback: (batch: ChangeBatch) => void): () => void;
}

// ── preview (static server per crux, ADR 0003) ──────────────────────────────

export interface PreviewBridge {
  start(folder: string): Promise<string>;
  stop(folder: string): Promise<void>;
  /**
   * Screenshot a local preview URL (static server or dev server) via a hidden
   * window in the main process — desktop's replacement for the injected
   * postMessage capture web preview uses. Returns JPEG bytes. Loopback only.
   */
  capture(url: string): Promise<Uint8Array>;
}

// ── toolchain (bundled pnpm, ADR 0004) ──────────────────────────────────────

export interface ToolchainBridge {
  isInstalled(folder: string): Promise<boolean>;
  hasPackageJson(folder: string): Promise<boolean>;
  install(folder: string): Promise<{ code: number; log: string }>;
  build(folder: string): Promise<{ code: number; log: string; distFiles: string[] }>;
  scaffold(folder: string, args: string[]): Promise<{ code: number; log: string }>;
  onOutput(callback: (data: { folder: string; line: string }) => void): () => void;
}

// ── devserver (astro dev per Site Crux, ADR 0005) ───────────────────────────

export interface DevServerBridge {
  start(folder: string): Promise<string>;
  stop(folder: string): Promise<void>;
  status(folder: string): Promise<{ status: string; url: string | null }>;
  log(folder: string): Promise<string>;
  onStatus(
    callback: (data: { folder: string; status: string; url: string | null }) => void,
  ): () => void;
}

// ── secrets (safeStorage) ───────────────────────────────────────────────────

export interface SecretsBridge {
  available(): Promise<boolean>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

// ── localai (Ollama / LM Studio detection, Phase A4) ────────────────────────

export interface LocalAiEndpoint {
  id: 'ollama' | 'lmstudio';
  name: string;
  /** OpenAI-compatible base URL the renderer uses for chat. */
  baseUrl: string;
  models: string[];
}

export interface LocalAiBridge {
  /** Probe localhost for running local inference servers and their models. */
  detect(): Promise<LocalAiEndpoint[]>;
}

// ── ffmpeg (media transcoding) ──────────────────────────────────────────────

export interface TranscodeOutput {
  name: string;
  data: Uint8Array;
  mimeType: string;
}

export interface FfmpegBridge {
  available(): Promise<boolean>;
  transcode(opts: {
    inputData: Uint8Array;
    inputName: string;
    isAudio: boolean;
  }): Promise<TranscodeOutput[]>;
  onProgress(callback: (progress: number) => void): () => void;
}

// ── the whole bridge ────────────────────────────────────────────────────────

export interface ElectronBridge {
  sqlite: SqliteBridge;
  desktop: DesktopBridge;
  project: ProjectBridge;
  preview: PreviewBridge;
  toolchain: ToolchainBridge;
  devserver: DevServerBridge;
  secrets: SecretsBridge;
  ffmpeg: FfmpegBridge;
  localai: LocalAiBridge;
}
