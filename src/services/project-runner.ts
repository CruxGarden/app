import { Capability, can } from '@/lib/platform';
import type { ProjectInfo, ProjectState } from '../../electron/src/bridge';

/**
 * Running a project that lives outside the Crux (the Project Crux).
 *
 * The Stack Crux runs the services around your code; this runs the code. The
 * checkout stays in its own repository — these projects are pushed to GitLab,
 * not shared as Cruxes — and the Crux records how it runs here: which script,
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
 * Which open Cruxes are Project Cruxes.
 *
 * The project tools are offered where they mean something and nowhere else.
 * The proxy records it when a workspace opens, which is also when the Crux's
 * own `project.json` is read.
 */
const projectCruxes = new Set<string>();

export function markProjectCrux(cruxId: string, isProject: boolean): void {
  if (isProject) projectCruxes.add(cruxId);
  else projectCruxes.delete(cruxId);
}

export function isProjectCrux(cruxId?: string): boolean {
  return !!cruxId && projectCruxes.has(cruxId);
}
