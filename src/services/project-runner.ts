import { Capability, can } from '@/lib/platform';
import type { ProjectInfo, ProjectState } from '../../electron/src/bridge';

/**
 * Running a project hooked in by a Link Crux.
 *
 * The Stack Crux runs the services around your code; this runs the code. The
 * checkout stays in its own repository — these projects are pushed to GitLab,
 * not made residents of the garden — and the Crux records how it runs here: which script,
 * on which port, with which environment.
 *
 * A folder becomes runnable only by being chosen in the OS dialog, so nothing
 * a Crux carries can point the app at a folder its owner never picked.
 */
export type { ProjectInfo, ProjectState };

export function projectRunnerAvailable(): boolean {
  return can(Capability.ProjectRunner);
}

function api() {
  const found = typeof window !== 'undefined' ? window.electronAPI?.projectRunner : undefined;
  if (!found) throw new Error('Running a project needs the desktop app.');
  return found;
}

/** Open the folder picker. Choosing it is the approval. */
export async function chooseProject(): Promise<ProjectInfo | null> {
  return api().choose();
}

/** What a folder offers, and whether it has been chosen before. */
export async function readProject(folder: string): Promise<ProjectInfo | null> {
  return api().read({ folder });
}

/**
 * What a linked folder holds, without taking any of it in.
 *
 * A Link of kind `folder` points at things too large or too numerous to
 * ingest — a directory of footage, a dataset — so this reports what is there
 * and how much, and nothing is copied.
 */
export async function scanLinked(folder: string): Promise<{
  files: string[];
  bytes: number;
  ignored: number;
  ignoredBytes: number;
  large: { path: string; bytes: number }[];
  truncated: boolean;
} | null> {
  const found = typeof window !== 'undefined' ? window.electronAPI?.projectRunner : undefined;
  return found?.scan ? found.scan({ folder }) : null;
}

export async function projectState(cruxId: string): Promise<ProjectState> {
  const found = typeof window !== 'undefined' ? window.electronAPI?.projectRunner : undefined;
  return found ? found.state({ cruxId }) : { status: 'idle', log: '' };
}

export async function startProject(
  cruxId: string,
  folder: string,
  script: string,
  opts: { args?: string[]; port?: number; env?: Record<string, string> } = {},
): Promise<ProjectState> {
  return api().start({ cruxId, folder, script, ...opts });
}

export async function stopProject(cruxId: string): Promise<boolean> {
  return api().stop({ cruxId });
}

/**
 * Which open Cruxes are Link Cruxes.
 *
 * The link tools are offered where they mean something and nowhere else.
 * The proxy records it when a workspace opens, which is also when the Crux's
 * own `project.json` is read.
 */
const linkCruxes = new Set<string>();

export function markLinkCrux(cruxId: string, isProject: boolean): void {
  if (isProject) linkCruxes.add(cruxId);
  else linkCruxes.delete(cruxId);
}

export function isLinkCrux(cruxId?: string): boolean {
  return !!cruxId && linkCruxes.has(cruxId);
}
