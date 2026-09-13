import { invoke } from "@tauri-apps/api/core";
import type { MockupProject } from "../types";

export type RecentProjectPayload = {
  path: string;
  name: string;
  openedAt: number;
};

export type EditMenuStatePayload = {
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  canPaste: boolean;
  canLockSelection: boolean;
  hasLockedNodes: boolean;
};

const demoProjectKey = "moqira-demo-project";
const legacyDemoProjectKey = "mockups-demo-project";
const lastProjectPathKey = "moqira-last-project-path";
const legacyLastProjectPathKey = "mockups-last-project-path";

export function isTauri() {
  return "__TAURI_INTERNALS__" in window;
}

export async function openProjectFile(path: string): Promise<MockupProject> {
  if (isTauri()) return invoke<MockupProject>("open_project_file", { path });
  const raw = localStorage.getItem(demoProjectKey) ?? localStorage.getItem(legacyDemoProjectKey);
  if (!raw) throw new Error("No browser demo project has been saved yet.");
  if (!localStorage.getItem(demoProjectKey)) localStorage.setItem(demoProjectKey, raw);
  return JSON.parse(raw) as MockupProject;
}

export async function saveProjectFile(path: string, project: MockupProject): Promise<void> {
  if (isTauri()) {
    await invoke("save_project_file", { payload: { path, project } });
    return;
  }
  localStorage.setItem(demoProjectKey, JSON.stringify(project, null, 2));
}

export async function readLastProjectPath(): Promise<string | null> {
  if (isTauri()) return invoke<string | null>("read_last_project_path");
  const path = localStorage.getItem(lastProjectPathKey) ?? localStorage.getItem(legacyLastProjectPathKey);
  if (path && !localStorage.getItem(lastProjectPathKey)) localStorage.setItem(lastProjectPathKey, path);
  return path;
}

export async function writeLastProjectPath(path: string | null): Promise<void> {
  if (isTauri()) {
    await invoke("write_last_project_path", { path });
    return;
  }
  if (path) {
    localStorage.setItem(lastProjectPathKey, path);
  } else {
    localStorage.removeItem(lastProjectPathKey);
    localStorage.removeItem(legacyLastProjectPathKey);
  }
}

export async function syncRecentProjects(recentProjects: RecentProjectPayload[]): Promise<void> {
  if (!isTauri()) return;
  await invoke("sync_recent_projects", { recentProjects });
}

export async function syncEditMenuState(state: EditMenuStatePayload): Promise<void> {
  if (!isTauri()) return;
  await invoke("sync_edit_menu_state", { state });
}

export async function revealProject(path: string) {
  if (!isTauri()) return;
  await invoke("reveal_project", { path });
}
