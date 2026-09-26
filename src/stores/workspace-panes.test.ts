import { expect, it } from 'vitest';
import type { MosaicNode } from 'react-mosaic-component';
import { createUIStore, getMosaicLeaves, type PaneType } from './uiStore';

/** Width of a pane as a fraction of the workspace (a column split shares its width). */
function share(node: MosaicNode<PaneType> | null, pane: PaneType, of = 1): number {
  if (node === null) return 0;
  if (typeof node === 'string') return node === pane ? of : 0;
  if (node.direction === 'column')
    return share(node.first, pane, of) + share(node.second, pane, of);
  const split = (node.splitPercentage ?? 50) / 100;
  return share(node.first, pane, of * split) + share(node.second, pane, of * (1 - split));
}

it('opens a Garden on its Home alone and offers only Garden panes', () => {
  const ui = createUIStore('garden-a', 'garden');
  expect(getMosaicLeaves(ui.getState().mosaicLayout)).toEqual(['home']);
  ui.getState().setPaneVisible('tasks', true);
  expect(getMosaicLeaves(ui.getState().mosaicLayout)).toEqual(['home']);
  expect(ui.getState().workspaceScope).toBe('garden');
});

it('docks the Navigator left and stacks Garden-wide panes in one right column', () => {
  const ui = createUIStore('garden-b', 'garden');
  ui.getState().setPaneVisible('mood', true);
  ui.getState().setPaneVisible('navigator', true);
  ui.getState().setPaneVisible('settings', true);
  const tree = ui.getState().mosaicLayout;
  expect(share(tree, 'navigator')).toBeCloseTo(0.2, 2);
  expect(share(tree, 'mood')).toBeCloseTo(0.32, 2);
  expect(share(tree, 'settings')).toBeCloseTo(0.32, 2);
  expect(getMosaicLeaves(tree)[0]).toBe('navigator');
});

it('opening a pane brings it forward in the one-pane narrow layout', () => {
  const ui = createUIStore('crux-c');
  ui.getState().setPaneVisible('mood', true);
  expect(ui.getState().mobileActivePane).toBe('mood');
  ui.getState().togglePane('navigator');
  expect(ui.getState().mobileActivePane).toBe('navigator');
});

it('shares the Tasks rail only once the rest is crowded', () => {
  const ui = createUIStore('crux-d');
  for (const pane of ['tasks', 'collaboration', 'workshop'] as const)
    ui.getState().setPaneVisible(pane, true);
  // A new Crux: the Tasks rail beside Collaboration and the Workshop.
  ui.setState({
    mosaicLayout: {
      direction: 'row',
      first: 'tasks',
      second: { direction: 'row', first: 'collaboration', second: 'workshop' },
      splitPercentage: 20,
    },
  });
  for (const pane of ['artifacts', 'publish', 'store'] as const)
    ui.getState().setPaneVisible(pane, true);
  // The tile's height as a fraction of the workspace: the rail keeps all of it.
  const height = (node: MosaicNode<PaneType> | null, pane: PaneType, of = 1): number => {
    if (node === null) return 0;
    if (typeof node === 'string') return node === pane ? of : 0;
    const split = (node.splitPercentage ?? 50) / 100;
    if (node.direction === 'row')
      return height(node.first, pane, of) + height(node.second, pane, of);
    return height(node.first, pane, of * split) + height(node.second, pane, of * (1 - split));
  };
  const tree = ui.getState().mosaicLayout;
  expect(height(tree, 'tasks')).toBe(1);
  expect(getMosaicLeaves(tree)).toContain('store');
});

it('a new pane never squeezes another below its least width', () => {
  const ui = createUIStore('crux-e');
  for (const pane of ['tasks', 'collaboration', 'workshop', 'history', 'publish'] as const)
    ui.getState().setPaneVisible(pane, true);
  // Every open pane keeps at least its share of a typical workspace.
  const tree = ui.getState().mosaicLayout;
  const px = (pane: PaneType) => share(tree, pane) * 1400;
  expect(px('collaboration')).toBeGreaterThanOrEqual(260);
  expect(px('publish')).toBeGreaterThanOrEqual(270);
  expect(px('workshop')).toBeGreaterThanOrEqual(280);
});
