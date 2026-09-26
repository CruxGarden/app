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
