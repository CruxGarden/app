import { describe, expect, it } from "vitest";
import type { CanvasNode, MockupProject, Wireframe } from "../types";
import {
  commitProjectHistoryChange,
  createDefaultProject,
  createProjectHistory,
  dirtyProjectSnapshot,
  duplicateWireframe,
  redoProjectHistory,
  undoProjectHistory,
  uniqueWireframeName,
  updateActiveWireframeInProject,
} from "./projectModel";

function idFactory() {
  let nextId = 1;
  return (prefix: string) => `${prefix}-${nextId++}`;
}

function node(id: string): CanvasNode {
  return {
    id,
    kind: "button",
    name: id,
    x: 10,
    y: 20,
    width: 80,
    height: 40,
  };
}

function wireframe(id: string, name: string, nodes: CanvasNode[] = []): Wireframe {
  return {
    id,
    name,
    background: "white",
    showGrid: true,
    nodes,
  };
}

function renameProject(name: string) {
  return (project: MockupProject): MockupProject => ({ ...project, name });
}

describe("projectModel", () => {
  it("creates a default Project with a matching active Wireframe", () => {
    const project = createDefaultProject(idFactory());

    expect(project.name).toBe("New Project");
    expect(project.activeWireframeId).toBe("wireframe-1");
    expect(project.wireframes).toEqual([
      {
        id: "wireframe-1",
        name: "Wireframe 1",
        background: "white",
        showGrid: true,
        nodes: [],
      },
    ]);
  });

  it("ignores the active Wireframe pointer when computing dirty snapshots", () => {
    const project = createDefaultProject(idFactory());
    const otherActiveProject = { ...project, activeWireframeId: "another-wireframe" };
    const renamedProject = { ...project, name: "Renamed" };

    expect(dirtyProjectSnapshot(project)).toBe(dirtyProjectSnapshot(otherActiveProject));
    expect(dirtyProjectSnapshot(project)).not.toBe(dirtyProjectSnapshot(renamedProject));
  });

  it("names Wireframes without colliding case-insensitively", () => {
    const wireframes = [wireframe("one", "Wireframe"), wireframe("two", "wireframe 2")];

    expect(uniqueWireframeName(" Wireframe ", wireframes)).toBe("Wireframe 3");
    expect(uniqueWireframeName("", wireframes)).toBe("Wireframe 3");
    expect(uniqueWireframeName("Checkout", wireframes)).toBe("Checkout");
  });

  it("duplicates a Wireframe with copied Canvas Nodes at the original positions and default fallbacks", () => {
    const source = { ...wireframe("source", "Checkout", [node("node-a")]), background: undefined, showGrid: undefined };
    const duplicate = duplicateWireframe(source, [source], idFactory());

    expect(duplicate.id).toBe("wireframe-1");
    expect(duplicate.name).toBe("Checkout copy");
    expect(duplicate.background).toBe("white");
    expect(duplicate.showGrid).toBe(true);
    expect(duplicate.nodes).toEqual([
      {
        ...node("node-2"),
        name: "node-a",
        x: 10,
        y: 20,
      },
    ]);
  });

  it("groups Project history changes by group key and supports undo and redo", () => {
    const initialProject = createDefaultProject(idFactory());
    const initialHistory = createProjectHistory(initialProject);
    const first = commitProjectHistoryChange(initialHistory, renameProject("First"), { groupKey: "name" }, null);
    const second = commitProjectHistoryChange(first.history, renameProject("Second"), { groupKey: "name" }, first.groupKey);
    const third = commitProjectHistoryChange(second.history, renameProject("Third"), { groupKey: "other" }, second.groupKey);

    expect(first.groupKey).toBe("name");
    expect(second.history.past).toHaveLength(1);
    expect(second.history.past[0].name).toBe("New Project");
    expect(third.history.past.map((project) => project.name)).toEqual(["New Project", "Second"]);

    const undone = undoProjectHistory(third.history);
    expect(undone.present.name).toBe("Second");
    expect(undone.future[0].name).toBe("Third");

    const redone = redoProjectHistory(undone);
    expect(redone.present.name).toBe("Third");
    expect(redone.future).toHaveLength(0);
  });

  it("updates only the active Wireframe", () => {
    const project = createDefaultProject(idFactory());
    const inactive = wireframe("wireframe-2", "Other");
    const withInactive = { ...project, wireframes: [...project.wireframes, inactive] };

    const updated = updateActiveWireframeInProject(withInactive, (item) => ({
      ...item,
      nodes: [node("active-node")],
    }));

    expect(updated.wireframes[0].nodes).toHaveLength(1);
    expect(updated.wireframes[1]).toBe(inactive);
  });
});
