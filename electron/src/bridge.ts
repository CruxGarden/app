import type {
  SelectGardenMood,
  LocalWorkingCopyCreate,
  LocalCruxCreate,
  LocalCruxUpdate,
  LocalGraphChange,
  LocalGraphRuntime,
  GraphSelection,
  PrivateGraphImport,
  FileContentRead,
  FileContentSelection,
  FileContentEdit,
  GrowthSnapshotCreate,
  GrowthContentRestore,
  EditCheckpointRestore,
  EditCheckpointCapture,
} from '@cruxgarden/local-api';
/**
 * The IPC bridge contract — the single declaration of what Desktop Mode
 * exposes to the renderer.
 *
 * Both sides of the seam import this file: preload.ts implements it
 * (`const api: ElectronBridge = …`), and the renderer consumes it via
 * `app/src/lib/platform.ts`, which re-exports these types and declares
 * `window.electronAPI`. Adding or changing a bridge method here is the only
 * way to change the contract. The one runtime value here is
 * `INSTALLATION_COMMANDS`, the allow-list main checks; the sandboxed preload
 * repeats it by hand and a test keeps the two equal.
 */

export type { LocalGraphChange } from '@cruxgarden/local-api';

/** Structural containment, distinct from people/access membership. The host
 * supplies attribution; a link never grants access or deletes its target. */
export interface GardenMembershipBridge {
  add(input: {
    gardenId: string;
    memberId: string;
  }): ReturnType<LocalGraphRuntime['addGardenMember']>;
  parents(memberId: string): ReturnType<LocalGraphRuntime['gardenParents']>;
  move(input: {
    gardenId: string;
    memberId: string;
    expectedParents: string[];
  }): ReturnType<LocalGraphRuntime['moveGardenMember']>;
  remove(gardenId: string, memberId: string): ReturnType<LocalGraphRuntime['removeGardenMember']>;
  list(
    gardenId: string,
    options?: { limit?: number; after?: string },
  ): ReturnType<LocalGraphRuntime['listGardenMembers']>;
}

/** Garden-owned selection; attribution comes only from the trusted host. */
export interface GardenMoodBridge {
  read(gardenId: string): ReturnType<LocalGraphRuntime['readGardenMood']>;
  resolve(gardenId: string): ReturnType<LocalGraphRuntime['resolveGardenMood']>;
  select(
    input: Omit<SelectGardenMood, 'authorId' | 'homeId'>,
  ): ReturnType<LocalGraphRuntime['selectGardenMood']>;
}

// ── sqlite ──────────────────────────────────────────────────────────────────

/** Named content operations. Edits record ingested content; Project Folder projection
 * stays with the file service. No renderer-supplied store or executable callbacks. */
export interface FileContentBridge {
  history(cruxId: string): ReturnType<LocalGraphRuntime['listEditHistory']>;
  checkpoint(input: EditCheckpointCapture): ReturnType<LocalGraphRuntime['createEditCheckpoint']>;
  inspectCheckpoint(
    cruxId: string,
    checkpointId: string,
  ): ReturnType<LocalGraphRuntime['inspectEditCheckpoint']>;
  restoreCheckpoint(
    input: EditCheckpointRestore,
  ): ReturnType<LocalGraphRuntime['restoreEditCheckpoint']>;
  finishProjection(id: string): ReturnType<LocalGraphRuntime['finishContentProjection']>;
  head(id: string): ReturnType<LocalGraphRuntime['fileContentHead']>;
  list(input: FileContentSelection): ReturnType<LocalGraphRuntime['listFileContent']>;
  lookup(input: FileContentRead): ReturnType<LocalGraphRuntime['lookupFileContent']>;
  read(input: FileContentRead): ReturnType<LocalGraphRuntime['readFileContent']>;
  edit(input: FileContentEdit): ReturnType<LocalGraphRuntime['editFileContent']>;
  snapshot(input: GrowthSnapshotCreate): ReturnType<LocalGraphRuntime['createGrowthSnapshot']>;
  restore(input: GrowthContentRestore): ReturnType<LocalGraphRuntime['restoreGrowthContent']>;
}

export interface PrivateArchiveBridge {
  replacementToken(selection: GraphSelection): Promise<string>;
  export(selection: GraphSelection): Promise<Uint8Array>;
  inspect(bytes: Uint8Array): Promise<{
    root: Record<string, unknown>;
    roots: string[];
    includeMembers: boolean;
    growthCount: number;
  }>;
  import(
    bytes: Uint8Array,
    input: Omit<PrivateGraphImport, 'graph'>,
  ): ReturnType<LocalGraphRuntime['importPrivateGraph']>;
}

/** The installation's settings, through named API commands. */
export interface SettingsBridge {
  list(): Promise<{ key: string; value: string }[]>;
  put(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Named installation commands: the writes the app used to send as SQL. */
export const INSTALLATION_COMMANDS = [
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
] as const;
export type InstallationCommand = (typeof INSTALLATION_COMMANDS)[number];
export type InstallationBridge = {
  [K in InstallationCommand]: (
    ...args: Parameters<LocalGraphRuntime[K]>
  ) => ReturnType<LocalGraphRuntime[K]>;
};

export interface SqliteBridge {
  enterLocalGarden?(): ReturnType<LocalGraphRuntime['enterLocalGarden']>;
  settings?: SettingsBridge;
  installation?: InstallationBridge;
  gardenMembership?: GardenMembershipBridge;
  gardenMood?: GardenMoodBridge;
  fileContent?: FileContentBridge;
  privateArchive?: PrivateArchiveBridge;
  createCrux?(input: LocalCruxCreate): Promise<string>;
  onChange?(callback: (change: LocalGraphChange) => void): () => void;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  get(sql: string, params?: unknown[]): Promise<unknown>;
  all(sql: string, params?: unknown[]): Promise<unknown[]>;
  /** Available when the owning backend can commit the complete metadata merge. */
  mergeCruxMeta?(id: string, patch: Record<string, unknown>): Promise<void>;
  /** Complete local Crux lifecycle commands; host workspace guards still apply. */
  prepareWorkingCopyFolder?(id: string, revision: number): Promise<string>;
  finishWorkingCopySetup?(id: string, revision: number, phase: 'ready' | 'failed'): Promise<void>;
  createWorkingCopy?(input: LocalWorkingCopyCreate): Promise<void>;
  workingCopyBase?(id: string): ReturnType<LocalGraphRuntime['workingCopyBase']>;
  saveTaskReview?(reviewData: string, expectedData?: string): Promise<void>;
  beginTaskMerge?(id: string, reviewData: string): Promise<void>;
  releaseTaskReview?(id: string): Promise<void>;
  completeTaskMerge?(id: string): Promise<void>;
  setWorkingCopyArchived?(id: string, archived: boolean, revision: number): Promise<void>;
  setCruxTrashed?(id: string, trashed: boolean): Promise<void>;
  deleteCrux?(id: string): Promise<void>;
  /** Atomically merge descriptive Task state without changing its identity or folder. */
  updateWorkingCopyMeta?(id: string, patch: Record<string, unknown>, title?: string): Promise<void>;
  /** Complete captured detail edit, including shallow metadata merge. */
  updateCrux?(id: string, patch: LocalCruxUpdate): Promise<void>;
  export(): Promise<ArrayBuffer>;
  import(data: ArrayBuffer): Promise<void>;
  /** Read required fingerprints from detached incoming bytes; leave the current database intact. */
  inspectImport(data: ArrayBuffer, availableFingerprints?: string[]): Promise<string[]>;
  close(): Promise<void>;
  blobWrite(fingerprint: string, data: Uint8Array): Promise<void>;
  blobRead(fingerprint: string): Promise<Uint8Array>;
  blobDelete(fingerprint: string): Promise<void>;
  blobExists(fingerprint: string): Promise<boolean>;
  blobWipeAll(): Promise<void>;
}

// ── desktop ─────────────────────────────────────────────────────────────────

export type WorkspaceCommand = 'navigate' | 'search' | 'next' | 'previous' | 'commit' | 'cancel';
export interface DesktopBridge {
  /** Creative input, including cross-origin Workshop apps. No content or coordinates. */
  onCreativeActivity?(
    callback: (kind: 'writing' | 'interaction' | 'arranging') => void,
  ): () => void;
  onWorkspaceCommand?(callback: (command: WorkspaceCommand) => void): () => void;
  onCloseRequest?(callback: () => void): () => void;
  completeClose?(approved: boolean): void;
  config(): Promise<{ gardenRoot: string }>;
  chooseGardenRoot(): Promise<string | null>;
  openExternal(url: string): Promise<void>;
  /** Open an https URL in the system browser (checkout, billing portal, docs). */
  openWeb(url: string): Promise<void>;
  /** Version, platform, where the logs live — for Settings → Desktop and bug reports. */
  info(): Promise<DesktopInfo>;
  /** Reveal the local log folder (ADR 0008: logs are local, user-inspectable). */
  openLogs(): Promise<void>;
  /**
   * Docked mode: closing the window hides it and the app keeps running from
   * the menu bar (a tray icon with Open and Quit), so Schedules keep ticking
   * and Alerts keep collecting. Off, closing the window is closing the app.
   */
  setDocked?(on: boolean): Promise<void>;
}

export interface DesktopInfo {
  version: string;
  electron: string;
  platform: string;
  arch: string;
  packaged: boolean;
  logsDir: string;
  userDataDir: string;
}

// ── updates (ADR 0007: electron-updater → GitHub Releases) ──────────────────

export type UpdateStatus =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

/** Which user-facing step failed — Settings → Desktop words each differently. */
export type UpdateAction = 'check' | 'download' | 'install';

export interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  progress: number | null;
  error: string | null;
  /** Set together with `status: 'error'`; null otherwise. */
  failedAction: UpdateAction | null;
  autoCheck: boolean;
  lastCheckedAt: string | null;
}

export interface UpdatesBridge {
  state(): Promise<UpdateState>;
  check(): Promise<UpdateState>;
  download(): Promise<UpdateState>;
  install(): Promise<void>;
  setAutoCheck(on: boolean): Promise<UpdateState>;
  onChange(cb: (state: UpdateState) => void): () => void;
}

// ── project (Project Folders, ADR 0001) ─────────────────────────────────────

export interface WatchEvent {
  type: 'write' | 'delete' | 'mkdir' | 'rmdir';
  relPath: string;
  /** For a write the app made itself: true when the file still carries that write, false when someone wrote after it. */
  own?: boolean;
}

export interface ChangeBatch {
  folder: string;
  folderMissing?: boolean;
  events: WatchEvent[];
}

export interface ProjectBridge {
  /** Stable capture of eligible Artifacts for task creation/review. Rejects symlinks. */
  capture?(folder: string): Promise<{ path: string; data: Uint8Array; mode: number }[]>;
  /** Which of these paths the folder's ignore rules (defaults + `.cruxignore`) cover. */
  ignoredPaths?(folder: string, paths: string[]): Promise<string[]>;
  /** The same capture as a manifest: fingerprints hashed in the main process and stored in the
   * Blob Store, no bytes crossing IPC; indexed paths the folder ignores come back as `retained`. */
  captureManifest?(
    folder: string,
    indexedPaths: string[],
  ): Promise<{
    files: { path: string; fingerprint: string; size: number; mode: number; utf8: boolean }[];
    retained: string[];
  }>;
  setMode?(folder: string, relPath: string, mode: number): Promise<void>;
  createFolder(slug: string): Promise<string>;
  ensureFolder(folder: string): Promise<string>;
  folderExists(folder: string): Promise<boolean>;
  writeFile(folder: string, relPath: string, data: Uint8Array): Promise<void>;
  /** Copy many Blob Store files into the folder in one call (Task Working Copies). Absent in older shells. */
  materialize?(
    folder: string,
    entries: { path: string; fingerprint: string; mode?: number }[],
  ): Promise<number>;
  readFile(folder: string, relPath: string): Promise<Uint8Array>;
  deleteFile(folder: string, relPath: string): Promise<void>;
  renameFile(folder: string, fromRel: string, toRel: string): Promise<void>;
  reveal(folder: string, relPath?: string): Promise<void>;
  listFiles(folder: string): Promise<string[]>;
  /** Startup recovery: compare disk with the index without transferring unchanged content. */
  reconcile?(
    folder: string,
    indexed: { path: string; fingerprint: string | null }[],
  ): Promise<ChangeBatch>;
  watch(folder: string): Promise<void>;
  unwatch(folder: string): Promise<void>;
  /** What the watcher still holds in its debounce, taken now (one folder or all); the caller records it. */
  flush?(folder?: string): Promise<ChangeBatch[]>;
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
  onOutput(callback: (data: { folder: string; line: string }) => void): () => void;
}

// ── devserver (astro dev per Site Crux, ADR 0005) ───────────────────────────

export interface DevServerBridge {
  /** Start (or reuse) the dev server; `port` is a preference, honoured when free. */
  start(folder: string, opts?: { port?: number }): Promise<string>;
  /** Stop and start again, optionally on a new preferred port. */
  restart(folder: string, opts?: { port?: number }): Promise<string>;
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

/** A fetch made by the main process (no page origin, no CORS): https anywhere, http on the local network only, size-capped. Find media and a weather station of one's own use it. */
export interface MediaBridge {
  fetch(
    url: string,
    options?: { maxBytes?: number },
  ): Promise<{ ok: boolean; status: number; mimeType: string; bytes: Uint8Array }>;
}
/** The media binaries a garden can run inside a crux folder. */
export type MediaToolName = 'ffmpeg' | 'ffprobe' | 'magick' | 'pandoc' | 'typst';
export interface MediaToolInfo {
  tool: MediaToolName;
  path: string | null;
  source: 'bundled' | 'resources' | 'installed' | 'system' | 'missing';
  /** Whether the app knows a way to install this one for the person. */
  installable?: boolean;
  version: string | null;
}

export interface NativeToolsBridge {
  /** Frames from a local preview page into <crux>/<subdir>/fNNNN.png (step 5). */
  record(opts: {
    cruxId: string;
    url: string;
    subdir?: string;
    fps?: number;
    maxSeconds?: number;
    width?: number;
    height?: number;
  }): Promise<{ frames: number; seconds: number; lastPoll?: string }>;
  run(opts: {
    cruxId: string;
    tool: MediaToolName;
    args: string[];
    timeoutMs?: number;
  }): Promise<{ code: number; ms: number; stderrTail: string; stdout: string }>;
  /** Which media binaries this machine has, and where each came from (platform-aware). */
  tools(opts?: { refresh?: boolean }): Promise<MediaToolInfo[]>;
  /**
   * Install a tool the app does not carry, at the person's request. The answer
   * says what happened, or what they can run themselves when the app cannot do
   * it (macOS has no ImageMagick download, so that route is Homebrew).
   */
  install(opts: { tool: MediaToolName }): Promise<{
    tool: MediaToolName;
    ok: boolean;
    path?: string;
    message: string;
    command?: string;
  }>;
  /**
   * A document to PDF. Pandoc has no PDF engine of its own — LaTeX is its
   * default and it is gigabytes — so the app writes a page and prints it with
   * the browser it already ships. Markdown, Word and the rest go through
   * Pandoc first; an HTML file is printed as it is.
   */
  pdf(opts: {
    cruxId: string;
    path: string;
    out?: string;
    pageSize?: string;
    landscape?: boolean;
  }): Promise<{ path: string; bytes: number; engine?: string }>;
  /** Lines and progress from an install in flight. */
  onInstallProgress(
    callback: (event: { tool: MediaToolName; fraction?: number; line?: string }) => void,
  ): () => void;
  onProgress(
    callback: (event: { cruxId: string; tool: string; progress: number; frames?: number }) => void,
  ): () => void;
}
/** Containers: a Crux's own stack through Docker Compose (`electron/src/containers.ts`). */
export interface ComposeService {
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
}
export interface ComposeVariable {
  name: string;
  /** What the file falls back to — a stack with defaults runs unchanged. */
  fallback?: string;
  /** Set in the Crux's `.env`. Whether, never what. */
  fromEnv: boolean;
}
export interface ComposeReading {
  services: ComposeService[];
  /** Why the stack must not start, if so — empty means it may run. */
  refusals: string[];
  /** The files Compose will read, base first, override after. */
  files: string[];
  /** Every profile named, so optional services can be offered. */
  profiles: string[];
  /** The settings the stack reads, with their defaults. */
  variables: ComposeVariable[];
}
export interface ContainersBridge {
  /** What this machine can run a stack with (docker or podman), or null. */
  runner(opts?: { refresh?: boolean }): Promise<{ program: string; version: string } | null>;
  /** Read the Crux's compose file: its services, and anything that forbids a start. */
  inspect(opts: { cruxId: string; file?: string }): Promise<ComposeReading>;
  /**
   * What Compose itself resolves the stack to, after every file, `.env` and
   * the active profiles — plus which of those host ports are already taken.
   * Private inputs are applied, and secret values are redacted from the response.
   */
  resolve(opts: { cruxId: string; profiles?: string[]; env?: Record<string, string> }): Promise<{
    services: import('./containers').ResolvedService[];
    error?: string;
    taken: number[];
    overrides: { service: string; ports?: Record<string, string> }[];
    /** What a neighbour needs to reach this stack: DATABASE_URL, ports, base URLs. */
    connections: Record<string, string>;
  }>;
  /**
   * Write this machine's ports and settings into `compose.override.yaml`,
   * which Compose merges over the shared stack. Refuses (and hands back the
   * snippet) when that file was written by hand.
   */
  override(opts: {
    cruxId: string;
    env?: Record<string, string>;
    wishes: {
      service: string;
      ports?: Record<string, string>;
      environment?: Record<string, string>;
    }[];
  }): Promise<{ written: boolean; snippet: string }>;
  /**
   * This machine's own files for a Crux — `.crux/local.env` and
   * `.crux/local.compose.yaml`. Never ingested, so never exported or
   * published: the ports assigned here do not arrive on a teammate's machine.
   */
  local(opts: { cruxId: string; file: string }): Promise<string>;
  writeLocal(opts: { cruxId: string; file: string; text: string }): Promise<boolean>;
  /** Which of these host ports something is already listening on. */
  portsInUse(opts: { ports: number[] }): Promise<number[]>;
  /** A free host port, for offering a way out of a collision. */
  freePort(opts?: { from?: number }): Promise<number>;
  /** One compose verb, for this Crux only. */
  compose(opts: {
    cruxId: string;
    verb: 'up' | 'down' | 'ps' | 'logs' | 'pull' | 'config' | 'stop' | 'start' | 'run' | 'exec';
    service?: string;
    tail?: number;
    timeoutMs?: number;
    /** Compose profiles to include — the optional parts of a stack. */
    profiles?: string[];
    /** Values for `${NAME}` in the file; the Crux's secrets travel this way. */
    env?: Record<string, string>;
    /** The command for `run` or `exec`, as a list — never a command line. */
    command?: string[];
    /** Wait until what was started is healthy before answering. */
    wait?: boolean;
  }): Promise<{ code: number; output: string }>;
  /** Lines from a compose run in flight — pulling images is slow. */
  onOutput(callback: (event: { cruxId: string; verb: string; line: string }) => void): () => void;
}

/**
 * The Project runner: code that lives outside the Crux, run from it.
 *
 * A folder becomes runnable only by being chosen in the OS dialog, so a Crux
 * that arrives from someone else cannot start anything until the person
 * points at a folder themselves.
 */
export interface ProjectInfo {
  folder: string;
  name?: string;
  scripts: string[];
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' | 'unknown';
  installed: boolean;
  approved?: boolean;
}
export interface ProjectState {
  status: 'idle' | 'starting' | 'running' | 'stopped' | 'crashed';
  script?: string;
  port?: number;
  pid?: number;
  log: string;
  startedAt?: number;
  exit?: number;
}
export interface ProjectRunnerBridge {
  /** Open the folder picker. Choosing is the approval; returns what it found. */
  choose(): Promise<ProjectInfo | null>;
  /** What a folder offers, and whether it has been chosen before. */
  read(opts: { folder: string }): Promise<ProjectInfo | null>;
  /**
   * What a linked folder holds, without taking any of it in — for a Link of
   * kind `folder`, where the point is to work with things too large or too
   * numerous to ingest.
   */
  scan(opts: { folder: string }): Promise<{
    files: string[];
    bytes: number;
    ignored: number;
    ignoredBytes: number;
    large: { path: string; bytes: number }[];
    truncated: boolean;
  } | null>;
  state(opts: { cruxId: string }): Promise<ProjectState>;
  start(opts: {
    cruxId: string;
    folder: string;
    script: string;
    args?: string[];
    port?: number;
    env?: Record<string, string>;
  }): Promise<ProjectState>;
  stop(opts: { cruxId: string }): Promise<boolean>;
}

/** Shared renderer/main admission limit; IPC currently copies complete files. */
export const MAX_TRANSCODE_BYTES = 500 * 1024 * 1024;

export interface TranscodeRequest {
  requestId: string;
  inputData: Uint8Array;
  inputName: string;
  isAudio: boolean;
}

export interface TranscodeProgress {
  requestId: string;
  progress: number;
}

export interface FfmpegBridge {
  available(): Promise<boolean>;
  transcode(opts: TranscodeRequest): Promise<TranscodeOutput[]>;
  onProgress(callback: (event: TranscodeProgress) => void): () => void;
}

// ── agent host (MCP server per crux, ADR 0013) ──────────────────────────────

/** A running per-crux MCP server, as Settings → Agents shows it. */
export interface AgentHostServer {
  cruxId: string;
  slug: string;
  name: string;
  folder: string;
  /** Streamable HTTP endpoint on 127.0.0.1. */
  url: string;
  /** Bearer token — also written to `<folder>/.crux/mcp.json` (mode 600). */
  token: string;
  configPath: string;
  /** For clients that prefer stdio: a thin proxy to the HTTP endpoint. */
  stdioCommand: string;
  /** Names of the MCP clients currently connected. */
  clients: string[];
}

/** Anthropic-style tool definition as the renderer's `ai/tools.ts` declares it. */
export interface AgentToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** Main → renderer: run this on behalf of an external agent. */
export type AgentHostRequest =
  | { id: string; kind: 'tools/list'; cruxId: string; agent: string }
  | {
      id: string;
      kind: 'tools/call';
      cruxId: string;
      agent: string;
      name: string;
      input: Record<string, unknown>;
    }
  | { id: string; kind: 'resources/read'; cruxId: string; agent: string; uri: string };

/** Renderer → main: the answer to one request. */
export interface AgentHostResponse {
  id: string;
  result?: unknown;
  error?: string;
}

export interface AgentHostBridge {
  installCli(): Promise<{ path: string; instructions: string }>;
  list(): Promise<AgentHostServer[]>;
  /** Start (or restart) the crux's server with a fresh token. */
  enable(cruxId: string): Promise<AgentHostServer>;
  disable(cruxId: string): Promise<void>;
  /** Same as enable: a new token, the config file rewritten. */
  regenerate(cruxId: string): Promise<AgentHostServer>;
  onChanged(cb: (servers: AgentHostServer[]) => void): () => void;
  /** Forwarded MCP requests arrive here; answer each with `respond`. */
  onRequest(cb: (request: AgentHostRequest) => void): () => void;
  respond(response: AgentHostResponse): void;
}

// ── agent provider (Claude Code as a Collaboration provider, ADR 0019) ─────────

export interface AgentStatus {
  installed: boolean;
  path: string | null;
  version: string | null;
  reason: string | null;
}

export interface AgentStartOptions {
  provider?: string;
  runId: string;
  cruxId: string;
  cwd: string;
  prompt: string;
  sessionId?: string | null;
  appendSystemPrompt?: string;
}

export interface AgentToolRequest {
  requestId: string;
  runId: string;
  cruxId: string;
  name: string;
  input: Record<string, unknown>;
}
export interface AgentToolResult {
  content: Array<
    { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
  >;
  isError?: boolean;
  hadMutation?: boolean;
}

/** Main → renderer: the agent wants to use a tool the SDK will not auto-allow. */
export interface AgentPermissionRequest {
  requestId: string;
  runId: string;
  cruxId: string;
  toolName: string;
  input: Record<string, unknown>;
  /** One line: the command, the url, the path. */
  summary: string;
}

/** The engine's ConversationEvent shape plus `session` and `result` (see agent-events.ts). */
export type AgentEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_start'; name: string; id: string; input: Record<string, unknown> }
  | { type: 'tool_result'; name: string; id: string; result: string; error?: boolean }
  | { type: 'step_end'; index: number }
  | { type: 'usage'; inputTokens: number; outputTokens: number; cachedInputTokens: number }
  | { type: 'info'; message: string }
  | { type: 'error'; message: string }
  | { type: 'done'; textContent: string; hadMutation: boolean }
  | { type: 'session'; sessionId: string; model: string; version: string }
  | { type: 'result'; costUsd: number; durationMs: number; numTurns: number; isError: boolean };

export interface AgentProviderBridge {
  status(force?: boolean, provider?: string): Promise<AgentStatus>;
  onToolRequest(cb: (request: AgentToolRequest) => void): () => void;
  respondTool(requestId: string, result: AgentToolResult): void;
  /** Resolves when the turn's stream has ended; events arrive through onEvent meanwhile. */
  start(opts: AgentStartOptions): Promise<void>;
  interrupt(runId: string): Promise<void>;
  answer(requestId: string, allow: boolean): void;
  onEvent(cb: (runId: string, event: AgentEvent) => void): () => void;
  onPermission(cb: (request: AgentPermissionRequest) => void): () => void;
}

/** Optional macOS POC. Placement and MCP connectivity are independent. */
export interface FigmaDesktopBridge {
  open(): Promise<void>;
  status(): Promise<{ arranged: boolean; accessibility: boolean }>;
  arrange(side: 'left' | 'right'): Promise<{ arranged: boolean; accessibility: boolean }>;
  restore(): Promise<{ arranged: boolean; accessibility: boolean }>;
}

// ── isolated WWW browser panel ──────────────────────────────────────────────
export type BrowserPanelAction =
  | 'state'
  | 'navigate'
  | 'back'
  | 'forward'
  | 'reload'
  | 'stop'
  | 'close';
export interface BrowserPanelState {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  back: boolean;
  forward: boolean;
  error: string | null;
}
export interface BrowserPanelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface BrowserPanelBridge {
  onFocusAddress(callback: (id: string) => void): () => void;
  action(id: string, action: BrowserPanelAction, url?: string): Promise<BrowserPanelState>;
  bounds(id: string, bounds: BrowserPanelBounds | null): Promise<void>;
  onChange(callback: (state: BrowserPanelState) => void): () => void;
}

// ── the whole bridge ────────────────────────────────────────────────────────

export interface ElectronBridge {
  browser?: BrowserPanelBridge;
  figmaDesktop?: FigmaDesktopBridge;
  blenderDesktop?: FigmaDesktopBridge;
  sqlite: SqliteBridge;
  desktop: DesktopBridge;
  project: ProjectBridge;
  preview: PreviewBridge;
  toolchain: ToolchainBridge;
  devserver: DevServerBridge;
  secrets: SecretsBridge;
  ffmpeg: FfmpegBridge;
  native: NativeToolsBridge;
  containers: ContainersBridge;
  projectRunner: ProjectRunnerBridge;
  media: MediaBridge;
  localai: LocalAiBridge;
  updates: UpdatesBridge;
  agentHost: AgentHostBridge;
  agent: AgentProviderBridge;
  /** The garden's configuration as launched (ADR 0049). */
  config: {
    /** Development CRUX_API_URL — pins the API address for this launch; null lets the garden's setting decide. */
    apiUrl: string | null;
    /** Development CRUX_V2=1 — shows v2 features; packaged builds ignore it. */
    v2: boolean;
  };
  /** Test overrides resolved by main; always inert in packaged builds. */
  test: {
    /** CRUX_MEDIA_API — Find media's catalogues and files come from this base instead of the public services. */
    mediaApiBase: string | null;
    aiMock: boolean;
    /** CRUX_AGENT_MOCK=1 — the Agent Provider runs a scripted Claude Code. */
    agentMock: boolean;
    /** CRUX_SILENT=1 — no soundscape or cues play (the e2e default; sound tests opt out). */
    silent: boolean;
    /**
     * CRUX_AI=on|off — whether a fresh garden starts with AI tools on (the e2e
     * default is on, so the collaborator journeys see Collaboration; AI-off
     * specs pass off). A choice saved in Settings always wins.
     */
    ai: 'on' | 'off' | null;
    /**
     * CRUX_PLAIN_TITLES=1 — `title=` attributes stay put and the app's own
     * tooltip layer is off (the e2e default: a tooltip moves a hovered
     * control's title aside, which a resting test pointer would hide from
     * `getByTitle`). Tooltip specs pass `titleTips: true`.
     */
    plainTitles: boolean;
    autoBackupQuietMs: number | null;
  };
}
