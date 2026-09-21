/**
 * Containers: a Crux's own stack, run with Docker Compose.
 *
 * The Crux carries `compose.yaml` in its Project Folder. This is the seam the
 * Stack bench and the collaborator both call; everything it does goes through
 * the shell, which pins the working directory to the folder, fixes the project
 * name to the Crux, allows only compose verbs, and reads the file for anything
 * dangerous before it starts. See `electron/src/containers.ts`.
 */
export type ComposeVerb =
  | 'up'
  | 'down'
  | 'ps'
  | 'logs'
  | 'pull'
  | 'config'
  | 'stop'
  | 'start'
  /** A command in a service: a fresh container, removed after. */
  | 'run'
  /** A command in the container already running. */
  | 'exec';

export interface ComposeService {
  name: string;
  image?: string;
  /** The comment above it in the file. */
  about?: string;
  /** Host ports the file asks for, as written. */
  ports: { host: number; container?: number }[];
  dependsOn: string[];
  healthcheck: boolean;
  restart?: string;
  envKeys: string[];
  volumes: string[];
  /** Compose profiles it belongs to; empty means it always runs. */
  profiles: string[];
}

/** A `${NAME}` the stack reads, and the default that makes it work unchanged. */
export interface ComposeVariable {
  name: string;
  fallback?: string;
  /** Set in the Crux's `.env` — whether, never what. */
  fromEnv: boolean;
}

export interface ComposeReading {
  services: ComposeService[];
  /** Why the stack must not start. Empty means it may run. */
  refusals: string[];
  /** The files Compose will read, base first, override after. */
  files: string[];
  profiles: string[];
  variables: ComposeVariable[];
}

export interface ComposeRunner {
  program: string;
  version: string;
}

/** One running container, as `compose ps` reports it. */
export interface RunningService {
  name: string;
  service: string;
  state: string;
  health?: string;
  ports: string;
}

function api() {
  const found = typeof window !== 'undefined' ? window.electronAPI?.containers : undefined;
  if (!found) throw new Error('Stacks need the desktop app.');
  return found;
}

/** What this machine can run a stack with, or null when it has neither. */
export async function composeRunner(refresh = false): Promise<ComposeRunner | null> {
  const found = typeof window !== 'undefined' ? window.electronAPI?.containers : undefined;
  if (!found) return null;
  return found.runner({ refresh });
}

/** The Crux's compose file: its services, and anything that forbids a start. */
export async function inspectCompose(cruxId: string, file?: string): Promise<ComposeReading> {
  return api().inspect({ cruxId, file });
}

/**
 * One compose verb for this Crux.
 *
 * The Crux's own secrets are handed to Compose as environment, so a stack can
 * read `${JWT_SECRET}` without anyone writing the value into a file that gets
 * published. Non-secret settings belong in `.env` beside the compose file,
 * which Compose reads by itself and which travels with the Crux.
 */
export async function compose(
  cruxId: string,
  verb: ComposeVerb,
  opts: {
    service?: string;
    tail?: number;
    timeoutMs?: number;
    profiles?: string[];
    /** The command for `run` or `exec`, as a list — never a command line. */
    command?: string[];
    /** Wait until what was started is healthy: what a task needs. */
    wait?: boolean;
  } = {},
): Promise<{ code: number; output: string }> {
  const { localSecrets } = await import('./crux-functions');
  return api().compose({ cruxId, verb, env: localSecrets(cruxId), ...opts });
}

/** One service as Compose resolves it, after every file, `.env` and profiles. */
export interface ResolvedService {
  name: string;
  image?: string;
  ports: { host: string; container: number; protocol?: string }[];
  environment: Record<string, string>;
  profiles: string[];
}

export interface ComposeResolution {
  services: ResolvedService[];
  error?: string;
  /** Host ports something else is already listening on. */
  taken: number[];
  /** What the app wrote into the override file last time. */
  overrides: { service: string; ports?: Record<string, string> }[];
  /**
   * What a neighbour needs to reach this stack — DATABASE_URL, REDIS_URL, a
   * port and a base URL per service — derived from what Compose resolved, so
   * it stays right when a port is overridden.
   */
  connections: Record<string, string>;
}

export interface OverrideWish {
  service: string;
  ports?: Record<string, string>;
  environment?: Record<string, string>;
}

/**
 * What the stack actually comes to, asked of Compose itself.
 *
 * Our reader describes the file, comments included; only Compose knows the
 * ports and environment after `.env`, the override file and the active
 * profiles. The panel shows what Compose says.
 */
export async function resolveCompose(
  cruxId: string,
  profiles: string[] = [],
): Promise<ComposeResolution> {
  return api().resolve({ cruxId, profiles });
}

/** Write this machine's ports and settings into the override file. */
export async function writeOverride(
  cruxId: string,
  wishes: OverrideWish[],
): Promise<{ written: boolean; snippet: string }> {
  return api().override({ cruxId, wishes });
}

/** A free host port, for offering a way out of a collision. */
export async function freePort(from = 8000): Promise<number> {
  return api().freePort({ from });
}

/** Lines from a run in flight; pulling images takes minutes. */
export function onComposeOutput(
  callback: (event: { cruxId: string; verb: string; line: string }) => void,
): () => void {
  const found = typeof window !== 'undefined' ? window.electronAPI?.containers : undefined;
  return found ? found.onOutput(callback) : () => {};
}

/**
 * What is running, from `compose ps --format json`. Compose writes one JSON
 * object per line in some versions and an array in others, so both are read.
 */
export async function runningServices(cruxId: string): Promise<RunningService[]> {
  const { output } = await compose(cruxId, 'ps');
  const text = output.trim();
  if (!text) return [];
  const rows: Record<string, unknown>[] = [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) rows.push(...(parsed as Record<string, unknown>[]));
    else rows.push(parsed as Record<string, unknown>);
  } catch {
    for (const line of text.split('\n')) {
      if (!line.trim().startsWith('{')) continue;
      try {
        rows.push(JSON.parse(line) as Record<string, unknown>);
      } catch {
        /* a line of ordinary output, not a row */
      }
    }
  }
  return rows.map((row) => ({
    name: String(row.Name ?? row.name ?? ''),
    service: String(row.Service ?? row.service ?? ''),
    state: String(row.State ?? row.state ?? ''),
    health: row.Health ? String(row.Health) : undefined,
    ports: String(row.Publishers ? describePublishers(row.Publishers) : (row.Ports ?? '')),
  }));
}

function describePublishers(publishers: unknown): string {
  if (!Array.isArray(publishers)) return '';
  return publishers
    .map((p) => {
      const entry = p as { PublishedPort?: number; TargetPort?: number };
      return entry.PublishedPort ? `${entry.PublishedPort}→${entry.TargetPort}` : '';
    })
    .filter(Boolean)
    .join(', ');
}

/**
 * Which open Cruxes actually carry a stack.
 *
 * The compose tools are only offered where they mean something, and whether a
 * Crux has a `compose.yaml` is a question about the folder, not the template —
 * someone can add one to any Crux. The Stack proxy asks once when a workspace
 * opens and records the answer here, so building the tool set stays cheap.
 */
const stackCruxes = new Set<string>();

export function markStackCrux(cruxId: string, hasStack: boolean): void {
  if (hasStack) stackCruxes.add(cruxId);
  else stackCruxes.delete(cruxId);
}

export function isStackCrux(cruxId?: string): boolean {
  return !!cruxId && stackCruxes.has(cruxId);
}
