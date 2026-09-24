import type {
  LocalWorkingCopyCreate,
  LocalCruxCreate,
  LocalCruxUpdate,
  LocalGraphChange,
} from '@cruxgarden/local-api';
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
  browser: {
    onFocusAddress: (callback) => {
      const handler = (_event: unknown, id: string) => callback(id);
      ipcRenderer.on('browser:focus-address', handler);
      return () => ipcRenderer.removeListener('browser:focus-address', handler);
    },
    action: (id, action, url) => ipcRenderer.invoke('browser:action', id, action, url),
    bounds: (id, bounds) => ipcRenderer.invoke('browser:bounds', id, bounds),
    onChange: (callback) => {
      const handler = (_event: unknown, state: import('./bridge').BrowserPanelState) =>
        callback(state);
      ipcRenderer.on('browser:state', handler);
      return () => ipcRenderer.removeListener('browser:state', handler);
    },
  },
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
    gardenMembership: {
      add: (input) => ipcRenderer.invoke('garden-membership:add', input),
      remove: (gardenId, memberId) =>
        ipcRenderer.invoke('garden-membership:remove', gardenId, memberId),
      list: (gardenId, options) => ipcRenderer.invoke('garden-membership:list', gardenId, options),
    },
    privateArchive: {
      replacementToken: (selection) => ipcRenderer.invoke('archive:replacement-token', selection),
      export: (selection) => ipcRenderer.invoke('archive:export', selection),
      inspect: (bytes) => ipcRenderer.invoke('archive:inspect', bytes),
      import: (bytes, input) => ipcRenderer.invoke('archive:import', bytes, input),
    },
    fileContent: {
      finishProjection: (id) => ipcRenderer.invoke('content:finish-projection', id),
      head: (id) => ipcRenderer.invoke('content:head', id),
      list: (input) => ipcRenderer.invoke('content:list', input),
      read: (input) => ipcRenderer.invoke('content:read', input),
      lookup: (input) => ipcRenderer.invoke('content:lookup', input),
      edit: (input) => ipcRenderer.invoke('content:edit', input),
      snapshot: (input) => ipcRenderer.invoke('content:snapshot', input),
      restore: (input) => ipcRenderer.invoke('content:restore', input),
    },
    onChange: (callback: (change: LocalGraphChange) => void) => {
      const handler = (_event: unknown, change: LocalGraphChange) => callback(change);
      ipcRenderer.on('sqlite:changed', handler);
      return () => {
        ipcRenderer.removeListener('sqlite:changed', handler);
      };
    },
    createCrux: (input: LocalCruxCreate) => ipcRenderer.invoke('sqlite:create-crux', input),
    prepareWorkingCopyFolder: (id: string, revision: number) =>
      ipcRenderer.invoke('sqlite:prepare-working-copy-folder', id, revision),
    finishWorkingCopySetup: (id: string, revision: number, phase: 'ready' | 'failed') =>
      ipcRenderer.invoke('sqlite:finish-working-copy-setup', id, revision, phase),
    createWorkingCopy: (input: LocalWorkingCopyCreate) =>
      ipcRenderer.invoke('sqlite:create-working-copy', input),
    saveTaskReview: (reviewData: string, expectedData?: string) =>
      ipcRenderer.invoke('sqlite:save-task-review', reviewData, expectedData),
    beginTaskMerge: (id: string, reviewData: string) =>
      ipcRenderer.invoke('sqlite:begin-task-merge', id, reviewData),
    releaseTaskReview: (id: string) => ipcRenderer.invoke('sqlite:release-task-review', id),
    completeTaskMerge: (id: string, resultHead: string) =>
      ipcRenderer.invoke('sqlite:complete-task-merge', id, resultHead),
    setWorkingCopyArchived: (id: string, archived: boolean, revision: number) =>
      ipcRenderer.invoke('sqlite:set-working-copy-archived', id, archived, revision),
    setCruxTrashed: (id: string, trashed: boolean) =>
      ipcRenderer.invoke('sqlite:set-crux-trashed', id, trashed),
    deleteCrux: (id: string) => ipcRenderer.invoke('sqlite:delete-crux', id),
    updateCrux: (id: string, patch: LocalCruxUpdate) =>
      ipcRenderer.invoke('sqlite:update-crux', id, patch),
    updateWorkingCopyMeta: (id: string, patch: Record<string, unknown>, title?: string) =>
      ipcRenderer.invoke('sqlite:update-working-copy-meta', id, patch, title),
    mergeCruxMeta: (id: string, patch: Record<string, unknown>) =>
      ipcRenderer.invoke('sqlite:merge-crux-meta', id, patch),
    run: (sql: string, params?: unknown[]) => ipcRenderer.invoke('sqlite:run', sql, params),
    get: (sql: string, params?: unknown[]) => ipcRenderer.invoke('sqlite:get', sql, params),
    all: (sql: string, params?: unknown[]) => ipcRenderer.invoke('sqlite:all', sql, params),
    export: () => ipcRenderer.invoke('sqlite:export'),
    inspectImport: (data: ArrayBuffer, availableFingerprints?: string[]) =>
      ipcRenderer.invoke('sqlite:inspect-import', data, availableFingerprints),
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
    onCreativeActivity: (callback) => {
      const handler = (_event: unknown, kind: 'writing' | 'interaction' | 'arranging') =>
        callback(kind);
      ipcRenderer.on('desktop:creative-activity', handler);
      return () => ipcRenderer.removeListener('desktop:creative-activity', handler);
    },
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
    reconcile: (folder: string, indexed: { path: string; fingerprint: string | null }[]) =>
      ipcRenderer.invoke('project:reconcile', folder, indexed) as Promise<ChangeBatch>,
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
      tool: 'ffmpeg' | 'ffprobe' | 'magick' | 'pandoc' | 'typst';
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
          tool: 'ffmpeg' | 'ffprobe' | 'magick' | 'pandoc' | 'typst';
          path: string | null;
          source: 'bundled' | 'resources' | 'installed' | 'system' | 'missing';
          version: string | null;
          installable?: boolean;
        }[]
      >,
    install: (opts: { tool: 'ffmpeg' | 'ffprobe' | 'magick' | 'pandoc' | 'typst' }) =>
      ipcRenderer.invoke('native:install', opts) as Promise<{
        tool: 'ffmpeg' | 'ffprobe' | 'magick' | 'pandoc' | 'typst';
        ok: boolean;
        path?: string;
        message: string;
        command?: string;
      }>,
    pdf: (opts: {
      cruxId: string;
      path: string;
      out?: string;
      pageSize?: string;
      landscape?: boolean;
    }) =>
      ipcRenderer.invoke('native:pdf', opts) as Promise<{
        path: string;
        bytes: number;
        engine?: string;
      }>,
    onInstallProgress: (
      callback: (event: {
        tool: 'ffmpeg' | 'ffprobe' | 'magick' | 'pandoc' | 'typst';
        fraction?: number;
        line?: string;
      }) => void,
    ) => {
      const handler = (
        _e: unknown,
        event: {
          tool: 'ffmpeg' | 'ffprobe' | 'magick' | 'pandoc' | 'typst';
          fraction?: number;
          line?: string;
        },
      ) => callback(event);
      ipcRenderer.on('native:install-progress', handler);
      return () => ipcRenderer.removeListener('native:install-progress', handler);
    },
    onProgress: (callback: (event: { cruxId: string; tool: string; progress: number }) => void) => {
      const handler = (_e: unknown, event: { cruxId: string; tool: string; progress: number }) =>
        callback(event);
      ipcRenderer.on('native:progress', handler);
      return () => ipcRenderer.removeListener('native:progress', handler);
    },
  },
  projectRunner: {
    choose: () => ipcRenderer.invoke('project:choose'),
    read: (opts: { folder: string }) => ipcRenderer.invoke('project:read', opts),
    scan: (opts: { folder: string }) => ipcRenderer.invoke('project:scan', opts),
    state: (opts: { cruxId: string }) => ipcRenderer.invoke('project:state', opts),
    start: (opts: {
      cruxId: string;
      folder: string;
      script: string;
      args?: string[];
      port?: number;
      env?: Record<string, string>;
    }) => ipcRenderer.invoke('project:start', opts),
    stop: (opts: { cruxId: string }) => ipcRenderer.invoke('project:stop', opts),
  },
  containers: {
    runner: (opts?: { refresh?: boolean }) =>
      ipcRenderer.invoke('containers:runner', opts) as Promise<{
        program: string;
        version: string;
      } | null>,
    inspect: (opts: { cruxId: string; file?: string }) =>
      ipcRenderer.invoke('containers:inspect', opts) as Promise<{
        services: {
          name: string;
          image?: string;
          about?: string;
          ports: { host: number; container?: number }[];
          dependsOn: string[];
          healthcheck: boolean;
          restart?: string;
          envKeys: string[];
          volumes: string[];
          profiles: string[];
        }[];
        refusals: string[];
        files: string[];
        profiles: string[];
        variables: { name: string; fallback?: string; fromEnv: boolean }[];
      }>,
    resolve: (opts: { cruxId: string; profiles?: string[] }) =>
      ipcRenderer.invoke('containers:resolve', opts) as Promise<{
        services: {
          name: string;
          image?: string;
          ports: { host: string; container: number; protocol?: string }[];
          environment: Record<string, string>;
          profiles: string[];
        }[];
        error?: string;
        taken: number[];
        overrides: { service: string; ports?: Record<string, string> }[];
        connections: Record<string, string>;
      }>,
    override: (opts: {
      cruxId: string;
      wishes: {
        service: string;
        ports?: Record<string, string>;
        environment?: Record<string, string>;
      }[];
    }) =>
      ipcRenderer.invoke('containers:override', opts) as Promise<{
        written: boolean;
        snippet: string;
      }>,
    local: (opts: { cruxId: string; file: string }) =>
      ipcRenderer.invoke('containers:local', opts) as Promise<string>,
    writeLocal: (opts: { cruxId: string; file: string; text: string }) =>
      ipcRenderer.invoke('containers:write-local', opts) as Promise<boolean>,
    portsInUse: (opts: { ports: number[] }) =>
      ipcRenderer.invoke('containers:ports-in-use', opts) as Promise<number[]>,
    freePort: (opts?: { from?: number }) =>
      ipcRenderer.invoke('containers:free-port', opts) as Promise<number>,
    compose: (opts: {
      cruxId: string;
      verb: 'up' | 'down' | 'ps' | 'logs' | 'pull' | 'config' | 'stop' | 'start';
      service?: string;
      tail?: number;
      timeoutMs?: number;
    }) =>
      ipcRenderer.invoke('containers:compose', opts) as Promise<{ code: number; output: string }>,
    onOutput: (callback: (event: { cruxId: string; verb: string; line: string }) => void) => {
      const handler = (_e: unknown, event: { cruxId: string; verb: string; line: string }) =>
        callback(event);
      ipcRenderer.on('containers:output', handler);
      return () => ipcRenderer.removeListener('containers:output', handler);
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
      ipcRenderer.send('agent-host:ready', true);
      return () => {
        ipcRenderer.send('agent-host:ready', false);
        ipcRenderer.removeListener('agent-host:request', handler);
      };
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
