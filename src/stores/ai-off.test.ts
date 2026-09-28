import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createUIStore, getMosaicLeaves, useUIStore } from './uiStore';
import { AI_PANES, paneOffered } from '@/components/workspace/paneConfig';
import { offeredPanes } from '@/components/layout/panel-order';

/**
 * With AI tools off (Settings → AI), Crux Garden is a whole app without them:
 * no AI pane can open, restored arrangements lose theirs, new Cruxes start
 * with their files beside the result, and turning AI off closes what is open.
 */
describe('AI tools off', () => {
  beforeEach(() => useUIStore.getState().setAiEnabled(false));
  afterAll(() => useUIStore.getState().setAiEnabled(false));

  it('offers no AI pane, from the registry or the Panels list', () => {
    expect([...AI_PANES].sort()).toEqual(['collaboration', 'console']);
    for (const pane of AI_PANES) expect(paneOffered(pane, false)).toBe(false);
    expect(offeredPanes('crux', 'c1', false)).not.toContain('collaboration');
    expect(offeredPanes('garden', null, false)).not.toContain('console');
    expect(offeredPanes('crux', 'c1', true)).toContain('collaboration');
  });

  it('refuses to open an AI pane however it is asked', () => {
    const ui = createUIStore();
    ui.getState().togglePane('collaboration');
    ui.getState().setPaneVisible('console', true);
    ui.getState().setMosaicLayout({
      direction: 'row',
      first: 'collaboration',
      second: 'workshop',
      splitPercentage: 40,
    });
    expect(ui.getState().paneVisibility.collaboration).toBeFalsy();
    expect(ui.getState().paneVisibility.console).toBeFalsy();
    expect(getMosaicLeaves(ui.getState().mosaicLayout)).not.toContain('collaboration');
  });

  it('starts a new Crux with its files beside the result, and an app Crux alone', () => {
    const ui = createUIStore();
    ui.getState().seedCruxLayout('ai-off-new');
    ui.getState().setActiveCrux('ai-off-new');
    expect(getMosaicLeaves(ui.getState().mosaicLayout).sort()).toEqual(['artifacts', 'workshop']);
    ui.getState().seedCruxLayout('ai-off-app', 30);
    ui.getState().setActiveCrux('ai-off-app');
    expect(ui.getState().mosaicLayout).toBe('workshop');
  });

  it('closes open AI panes in every workspace when switched off', () => {
    useUIStore.getState().setAiEnabled(true);
    const a = createUIStore();
    const b = createUIStore();
    a.getState().setPaneVisible('collaboration', true);
    b.getState().setPaneVisible('collaboration', true);
    expect(a.getState().paneVisibility.collaboration).toBe(true);
    useUIStore.getState().setAiEnabled(false);
    expect(a.getState().paneVisibility.collaboration).toBe(false);
    expect(b.getState().paneVisibility.collaboration).toBe(false);
    expect(getMosaicLeaves(a.getState().mosaicLayout)).not.toContain('collaboration');
  });

  it('with AI on, a new Crux starts with the conversation beside the result', () => {
    useUIStore.getState().setAiEnabled(true);
    const ui = createUIStore();
    ui.getState().seedCruxLayout('ai-on-new');
    ui.getState().setActiveCrux('ai-on-new');
    expect(getMosaicLeaves(ui.getState().mosaicLayout).sort()).toEqual([
      'collaboration',
      'workshop',
    ]);
  });
});
