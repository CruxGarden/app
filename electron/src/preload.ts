import { contextBridge, ipcRenderer } from 'electron';
import type {
  ElectronBridge,
  ChangeBatch,
  DesktopInfo,
  UpdateState,
  AgentHostServer,
  AgentHostRequest,
  AgentHostResponse,
  AgentStatus,
  AgentToolRequest,
  AgentToolResult,
  AgentStartOptions,
  AgentPermissionRequest,
  AgentEvent,
} from './bridge';

/**
 * Preload script — exposes the IPC bridge to the renderer.
 * The contract lives in bridge.ts (shared with the renderer via
 * app/src/lib/platform.ts); this file implements it. The renderer detects
 * `window.electronAPI` to know it's running in Electron.
 */
const api: ElectronBridge = {
  ...(process.platform === 'darwin'
    ? {
        blenderDesktop: {
          open: () => ipcRenderer.invoke('blender:open'),
          status: () => ipcRenderer.invoke('blender:status'),
          arrange: (side: 'left' | 'right') => ipcRenderer.invoke('blender:arrange', side),
          restore: () => ipcRenderer.invoke('blender:restore'),
        },
        figmaDesktop: {
          open: () => ipcRenderer.invoke('figma:open'),
          status: () => ipcRenderer.invoke('figma:status'),
          arrange: (side: 'left' | 'right') => ipcRenderer.invoke('figma:arrange', side),
          restore: () => ipcRenderer.invoke('figma:restore'),
        },
      }
    : {}),
  sqlite: {
    run: (sql: string, params?: unknown[]) => ipcRenderer.invoke('sqlite:run', sql, params),
    get: (sql: string, params?: unknown[]) => ipcRenderer.invoke('sqlite:get', sql, params),
    all: (sql: string, params?: unknown[]) => ipcRenderer.invoke('sqlite:all', sql, params),
    export: () => ipcRenderer.invoke('sqlite:export'),
    import: (data: ArrayBuffer) => ipcRenderer.invoke('sqlite:import', data),
    close: () => ipcRenderer.invoke('sqlite:close'),

    // Blob storage
    blobWrite: (fingerprint: string, data: Uint8Array) =>
      ipcRenderer.invoke('sqlite:blob-write', fingerprint, data),
    blobRead: (fingerprint: string) => ipcRenderer.invoke('sqlite:blob-read', fingerprint),
    blobDelete: (fingerprint: string) => ipcRenderer.invoke('sqlite:blob-delete', fingerprint),
    blobExists: (fingerprint: string) => ipcRenderer.invoke('sqlite:blob-exists', fingerprint),
    blobWipeAll: () => ipcRenderer.invoke('sqlite:blob-wipe-all'),
  },

  desktop: {
    onWorkspaceCommand: (callback) => {
      const handler = (_event: unknown, command: import('./bridge').WorkspaceCommand) =>
        callback(command);
      ipcRenderer.on('workspace:command', handler);
      return () => ipcRenderer.removeListener('workspace:command', handler);
    },
    onCloseRequest: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('workspace:close-request', handler);
      ipcRenderer.send('workspace:close-guard', true);
      return () => {
        ipcRenderer.removeListener('workspace:close-request', handler);
        ipcRenderer.send('workspace:close-guard', false);
      };
    },
    completeClose: (approved) => ipcRenderer.send('workspace:close-response', approved),
    config: () => ipcRenderer.invoke('desktop:config') as Promise<{ gardenRoot: string }>,
    chooseGardenRoot: () =>
      ipcRenderer.invoke('desktop:choose-garden-root') as Promise<string | null>,
    openExternal: (url: string) =>
      ipcRenderer.invoke('desktop:open-external', url) as Promise<void>,
    openWeb: (url: string) => ipcRenderer.invoke('desktop:open-web', url) as Promise<void>,
    info: () => ipcRenderer.invoke('desktop:info') as Promise<DesktopInfo>,
    openLogs: () => ipcRenderer.invoke('desktop:open-logs') as Promise<void>,
    setDocked: (on: boolean) => ipcRenderer.invoke('desktop:set-docked', on) as Promise<void>,
  },

  updates: {
    state: () => ipcRenderer.invoke('updates:state') as Promise<UpdateState>,
    check: () => ipcRenderer.invoke('updates:check') as Promise<UpdateState>,
    download: () => ipcRenderer.invoke('updates:download') as Promise<UpdateState>,
    install: () => ipcRenderer.invoke('updates:install') as Promise<void>,
    setAutoCheck: (on: boolean) =>
      ipcRenderer.invoke('updates:set-auto', on) as Promise<UpdateState>,
    onChange: (cb: (state: UpdateState) => void) => {
      const handler = (_e: unknown, state: UpdateState) => cb(state);
      ipcRenderer.on('updates:changed', handler);
      return () => ipcRenderer.removeListener('updates:changed', handler);
    },
  },

  project: {
    capture: (folder: string) => ipcRenderer.invoke('project:capture', folder),
    setMode: (folder: string, relPath: string, mode: number) =>
      ipcRenderer.invoke('project:set-mode', folder, relPath, mode),
    materialize: (
      folder: string,
      entries: { path: string; fingerprint: string; mode?: number }[],
    ) => ipcRenderer.invoke('project:materialize', folder, entries) as Promise<number>,
    createFolder: (slug: string) =>
      ipcRenderer.invoke('project:create-folder', slug) as Promise<string>,
    ensureFolder: (folder: string) =>
      ipcRenderer.invoke('project:ensure-folder', folder) as Promise<string>,
    folderExists: (folder: string) =>
      ipcRenderer.invoke('project:folder-exists', folder) as Promise<boolean>,
    writeFile: (folder: string, relPath: string, data: Uint8Array) =>
      ipcRenderer.invoke('project:write-file', folder, relPath, data) as Promise<void>,
    readFile: (folder: string, relPath: string) =>
      ipcRenderer.invoke('project:read-file', folder, relPath) as Promise<Uint8Array>,
    deleteFile: (folder: string, relPath: string) =>
      ipcRenderer.invoke('project:delete-file', folder, relPath) as Promise<void>,
    renameFile: (folder: string, fromRel: string, toRel: string) =>
      ipcRenderer.invoke('project:rename-file', folder, fromRel, toRel) as Promise<void>,
    reveal: (folder: string, relPath?: string) =>
      ipcRenderer.invoke('project:reveal', folder, relPath) as Promise<void>,
    listFiles: (folder: string) =>
      ipcRenderer.invoke('project:list-files', folder) as Promise<string[]>,
    watch: (folder: string) => ipcRenderer.invoke('project:watch', folder) as Promise<void>,
    unwatch: (folder: string) => ipcRenderer.invoke('project:unwatch', folder) as Promise<void>,
    flush: (folder?: string) =>
      ipcRenderer.invoke('project:flush', folder) as Promise<ChangeBatch[]>,
    onChanged: (callback: (batch: ChangeBatch) => void) => {
      const handler = (_event: unknown, batch: unknown) => callback(batch as ChangeBatch);
      ipcRenderer.on('project:changed', handler);
      return () => ipcRenderer.removeListener('project:changed', handler);
    },
  },

  preview: {
    start: (folder: string) => ipcRenderer.invoke('preview:start', folder) as Promise<string>,
    stop: (folder: string) => ipcRenderer.invoke('preview:stop', folder) as Promise<void>,
    capture: (url: string) => ipcRenderer.invoke('preview:capture', url) as Promise<Uint8Array>,
  },

  toolchain: {
    isInstalled: (folder: string) =>
      ipcRenderer.invoke('toolchain:is-installed', folder) as Promise<boolean>,
    hasPackageJson: (folder: string) =>
      ipcRenderer.invoke('toolchain:has-package-json', folder) as Promise<boolean>,
    install: (folder: string) =>
      ipcRenderer.invoke('toolchain:install', folder) as Promise<{ code: number; log: string }>,
    build: (folder: string) =>
      ipcRenderer.invoke('toolchain:build', folder) as Promise<{
        code: number;
        log: string;
        distFiles: string[];
      }>,
    scaffold: (folder: string, args: string[]) =>
      ipcRenderer.invoke('toolchain:scaffold', folder, args) as Promise<{
        code: number;
        log: string;
      }>,
    onOutput: (callback: (data: { folder: string; line: string }) => void) => {
      const handler = (_e: unknown, data: unknown) =>
        callback(data as { folder: string; line: string });
      ipcRenderer.on('toolchain:output', handler);
      return () => ipcRenderer.removeListener('toolchain:output', handler);
    },
  },

  devserver: {
    start: (folder: string, opts?: { port?: number }) =>
      ipcRenderer.invoke('devserver:start', folder, opts) as Promise<string>,
    restart: (folder: string, opts?: { port?: number }) =>
      ipcRenderer.invoke('devserver:restart', folder, opts) as Promise<string>,
    stop: (folder: string) => ipcRenderer.invoke('devserver:stop', folder) as Promise<void>,
    status: (folder: string) =>
      ipcRenderer.invoke('devserver:status', folder) as Promise<{
        status: string;
        url: string | null;
      }>,
    log: (folder: string) => ipcRenderer.invoke('devserver:log', folder) as Promise<string>,
    onStatus: (
      callback: (data: { folder: string; status: string; url: string | null }) => void,
    ) => {
      const handler = (_e: unknown, data: unknown) =>
        callback(data as { folder: string; status: string; url: string | null });
      ipcRenderer.on('devserver:status', handler);
      return () => ipcRenderer.removeListener('devserver:status', handler);
    },
  },

  secrets: {
    available: () => ipcRenderer.invoke('secrets:available') as Promise<boolean>,
    get: (key: string) => ipcRenderer.invoke('secrets:get', key) as Promise<string | null>,
    set: (key: string, value: string) =>
      ipcRenderer.invoke('secrets:set', key, value) as Promise<void>,
    delete: (key: string) => ipcRenderer.invoke('secrets:delete', key) as Promise<void>,
  },

  localai: {
    detect: () => ipcRenderer.invoke('localai:detect'),
  },

  native: {
    record: (opts: {
      cruxId: string;
      url: string;
      subdir?: string;
      fps?: number;
      maxSeconds?: number;
      width?: number;
      height?: number;
    }) =>
      ipcRenderer.invoke('preview:record', opts) as Promise<{ frames: number; seconds: number }>,
    run: (opts: {
      cruxId: string;
      tool: 'ffmpeg' | 'ffprobe' | 'magick' | 'pandoc';
      args: string[];
      timeoutMs?: number;
    }) =>
      ipcRenderer.invoke('native:run', opts) as Promise<{
        code: number;
        ms: number;
        stderrTail: string;
        stdout: string;
      }>,
    tools: (opts?: { refresh?: boolean }) =>
      ipcRenderer.invoke('native:tools', opts) as Promise<
        {
          tool: 'ffmpeg' | 'ffprobe' | 'magick' | 'pandoc';
          path: string | null;
          source: 'bundled' | 'resources' | 'system' | 'missing';
          version: string | null;
        }[]
      >,
    onProgress: (callback: (event: { cruxId: string; tool: string; progress: number }) => void) => {
      const handler = (_e: unknown, event: { cruxId: string; tool: string; progress: number }) =>
        callback(event);
      ipcRenderer.on('native:progress', handler);
      return () => ipcRenderer.removeListener('native:progress', handler);
    },
  },
  media: {
    fetch: (url: string, options?: { maxBytes?: number }) =>
      ipcRenderer.invoke('media:fetch', url, options) as Promise<{
        ok: boolean;
        status: number;
        mimeType: string;
        bytes: Uint8Array;
      }>,
  },
  ffmpeg: {
    available: () => ipcRenderer.invoke('ffmpeg:available') as Promise<boolean>,
    transcode: (opts: { inputData: Uint8Array; inputName: string; isAudio: boolean }) =>
      ipcRenderer.invoke('ffmpeg:transcode', opts) as Promise<
        Array<{ name: string; data: Uint8Array; mimeType: string }>
      >,
    onProgress: (callback: (progress: number) => void) => {
      const handler = (_event: unknown, progress: number) => callback(progress);
      ipcRenderer.on('ffmpeg:progress', handler);
      return () => ipcRenderer.removeListener('ffmpeg:progress', handler);
    },
  },
  // Agent Host (ADR 0013): per-crux MCP servers in main; tool calls run here.
  agentHost: {
    list: () => ipcRenderer.invoke('agent-host:list') as Promise<AgentHostServer[]>,
    enable: (cruxId: string) =>
      ipcRenderer.invoke('agent-host:enable', cruxId) as Promise<AgentHostServer>,
    disable: (cruxId: string) => ipcRenderer.invoke('agent-host:disable', cruxId) as Promise<void>,
    regenerate: (cruxId: string) =>
      ipcRenderer.invoke('agent-host:regenerate', cruxId) as Promise<AgentHostServer>,
    onChanged: (cb: (servers: AgentHostServer[]) => void) => {
      const handler = (_e: unknown, servers: unknown) => cb(servers as AgentHostServer[]);
      ipcRenderer.on('agent-host:changed', handler);
      return () => ipcRenderer.removeListener('agent-host:changed', handler);
    },
    onRequest: (cb: (request: AgentHostRequest) => void) => {
      const handler = (_e: unknown, request: unknown) => cb(request as AgentHostRequest);
      ipcRenderer.on('agent-host:request', handler);
      return () => ipcRenderer.removeListener('agent-host:request', handler);
    },
    respond: (response: AgentHostResponse) => ipcRenderer.send('agent-host:response', response),
  },
  agent: {
    onToolRequest: (cb: (request: AgentToolRequest) => void) => {
      const handler = (_e: unknown, request: AgentToolRequest) => cb(request);
      ipcRenderer.on('agent:tool-request', handler);
      return () => ipcRenderer.removeListener('agent:tool-request', handler);
    },
    respondTool: (requestId: string, result: AgentToolResult) =>
      ipcRenderer.send('agent:tool-response', { requestId, result }),
    status: (force?: boolean, provider?: string) =>
      ipcRenderer.invoke('agent:status', !!force, provider) as Promise<AgentStatus>,
    start: (opts: AgentStartOptions) => ipcRenderer.invoke('agent:start', opts) as Promise<void>,
    interrupt: (runId: string) => ipcRenderer.invoke('agent:interrupt', runId) as Promise<void>,
    answer: (requestId: string, allow: boolean) =>
      ipcRenderer.send('agent:answer', { requestId, allow }),
    onEvent: (cb: (runId: string, event: AgentEvent) => void) => {
      const handler = (_e: unknown, payload: unknown) => {
        const p = payload as { runId: string; event: AgentEvent };
        cb(p.runId, p.event);
      };
      ipcRenderer.on('agent:event', handler);
      return () => ipcRenderer.removeListener('agent:event', handler);
    },
    onPermission: (cb: (request: AgentPermissionRequest) => void) => {
      const handler = (_e: unknown, request: unknown) => cb(request as AgentPermissionRequest);
      ipcRenderer.on('agent:permission', handler);
      return () => ipcRenderer.removeListener('agent:permission', handler);
    },
  },
  // The address of the API this garden meets (ADR 0049): CRUX_API_URL at
  // launch pins it — the e2e suite's mock API, or a deliberate override;
  // otherwise the garden's own setting decides (api/client.ts).
  config: {
    apiUrl: process.env.CRUX_API_URL ?? null,
    v2: process.env.CRUX_V2 === '1',
  },
  // CRUX_AI_MOCK=1 swaps the language model for a scripted mock (e2e).
  // CRUX_AUTOBACKUP_QUIET_MS shortens automatic backup's quiet window (e2e).
  // CRUX_SILENT=1 keeps the soundscape and cues off (e2e default; sound tests opt out).
  test: {
    mediaApiBase: process.env.CRUX_MEDIA_API ?? null,
    aiMock: process.env.CRUX_AI_MOCK === '1',
    agentMock: process.env.CRUX_AGENT_MOCK === '1',
    silent: process.env.CRUX_SILENT === '1',
    autoBackupQuietMs: process.env.CRUX_AUTOBACKUP_QUIET_MS
      ? Number(process.env.CRUX_AUTOBACKUP_QUIET_MS) || null
      : null,
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
