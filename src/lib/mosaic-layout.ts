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
  /** Least width each pane reads in, as a fraction of the workspace (0–1). */
  minWidth: (pane: T) => number = () => 0,
): MosaicNode<T> {
  if (tree === null) return pane;
  let largest: { pane: T; area: number; width: number; height: number; fits: boolean } | undefined;
  let exists = false;
  const visit = (node: MosaicNode<T>, width: number, height: number) => {
    if (typeof node === 'string') {
      exists ||= node === pane;
      // A tile is split side by side when both halves keep their least width;
      // otherwise it is stacked. Prefer a tile that fits, then the widest, then
      // the largest. A rail counts at half.
      const scale = keep.has(node) ? 0.5 : 1;
      const share = width / WIDTH;
      // Room to spare beyond the least width: the frame's gutters and controls
      // need it, and a tile at exactly its least width reads as squeezed.
      const fits = share / 2 >= minWidth(node) * 1.25 && share / 2 >= minWidth(pane) * 1.25;
      const area = width * height * scale;
      const better =
        !largest ||
        (fits && !largest.fits) ||
        (fits === largest.fits &&
          (width * scale > largest.width * (keep.has(largest.pane) ? 0.5 : 1) + 1e-9 ||
            (Math.abs(width * scale - largest.width * (keep.has(largest.pane) ? 0.5 : 1)) < 1e-9 &&
              area > largest.area)));
      if (better) largest = { pane: node, area, width, height, fits };
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
            direction: target.fits && target.width >= target.height ? 'row' : 'column',
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
