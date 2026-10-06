import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  onSettingsSection,
  requestSettingsSection,
  settingsPlace,
  takeSettingsSection,
  type SettingsSection,
} from './settings-target';
import { checkForUpdates, openSettings } from '@/components/layout/app-commands';
import { currentWorkspaceUI } from '@/stores/uiStore';
import { useToastStore } from '@/stores/toastStore';

// An installed build with an update waiting: the toast's Settings goes to Desktop.
vi.mock('@/services/desktop', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/desktop')>();
  return {
    ...actual,
    updates: {
      ...actual.updates,
      state: async () => ({ status: 'idle' }),
      check: async () => ({ status: 'available', availableVersion: '9.9.9' }),
    },
  };
});

const settingsOpen = () => !!currentWorkspaceUI().getState().paneVisibility.settings;

/** Opening Settings at the place the calling copy names. */
describe('settings section routing', () => {
  afterEach(() => {
    takeSettingsSection();
    currentWorkspaceUI().getState().setPaneVisible('settings', false);
  });

  it('maps every named place to a group the pane lists, and cards to a selector', () => {
    expect(settingsPlace('usage')).toEqual({
      group: 'account',
      card: '[data-testid="usage-settings"]',
    });
    expect(settingsPlace('plan')).toEqual({
      group: 'account',
      card: '[data-testid="plan-settings"]',
    });
    expect(settingsPlace('agents').group).toBe('ai');
    expect(settingsPlace('desktop').group).toBe('garden');
    expect(settingsPlace('layouts').group).toBe('appearance');
    expect(settingsPlace('ai')).toEqual({ group: 'ai' });
    // A name from stale copy does not throw; it lands at the top.
    expect(settingsPlace('nowhere' as SettingsSection)).toEqual({ group: 'start' });
  });

  it('openSettings with a section opens Settings and leaves the place waiting for its mount', () => {
    expect(settingsOpen()).toBe(false);
    openSettings({ section: 'usage' });
    expect(settingsOpen()).toBe(true);
    expect(takeSettingsSection()).toBe('usage');
    // Taken once: a second mount does not jump again.
    expect(takeSettingsSection()).toBeNull();
  });

  it('openSettings without a section opens Settings and asks for no place', () => {
    openSettings();
    expect(settingsOpen()).toBe(true);
    expect(takeSettingsSection()).toBeNull();
  });

  it('an open Settings hears the request at once, and the latest request wins', () => {
    const heard: SettingsSection[] = [];
    const off = onSettingsSection((section) => heard.push(section));
    openSettings();
    openSettings({ section: 'plan' });
    openSettings({ section: 'agents' });
    expect(heard).toEqual(['plan', 'agents']);
    expect(takeSettingsSection()).toBe('agents');
    off();
    requestSettingsSection('usage');
    expect(heard).toEqual(['plan', 'agents']);
  });

  it("the update toast's Settings action opens at Desktop, where updates live", async () => {
    await checkForUpdates();
    const shown = useToastStore.getState().toasts.at(-1);
    expect(shown?.message).toBe('Version 9.9.9 is available.');
    expect(takeSettingsSection()).toBeNull();
    await shown?.action?.run();
    expect(settingsOpen()).toBe(true);
    expect(takeSettingsSection()).toBe('desktop');
  });
});
