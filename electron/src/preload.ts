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
  InstallationBridge,
  TranscodeRequest,
  TranscodeProgress,
} from './bridge';

/**
 * Preload script — exposes the IPC bridge to the renderer.
 * The contract lives in bridge.ts (shared with the renderer via
 * app/src/lib/platform.ts); this file implements it. The renderer detects
 * `window.electronAPI` to know it's running in Electron.
 */
/** Listen on a main→renderer channel; the return value stops listening. */
function subscribe(channel: string, callback: (...args: any[]) => void): () => void {
  const handler = (_event: unknown, ...args: unknown[]) => callback(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

// Main resolves launch policy once. Sandbox preload receives only the public
// result, so packaged mocks cannot be re-enabled by reading the environment.
const prefix = '--crux-launch-settings=';
const settingsArgument = [...process.argv].reverse().find((arg) => arg.startsWith(prefix));
const launch = JSON.parse(
  settingsArgument ? decodeURIComponent(settingsArgument.slice(prefix.length)) : '{}',
) as Partial<Pick<ElectronBridge, 'config' | 'test'>>;

const api: ElectronBridge = {
  packageImports: {
    pending: () => ipcRenderer.invoke('package-imports:pending'),
    read: (id) => ipcRenderer.invoke('package-imports:read', id),
    dismiss: (id) => ipcRenderer.invoke('package-imports:dismiss', id),
    onChange: (callback) => subscribe('package-imports:changed', callback),
  },
  browser: {
    onFocusAddress: (callback) => subscribe('browser:focus-address', callback),
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
    enterLocalGarden: () => ipcRenderer.invoke('garden:enter-local'),
    installation: Object.fromEntries(
      // Kept inline: a sandboxed preload cannot load local modules. Main checks
      // every name against the shared list in bridge.ts.
      [
        'createAuthor',
        'updateAuthor',
        'rekeyLocalAuthor',
        'createDimension',
        'updateDimension',
        'deleteDimension',
        'storeSet',
        'storeDelete',
        'storeClear',
        'wipeGarden',
        'sanitizeImportedGarden',
        'setWorkingCopyFolder',
      ].map((name) => [
        name,
        (...args: unknown[]) => ipcRenderer.invoke('installation', name, ...args),
      ]),
    ) as InstallationBridge,
    settings: {
      list: () => ipcRenderer.invoke('settings:list'),
      put: (key, value) => ipcRenderer.invoke('settings:put', key, value),
      remove: (key) => ipcRenderer.invoke('settings:remove', key),
    },
    gardenMood: {
      read: (id) => ipcRenderer.invoke('garden-mood:read', id),
      resolve: (id) => ipcRenderer.invoke('garden-mood:resolve', id),
      select: (input) => ipcRenderer.invoke('garden-mood:select', input),
    },
    gardenMembership: {
      add: (input) => ipcRenderer.invoke('garden-membership:add', input),
      parents: (memberId) => ipcRenderer.invoke('garden-membership:parents', memberId),
      move: (input) => ipcRenderer.invoke('garden-membership:move', input),
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
      history: (id) => ipcRenderer.invoke('history:list', id),
      checkpoint: (input) => ipcRenderer.invoke('history:capture', input),
      inspectCheckpoint: (id, checkpointId) =>
        ipcRenderer.invoke('history:inspect', id, checkpointId),
      restoreCheckpoint: (input) => ipcRenderer.invoke('history:restore', input),
      finishProjection: (id) => ipcRenderer.invoke('content:finish-projection', id),
      head: (id) => ipcRenderer.invoke('content:head', id),
      list: (input) => ipcRenderer.invoke('content:list', input),
      read: (input) => ipcRenderer.invoke('content:read', input),
      lookup: (input) => ipcRenderer.invoke('content:lookup', input),
      rename: (input) => ipcRenderer.invoke('content:rename', input),
      write: (input) => ipcRenderer.invoke('content:write', input),
      delete: (input) => ipcRenderer.invoke('content:delete', input),
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
    inspectTaskHistory: (input) => ipcRenderer.invoke('sqlite:inspect-task-history', input),
    readTaskHistoryFile: (input, root, path) =>
      ipcRenderer.invoke('sqlite:read-task-history-file', input, root, path),
    workingCopyBase: (id: string) => ipcRenderer.invoke('sqlite:working-copy-base', id),
    saveTaskReview: (reviewData: string, expectedData?: string) =>
      ipcRenderer.invoke('sqlite:save-task-review', reviewData, expectedData),
    beginTaskMerge: (id: string, reviewData: string) =>
      ipcRenderer.invoke('sqlite:begin-task-merge', id, reviewData),
    releaseTaskReview: (id: string) => ipcRenderer.invoke('sqlite:release-task-review', id),
    completeTaskMerge: (id: string) => ipcRenderer.invoke('sqlite:complete-task-merge', id),
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
    onCreativeActivity: (callback) => subscribe('desktop:creative-activity', callback),
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
    onChange: (cb: (state: UpdateState) => void) => subscribe('updates:changed', cb),
  },

  project: {
    recoveryOverview: () => ipcRenderer.invoke('project:recovery-overview'),
    revealRecovery: (folder: string, kind: string, id: string) =>
      ipcRenderer.invoke('project:reveal-recovery', folder, kind, id),
    trashRecovery: (selection: import('./bridge').RecoveryOperation) =>
      ipcRenderer.invoke('project:trash-recovery', selection),
    capture: (folder: string) => ipcRenderer.invoke('project:capture', folder),
    ignoredPaths: (folder: string, paths: string[]) =>
      ipcRenderer.invoke('project:ignored-paths', folder, paths) as Promise<string[]>,
    captureManifest: (folder: string, indexedPaths: string[]) =>
      ipcRenderer.invoke('project:capture-manifest', folder, indexedPaths),
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
    onChanged: (callback: (batch: ChangeBatch) => void) => subscribe('project:changed', callback),
  },

  staging: {
    publish: (input) => ipcRenderer.invoke('staging:publish', input),
    list: () => ipcRenderer.invoke('staging:list'),
    remove: (id) => ipcRenderer.invoke('staging:remove', id),
    openGarden: (theme) => ipcRenderer.invoke('staging:open-garden', theme),
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
    ) => subscribe('native:install-progress', callback),
    onProgress: (callback: (event: { cruxId: string; tool: string; progress: number }) => void) =>
      subscribe('native:progress', callback),
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
    resolve: (opts: { cruxId: string; profiles?: string[]; env?: Record<string, string> }) =>
      ipcRenderer.invoke('containers:resolve', opts) as Promise<{
        services: import('./containers').ResolvedService[];
        error?: string;
        taken: number[];
        overrides: { service: string; ports?: Record<string, string> }[];
        connections: Record<string, string>;
      }>,
    override: (opts: {
      cruxId: string;
      env?: Record<string, string>;
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
    onOutput: (callback: (event: { cruxId: string; verb: string; line: string }) => void) =>
      subscribe('containers:output', callback),
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
    transcode: (opts: TranscodeRequest) =>
      ipcRenderer.invoke('ffmpeg:transcode', opts) as Promise<
        Array<{ name: string; data: Uint8Array; mimeType: string }>
      >,
    onProgress: (callback: (event: TranscodeProgress) => void) =>
      subscribe('ffmpeg:progress', callback),
  },
  // Agent Host (ADR 0013): per-crux MCP servers in main; tool calls run here.
  agentHost: {
    installCli: () =>
      ipcRenderer.invoke('agent-host:install-cli') as Promise<{
        path: string;
        instructions: string;
      }>,
    list: () => ipcRenderer.invoke('agent-host:list') as Promise<AgentHostServer[]>,
    enable: (cruxId: string) =>
      ipcRenderer.invoke('agent-host:enable', cruxId) as Promise<AgentHostServer>,
    disable: (cruxId: string) => ipcRenderer.invoke('agent-host:disable', cruxId) as Promise<void>,
    regenerate: (cruxId: string) =>
      ipcRenderer.invoke('agent-host:regenerate', cruxId) as Promise<AgentHostServer>,
    onChanged: (cb: (servers: AgentHostServer[]) => void) => subscribe('agent-host:changed', cb),
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
    onToolRequest: (cb: (request: AgentToolRequest) => void) => subscribe('agent:tool-request', cb),
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
    onPermission: (cb: (request: AgentPermissionRequest) => void) =>
      subscribe('agent:permission', cb),
  },
  config: launch.config ?? { apiUrl: null, v2: false },
  test: launch.test ?? {
    mediaApiBase: null,
    aiMock: false,
    agentMock: false,
    silent: false,
    ai: null,
    plainTitles: false,
    autoBackupQuietMs: null,
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
