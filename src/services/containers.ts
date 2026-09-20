/**
 * Containers: a Crux's own stack, run with Docker Compose.
 *
 * The Crux carries `compose.yaml` in its Project Folder. This is the seam the
 * Stack bench and the collaborator both call; everything it does goes through
 * the shell, which pins the working directory to the folder, fixes the project
 * name to the Crux, allows only compose verbs, and reads the file for anything
 * dangerous before it starts. See `electron/src/containers.ts`.
 */
export type ComposeVerb = 'up' | 'down' | 'ps' | 'logs' | 'pull' | 'config' | 'stop' | 'start';

export interface ComposeService {
  name: string;
  image?: string;
  /** Host ports the file asks for, as written. */
  ports: number[];
}

export interface ComposeReading {
  services: ComposeService[];
  /** Why the stack must not start. Empty means it may run. */
  refusals: string[];
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

export async function compose(
  cruxId: string,
  verb: ComposeVerb,
  opts: { service?: string; tail?: number; timeoutMs?: number } = {},
): Promise<{ code: number; output: string }> {
  return api().compose({ cruxId, verb, ...opts });
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
