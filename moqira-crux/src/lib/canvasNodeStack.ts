import type { CanvasNode } from "../types";

export type LayerAction = "front" | "back" | "forward" | "backward";

export type CanvasRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type IdFactory = (prefix: string) => string;
export type AlignmentSnapGuide = { axis: "x" | "y"; position: number };

export type AlignmentSnapOptions = {
  nodes: CanvasNode[];
  movingIds: string[];
  originalPositions: Record<string, { x: number; y: number }>;
  activeNodeId: string;
  rawX: number;
  rawY: number;
  canvasWidth?: number;
  canvasHeight?: number;
  threshold?: number;
};

export function pointHitsNode(x: number, y: number, node: CanvasNode) {
  return x >= node.x && x <= node.x + node.width && y >= node.y && y <= node.y + node.height;
}

export function rectFromPoints(startX: number, startY: number, currentX: number, currentY: number): CanvasRect {
  const x = Math.min(startX, currentX);
  const y = Math.min(startY, currentY);
  return {
    x,
    y,
    width: Math.abs(currentX - startX),
    height: Math.abs(currentY - startY),
  };
}

export function rectIntersectsNode(rect: CanvasRect, node: CanvasNode) {
  return rect.x <= node.x + node.width && rect.x + rect.width >= node.x && rect.y <= node.y + node.height && rect.y + rect.height >= node.y;
}

export function rectContainsNode(rect: CanvasRect, node: CanvasNode) {
  return rect.x <= node.x && rect.y <= node.y && rect.x + rect.width >= node.x + node.width && rect.y + rect.height >= node.y + node.height;
}

function boundsForNodes(nodes: CanvasNode[], positions: Record<string, { x: number; y: number }>): CanvasRect | null {
  const positioned = nodes.flatMap((node) => {
    const position = positions[node.id];
    return position ? [{ ...node, ...position }] : [];
  });
  if (!positioned.length) return null;
  const left = Math.min(...positioned.map((node) => node.x));
  const top = Math.min(...positioned.map((node) => node.y));
  const right = Math.max(...positioned.map((node) => node.x + node.width));
  const bottom = Math.max(...positioned.map((node) => node.y + node.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function bestAlignmentSnap(
  rawStart: number,
  originalStart: number,
  size: number,
  targets: number[],
  threshold: number,
): { delta: number; guides: number[] } {
  let best: { start: number; guides: number[]; dist: number } = { start: rawStart, guides: [], dist: threshold + 1 };
  for (const target of targets) {
    for (const edge of [0, size / 2, size]) {
      const snapped = Math.round(target - edge);
      const dist = Math.abs(snapped - rawStart);
      if (dist < best.dist) best = { start: snapped, guides: [target], dist };
      else if (dist === best.dist && best.start === snapped && !best.guides.includes(target)) best.guides.push(target);
    }
  }
  return best.dist <= threshold
    ? { delta: best.start - originalStart, guides: best.guides }
    : { delta: rawStart - originalStart, guides: [] };
}

export function calculateAlignmentSnap({
  nodes,
  movingIds,
  originalPositions,
  activeNodeId,
  rawX,
  rawY,
  canvasWidth,
  canvasHeight,
  threshold = 6,
}: AlignmentSnapOptions): { deltaX: number; deltaY: number; guides: AlignmentSnapGuide[] } {
  const moving = new Set(movingIds);
  const movingNodes = nodes.filter((node) => moving.has(node.id));
  const originalBounds = boundsForNodes(movingNodes, originalPositions);
  const activeOriginal = originalPositions[activeNodeId];
  if (!originalBounds || !activeOriginal) {
    return { deltaX: 0, deltaY: 0, guides: [] };
  }

  const rawDeltaX = rawX - activeOriginal.x;
  const rawDeltaY = rawY - activeOriginal.y;
  const rawBoundsX = originalBounds.x + rawDeltaX;
  const rawBoundsY = originalBounds.y + rawDeltaY;
  const xTargets: number[] = [];
  const yTargets: number[] = [];
  if (canvasWidth) xTargets.push(canvasWidth / 2);
  if (canvasHeight) yTargets.push(canvasHeight / 2);
  for (const node of nodes) {
    if (moving.has(node.id)) continue;
    xTargets.push(node.x, node.x + node.width / 2, node.x + node.width);
    yTargets.push(node.y, node.y + node.height / 2, node.y + node.height);
  }

  const snappedX = bestAlignmentSnap(rawBoundsX, originalBounds.x, originalBounds.width, xTargets, threshold);
  const snappedY = bestAlignmentSnap(rawBoundsY, originalBounds.y, originalBounds.height, yTargets, threshold);
  return {
    deltaX: snappedX.delta,
    deltaY: snappedY.delta,
    guides: [
      ...snappedX.guides.map((position) => ({ axis: "x" as const, position })),
      ...snappedY.guides.map((position) => ({ axis: "y" as const, position })),
    ],
  };
}

export function moveNodeLayer(nodes: CanvasNode[], ids: string[], action: LayerAction) {
  const selected = new Set(ids);
  if (!nodes.some((node) => selected.has(node.id))) return nodes;
  if (action === "front" || action === "back") {
    const moving = nodes.filter((node) => selected.has(node.id));
    const rest = nodes.filter((node) => !selected.has(node.id));
    return action === "front" ? [...rest, ...moving] : [...moving, ...rest];
  }
  const next = [...nodes];
  if (action === "forward") {
    for (let index = next.length - 2; index >= 0; index -= 1) {
      if (!selected.has(next[index].id) || selected.has(next[index + 1].id)) continue;
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
    }
  }
  if (action === "backward") {
    for (let index = 1; index < next.length; index += 1) {
      if (!selected.has(next[index].id) || selected.has(next[index - 1].id)) continue;
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
    }
  }
  return next;
}

export function patchNode(nodes: CanvasNode[], id: string, patch: Partial<CanvasNode>) {
  return nodes.map((node) => (node.id === id ? { ...node, ...patch } : node));
}

export function patchNodes(nodes: CanvasNode[], patches: Record<string, Partial<CanvasNode>>) {
  return nodes.map((node) => (patches[node.id] ? { ...node, ...patches[node.id] } : node));
}

export function selectedNodesInStack(nodes: CanvasNode[], ids: string[]) {
  const selected = new Set(ids);
  return nodes.filter((node) => selected.has(node.id));
}

export function duplicateNodesInStack(nodes: CanvasNode[], ids: string[], createId: IdFactory) {
  const duplicatesById = new Map(
    selectedNodesInStack(nodes, ids).map((node) => [
      node.id,
      { ...node, id: createId("node"), x: node.x + 24, y: node.y + 24 },
    ]),
  );
  return {
    nodes: nodes.flatMap((node) => {
      const duplicate = duplicatesById.get(node.id);
      return duplicate ? [node, duplicate] : [node];
    }),
    duplicates: Array.from(duplicatesById.values()),
  };
}

export function cloneNodesForPaste(
  clipboard: CanvasNode[],
  createId: IdFactory,
  point?: { x: number; y: number },
) {
  const minX = Math.min(...clipboard.map((node) => node.x));
  const minY = Math.min(...clipboard.map((node) => node.y));
  const offsetX = point ? Math.round(point.x - minX) : 24;
  const offsetY = point ? Math.round(point.y - minY) : 24;
  return clipboard.map((item) => ({
    ...item,
    id: createId("node"),
    x: Math.round(item.x + offsetX),
    y: Math.round(item.y + offsetY),
    name: item.name,
  }));
}
