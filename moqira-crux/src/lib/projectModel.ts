import type { MockupProject, Wireframe } from "../types";

export type ProjectChangeOptions = {
  groupKey?: string;
};

export type ProjectHistory = {
  past: MockupProject[];
  present: MockupProject;
  future: MockupProject[];
};

export const maxProjectHistoryEntries = 100;

export type IdFactory = (prefix: string) => string;

export function wireframeBackground(wireframe: Wireframe | undefined) {
  return wireframe?.background ?? "white";
}

export function wireframeShowGrid(wireframe: Wireframe | undefined) {
  return wireframe?.showGrid ?? true;
}

export function createDefaultAppearance(): MockupProject["appearance"] {
  return {
    colorScheme: "system",
    accentColor: "#2563eb",
    appFontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    appFontSize: 14,
    accentTitlebar: false,
  };
}

export function createEmptyWireframe(id: string, name: string): Wireframe {
  return {
    id,
    name,
    background: "white",
    showGrid: true,
    nodes: [],
  };
}

export function createDefaultProject(createId: IdFactory): MockupProject {
  const firstWireframeId = createId("wireframe");
  return {
    schemaVersion: 1,
    name: "New Project",
    activeWireframeId: firstWireframeId,
    appearance: createDefaultAppearance(),
    wireframes: [createEmptyWireframe(firstWireframeId, "Wireframe 1")],
  };
}

export function uniqueWireframeName(baseName: string, wireframes: Wireframe[]) {
  const normalizedNames = new Set(wireframes.map((wireframe) => wireframe.name.trim().toLowerCase()));
  const cleanBaseName = baseName.trim() || "Wireframe";
  if (!normalizedNames.has(cleanBaseName.toLowerCase())) return cleanBaseName;
  for (let index = 2; ; index += 1) {
    const candidate = `${cleanBaseName} ${index}`;
    if (!normalizedNames.has(candidate.toLowerCase())) return candidate;
  }
}

export function createNextWireframe(wireframes: Wireframe[], createId: IdFactory): Wireframe {
  return createEmptyWireframe(
    createId("wireframe"),
    uniqueWireframeName(`Wireframe ${wireframes.length + 1}`, wireframes),
  );
}

export function duplicateWireframe(sourceWireframe: Wireframe, wireframes: Wireframe[], createId: IdFactory): Wireframe {
  return {
    id: createId("wireframe"),
    name: uniqueWireframeName(`${sourceWireframe.name} copy`, wireframes),
    background: wireframeBackground(sourceWireframe),
    showGrid: wireframeShowGrid(sourceWireframe),
    nodes: sourceWireframe.nodes.map((node) => ({ ...node, id: createId("node") })),
  };
}

export function projectSnapshot(project: MockupProject) {
  return JSON.stringify(project);
}

export function dirtyProjectSnapshot(project: MockupProject) {
  return projectSnapshot({ ...project, activeWireframeId: "" });
}

export function createProjectHistory(project: MockupProject): ProjectHistory {
  return { past: [], present: project, future: [] };
}

export function pushHistoryEntry(past: MockupProject[], project: MockupProject) {
  return [...past, project].slice(-maxProjectHistoryEntries);
}

export function commitProjectHistoryChange(
  current: ProjectHistory,
  updater: (project: MockupProject) => MockupProject,
  options: ProjectChangeOptions,
  activeGroupKey: string | null,
): { history: ProjectHistory; groupKey: string | null } {
  const nextProject = updater(current.present);
  if (projectSnapshot(nextProject) === projectSnapshot(current.present)) {
    return { history: current, groupKey: activeGroupKey };
  }

  const isSameGroup = Boolean(options.groupKey) && activeGroupKey === options.groupKey;
  return {
    history: {
      past: isSameGroup ? current.past : pushHistoryEntry(current.past, current.present),
      present: nextProject,
      future: [],
    },
    groupKey: options.groupKey ?? null,
  };
}

export function undoProjectHistory(current: ProjectHistory): ProjectHistory {
  const previous = current.past.at(-1);
  if (!previous) return current;
  return {
    past: current.past.slice(0, -1),
    present: previous,
    future: [current.present, ...current.future],
  };
}

export function redoProjectHistory(current: ProjectHistory): ProjectHistory {
  const next = current.future[0];
  if (!next) return current;
  return {
    past: pushHistoryEntry(current.past, current.present),
    present: next,
    future: current.future.slice(1),
  };
}

export function updateActiveWireframeInProject(
  project: MockupProject,
  updater: (wireframe: Wireframe) => Wireframe,
): MockupProject {
  return {
    ...project,
    wireframes: project.wireframes.map((wireframe) =>
      wireframe.id === project.activeWireframeId ? updater(wireframe) : wireframe,
    ),
  };
}
