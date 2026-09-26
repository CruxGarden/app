import type { MosaicNode } from 'react-mosaic-component';

// A stable landscape canvas keeps automatic arrangements consistent across UI and
// agent calls, including background workspaces. Manual proportions remain authoritative.
const WIDTH = 16;
const HEIGHT = 10;

export function buildMosaicTree<T extends string>(
  panes: T[],
  width = WIDTH,
  height = HEIGHT,
): MosaicNode<T> | null {
  if (!panes.length) return null;
  if (panes.length === 1) return panes[0]!;
  const mid = Math.ceil(panes.length / 2);
  const ratio = mid / panes.length;
  const row = width >= height;
  return {
    direction: row ? 'row' : 'column',
    first: buildMosaicTree(
      panes.slice(0, mid),
      row ? width * ratio : width,
      row ? height : height * ratio,
    )!,
    second: buildMosaicTree(
      panes.slice(mid),
      row ? width * (1 - ratio) : width,
      row ? height : height * (1 - ratio),
    )!,
    splitPercentage: ratio * 100,
  };
}

/**
 * Share the largest tile rather than repeatedly shrinking the entire workspace.
 * Rails (`keep`, e.g. Tasks or the Navigator) are narrow by design: they count
 * at half their area, so they are shared only once the rest is crowded.
 */
export function addPaneToMosaic<T extends string>(
  tree: MosaicNode<T> | null,
  pane: T,
  keep: ReadonlySet<T> = new Set(),
): MosaicNode<T> {
  if (tree === null) return pane;
  let largest: { pane: T; area: number; width: number; height: number } | undefined;
  let exists = false;
  const visit = (node: MosaicNode<T>, width: number, height: number) => {
    if (typeof node === 'string') {
      exists ||= node === pane;
      const area = keep.has(node) ? (width * height) / 2 : width * height;
      if (!largest || area > largest.area) largest = { pane: node, area, width, height };
      return;
    }
    const ratio = (node.splitPercentage ?? 50) / 100;
    const row = node.direction === 'row';
    visit(node.first, row ? width * ratio : width, row ? height : height * ratio);
    visit(node.second, row ? width * (1 - ratio) : width, row ? height : height * (1 - ratio));
  };
  visit(tree, WIDTH, HEIGHT);
  if (exists) return tree;
  const target = largest!;
  const split = (node: MosaicNode<T>): MosaicNode<T> => {
    if (typeof node === 'string')
      return node === target.pane
        ? {
            direction: target.width >= target.height ? 'row' : 'column',
            first: node,
            second: pane,
            splitPercentage: 50,
          }
        : node;
    const first = split(node.first);
    const second = split(node.second);
    return first === node.first && second === node.second ? node : { ...node, first, second };
  };
  return split(tree);
}
