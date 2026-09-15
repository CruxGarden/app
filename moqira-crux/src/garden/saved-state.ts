import type { MockupProject } from '../types';
import type { ProjectHistory } from '../lib/projectModel';

/** A completed asynchronous Save acknowledges its captured version, never a newer draft. */
export function acknowledgeSavedProject(
  current: ProjectHistory,
  captured: MockupProject,
  saved: MockupProject,
): ProjectHistory {
  return JSON.stringify(current.present) === JSON.stringify(captured)
    ? { ...current, present: saved }
    : current;
}
