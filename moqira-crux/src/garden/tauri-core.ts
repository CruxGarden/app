// Stands in for @tauri-apps/api/core inside Crux Garden (see vite.config.ts).
// Moqira's own API layer (src/lib/mockupsApi.ts) calls invoke with the seven
// commands its Rust side implements; here they reach the Garden instead.
import type { MockupProject } from '../types';
import { edition, garden, ready } from './bridge';
import { takeImported } from './tauri-dialog';

const PROJECT_PATH = 'mockups/project.json';
const EDITION_PATH = 'public-edition.moq';

export async function invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T> {
  switch (command) {
    case 'read_last_project_path':
      if (edition) return EDITION_PATH as T;
      await ready;
      return (garden.hasProject() ? PROJECT_PATH : null) as T;
    case 'open_project_file': {
      const path = String(args?.path ?? '');
      if (edition) return JSON.parse(JSON.stringify(edition)) as T;
      const imported = takeImported(path);
      if (imported) return imported as T;
      await ready;
      return garden.project() as T;
    }
    case 'save_project_file': {
      const payload = args?.payload as { path: string; project: MockupProject } | undefined;
      if (!payload?.project) throw new Error('Nothing to save.');
      await garden.save(payload.project); // the Crux owns one project, whatever path the app chose
      return undefined as T;
    }
    case 'write_last_project_path':
    case 'sync_recent_projects':
    case 'sync_edit_menu_state':
    case 'reveal_project':
      return undefined as T; // native menus, recents and Finder belong to the desktop app
    default:
      throw new Error(`Unsupported Moqira command in Crux Garden: ${command}`);
  }
}
export function convertFileSrc(path: string) {
  return path;
}
