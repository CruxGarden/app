import { describe, expect, it } from "vitest";
import type { CanvasNode } from "../types";
import {
  calculateAlignmentSnap,
  cloneNodesForPaste,
  duplicateNodesInStack,
  moveNodeLayer,
  pointHitsNode,
  rectContainsNode,
  rectFromPoints,
  rectIntersectsNode,
} from "./canvasNodeStack";

function node(id: string, x: number, y: number): CanvasNode {
  return {
    id,
    kind: "button",
    name: id,
    x,
    y,
    width: 40,
    height: 30,
  };
}

function ids(nodes: CanvasNode[]) {
  return nodes.map((item) => item.id);
}

function idFactory() {
  let nextId = 1;
  return (prefix: string) => `${prefix}-${nextId++}`;
}

describe("canvasNodeStack", () => {
  it("moves selected canvas nodes through layer order without splitting selected groups", () => {
    const nodes = [node("a", 0, 0), node("b", 10, 0), node("c", 20, 0), node("d", 30, 0)];

    expect(ids(moveNodeLayer(nodes, ["b", "c"], "forward"))).toEqual(["a", "d", "b", "c"]);
    expect(ids(moveNodeLayer(nodes, ["b", "c"], "backward"))).toEqual(["b", "c", "a", "d"]);
    expect(ids(moveNodeLayer(nodes, ["b", "c"], "front"))).toEqual(["a", "d", "b", "c"]);
    expect(ids(moveNodeLayer(nodes, ["b", "c"], "back"))).toEqual(["b", "c", "a", "d"]);
  });

  it("duplicates selected canvas nodes directly after their originals", () => {
    const nodes = [node("a", 0, 0), node("b", 10, 0), node("c", 20, 0)];
    const result = duplicateNodesInStack(nodes, ["a", "c"], idFactory());

    expect(ids(result.nodes)).toEqual(["a", "node-1", "b", "c", "node-2"]);
    expect(result.duplicates.map((item) => ({ id: item.id, x: item.x, y: item.y }))).toEqual([
      { id: "node-1", x: 24, y: 24 },
      { id: "node-2", x: 44, y: 24 },
    ]);
  });

  it("clones pasted canvas nodes using either a default offset or a target point", () => {
    const clipboard = [node("a", 10, 20), node("b", 30, 50)];

    expect(cloneNodesForPaste(clipboard, idFactory()).map((item) => ({ id: item.id, x: item.x, y: item.y }))).toEqual([
      { id: "node-1", x: 34, y: 44 },
      { id: "node-2", x: 54, y: 74 },
    ]);
    expect(cloneNodesForPaste(clipboard, idFactory(), { x: 100, y: 200 }).map((item) => ({ id: item.id, x: item.x, y: item.y }))).toEqual([
      { id: "node-1", x: 100, y: 200 },
      { id: "node-2", x: 120, y: 230 },
    ]);
  });

  it("derives selection rectangles and hit tests against canvas nodes", () => {
    const target = node("target", 10, 20);

    expect(rectFromPoints(40, 60, 10, 20)).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    expect(pointHitsNode(10, 20, target)).toBe(true);
    expect(pointHitsNode(51, 20, target)).toBe(false);
    expect(rectIntersectsNode({ x: 0, y: 0, width: 15, height: 25 }, target)).toBe(true);
    expect(rectIntersectsNode({ x: 0, y: 0, width: 9, height: 19 }, target)).toBe(false);
    expect(rectContainsNode({ x: 10, y: 20, width: 40, height: 30 }, target)).toBe(true);
    expect(rectContainsNode({ x: 0, y: 0, width: 15, height: 25 }, target)).toBe(false);
  });

  it("snaps moved nodes to peer left, center, right, top, middle, and bottom guides", () => {
    const nodes = [node("moving", 10, 20), node("target", 100, 80)];

    expect(
      calculateAlignmentSnap({
        nodes,
        movingIds: ["moving"],
        originalPositions: { moving: { x: 10, y: 20 } },
        activeNodeId: "moving",
        rawX: 59,
        rawY: 46,
      }),
    ).toEqual({
      deltaX: 50,
      deltaY: 30,
      guides: [
        { axis: "x", position: 100 },
        { axis: "y", position: 80 },
      ],
    });
  });

  it("snaps moved groups as a unit", () => {
    const nodes = [node("a", 10, 20), node("b", 70, 20), node("target", 160, 90)];

    expect(
      calculateAlignmentSnap({
        nodes,
        movingIds: ["a", "b"],
        originalPositions: { a: { x: 10, y: 20 }, b: { x: 70, y: 20 } },
        activeNodeId: "a",
        rawX: 54,
        rawY: 86,
      }),
    ).toEqual({
      deltaX: 50,
      deltaY: 70,
      guides: [
        { axis: "x", position: 160 },
        { axis: "y", position: 90 },
        { axis: "y", position: 105 },
        { axis: "y", position: 120 },
      ],
    });
  });
});
