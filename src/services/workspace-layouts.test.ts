import { beforeEach, describe, expect, it } from 'vitest';
import { initServices } from '@/services';
import { createUIStore } from '@/stores/uiStore';
import { SettingsKey } from '@/lib/constants';
import { setSetting } from './settings';
import { registerNotebookEditor } from './notebook-lifecycle';
import {
  parseWorkspaceLayout,
  saveWorkspaceLayout,
  listWorkspaceLayouts,
  applyWorkspaceLayout,
  arrangeWorkspacePanels,
} from './workspace-layouts';

beforeEach(async () => {
  await initServices();
  setSetting(SettingsKey.WorkspaceLayouts, '[]');
});
describe('custom workspace arrangements', () => {
  it('rejects malformed/duplicate/recursive trees before replacing saved work', () => {
    saveWorkspaceLayout('Write', 'collaboration');
    const cycle: Record<string, unknown> = { direction: 'row', first: 'artifacts' };
    cycle.second = cycle;
    for (const layout of [
      cycle,
      { direction: 'row', first: 'workshop', second: 'workshop' },
      { direction: 'row', first: 'artifacts', second: 'workshop', splitPercentage: NaN },
      'not-a-panel',
    ])
      expect(() => saveWorkspaceLayout('Write', layout)).toThrow();
    expect(listWorkspaceLayouts()).toEqual([{ name: 'Write', layout: 'collaboration' }]);
    expect(parseWorkspaceLayout(null)).toBeNull();
  });
  it('restores panels and split sizes without replacing the current draft or editor state', async () => {
    const ui = createUIStore();
    ui.getState().setComposerDraft('Unsent idea');
    const editor = ui.getState().editor;
    const layout = {
      direction: 'row' as const,
      first: 'collaboration',
      second: 'workshop',
      splitPercentage: 42,
    };
    saveWorkspaceLayout('Writing', layout);
    await applyWorkspaceLayout(ui, 'Writing');
    expect(ui.getState().mosaicLayout).toEqual(layout);
    // Immediate recreation must read the applied proportions before any resize debounce fires.
    expect(createUIStore().getState().mosaicLayout).toEqual(layout);
    expect(ui.getState().composerDraft).toBe('Unsent idea');
    expect(ui.getState().editor).toBe(editor);
    expect(ui.getState().paneVisibility.artifacts).toBe(false);
  });
  it('redistributes existing cramped panels without replacing saved layouts or drafts', async () => {
    const ui = createUIStore();
    const cramped = {
      direction: 'row' as const,
      first: 'collaboration' as const,
      second: 'workshop' as const,
      splitPercentage: 5,
    };
    ui.getState().setMosaicLayout(cramped);
    ui.getState().setComposerDraft('Keep this');
    saveWorkspaceLayout('Deliberate', cramped);
    await arrangeWorkspacePanels(ui);
    expect(ui.getState().mosaicLayout).toEqual({ ...cramped, splitPercentage: 50 });
    expect(createUIStore().getState().mosaicLayout).toEqual(ui.getState().mosaicLayout);
    expect(ui.getState().composerDraft).toBe('Keep this');
    expect(listWorkspaceLayouts()).toEqual([{ name: 'Deliberate', layout: cramped }]);
  });
  it('refuses to hide an embedded editor whose save failed', async () => {
    const ui = createUIStore();
    ui.setState({ activeCruxId: 'save-failure' });
    const before = ui.getState().mosaicLayout;
    saveWorkspaceLayout('Quiet', null);
    const off = registerNotebookEditor('save-failure', {
      dirty: () => true,
      flush: async () => {
        throw new Error('disk full');
      },
    });
    try {
      await expect(applyWorkspaceLayout(ui, 'Quiet')).rejects.toThrow('disk full');
      expect(ui.getState().mosaicLayout).toEqual(before);
    } finally {
      off();
    }
  });
});
