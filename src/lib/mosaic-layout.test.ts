import { describe, expect, it } from 'vitest';
import type { MosaicNode } from 'react-mosaic-component';
import { addPaneToMosaic, buildMosaicTree } from './mosaic-layout';

function rectangles(
  node: MosaicNode<string> | null,
  width = 1600,
  height = 1000,
): { pane: string; width: number; height: number }[] {
  if (node === null) return [];
  if (typeof node === 'string') return [{ pane: node, width, height }];
  const ratio = (node.splitPercentage ?? 50) / 100;
  const row = node.direction === 'row';
  return [
    ...rectangles(node.first, row ? width * ratio : width, row ? height : height * ratio),
    ...rectangles(
      node.second,
      row ? width * (1 - ratio) : width,
      row ? height : height * (1 - ratio),
    ),
  ];
}
describe('panel fitting', () => {
  it('keeps every panel reachable when all sixteen are opened in sequence', () => {
    let tree: MosaicNode<string> | null = null;
    for (let i = 0; i < 16; i++) {
      tree = addPaneToMosaic(tree, String(i));
      const tiles = rectangles(tree);
      expect(tiles).toHaveLength(i + 1);
      expect(new Set(tiles.map((tile) => tile.pane)).size).toBe(i + 1);
      expect(Math.min(...tiles.map((tile) => tile.width))).toBeGreaterThanOrEqual(200);
      expect(Math.min(...tiles.map((tile) => tile.height))).toBeGreaterThanOrEqual(125);
    }
  });
  it('preserves manually sized ancestors and unrelated tiles while splitting the largest tile', () => {
    const small: MosaicNode<string> = {
      direction: 'column',
      first: 'a',
      second: 'b',
      splitPercentage: 30,
    };
    const tree: MosaicNode<string> = {
      direction: 'row',
      first: small,
      second: 'c',
      splitPercentage: 25,
    };
    const result = addPaneToMosaic(tree, 'd');
    expect(result).toEqual({
      ...tree,
      second: { direction: 'row', first: 'c', second: 'd', splitPercentage: 50 },
    });
    expect(typeof result !== 'string' && result.first).toBe(small);
    expect(addPaneToMosaic(tree, 'c')).toBe(tree);
  });
  it('arranges empty, single and crowded workspaces without losing panels or making a strip', () => {
    expect(buildMosaicTree([])).toBeNull();
    expect(buildMosaicTree(['a'])).toBe('a');
    const tiles = rectangles(buildMosaicTree(Array.from({ length: 16 }, (_, i) => String(i))));
    expect(tiles).toHaveLength(16);
    expect(tiles.every((tile) => tile.width >= 200 && tile.height >= 125)).toBe(true);
  });
});
