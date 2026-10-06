import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ShortcutsList from './ShortcutsList';
import ReportProblem from './ReportProblem';
import AboutContent from '@/components/settings/AboutContent';
import OpenSourceNotices from '@/components/settings/OpenSourceNotices';
import UpdateNotice from './UpdateNotice';
import { runMenuCommand } from './app-commands';
import { useShellDialogs } from '@/stores/shellDialogs';
import { useFieldGuide } from '@/stores/fieldGuide';
import { currentWorkspaceUI } from '@/stores/uiStore';
import { claimShortcut } from '@/lib/shortcuts';
import { GITHUB_APP_URL } from '@/lib/site';

/** The shell's own views, rendered to markup (the suite has no DOM), and the menu's routing. */
describe('shell dialogs', () => {
  it('the shortcuts list shows the real keys from the shared table', () => {
    const html = renderToStaticMarkup(createElement(ShortcutsList));
    expect(html).toContain('data-testid="shortcuts-list"');
    expect(html).toContain('Search or run a command');
    expect(html).toContain('data-shortcut="settings"');
    expect(html).toMatch(/<kbd[^>]*>K<\/kbd>/);
    // No desktop shell in this environment: window shortcuts are not claimed.
    expect(html).not.toContain('data-shortcut="close-window"');
  });

  it('report a problem says what is shared and offers the three actions', () => {
    const html = renderToStaticMarkup(createElement(ReportProblem));
    expect(html).toContain('never\n        sends anything on its own'.replace(/\s+/g, ' '));
    expect(html).toContain('data-testid="report-details"');
    expect(html).toContain('Open an issue');
    expect(html).toContain('Copy details');
    // "Show logs" needs the desktop shell.
    expect(html).not.toContain('Show logs');
  });

  it('about names the app, links out, and leads to notices, shortcuts and reporting', () => {
    const html = renderToStaticMarkup(createElement(AboutContent));
    for (const text of [
      'Crux Garden',
      'Website',
      'Source',
      'MIT licence',
      'Open-source notices',
      'Keyboard shortcuts',
      'Report a problem',
    ])
      expect(html, text).toContain(text);
    expect(GITHUB_APP_URL).toMatch(/^https:\/\/github\.com\//);
  });

  it('the notices view starts by loading, without having fetched anything', () => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    const html = renderToStaticMarkup(createElement(OpenSourceNotices));
    expect(html).toContain('Loading notices');
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockRestore();
  });

  it('no updater, no update notice', () => {
    expect(renderToStaticMarkup(createElement(UpdateNotice))).toBe('');
  });
});

describe('application menu commands run the palette’s own functions', () => {
  const navigate = vi.fn();
  // The real toggle animates a surface away in the document; here only the call matters.
  const togglePane = vi.fn();
  let clock = Date.UTC(2026, 9, 4);
  beforeEach(() => {
    // Presses in different tests are different presses.
    vi.useFakeTimers();
    vi.setSystemTime((clock += 60_000));
    togglePane.mockClear();
    useShellDialogs.setState({ open: null });
    currentWorkspaceUI().setState({ togglePane });
    currentWorkspaceUI().getState().setPaneVisible('settings', false);
  });
  afterEach(() => vi.useRealTimers());
  const settingsOpen = () => !!currentWorkspaceUI().getState().paneVisibility.settings;

  it('opens the shell dialogs and the Field Guide', () => {
    for (const command of ['shortcuts', 'report-problem', 'about'] as const) {
      runMenuCommand(command, false, navigate);
      expect(useShellDialogs.getState().open).toBe(command);
    }
    useFieldGuide.setState({ page: null });
    runMenuCommand('field-guide', false, navigate);
    expect(useFieldGuide.getState().page).toBe('');
  });

  it('Settings… opens when chosen and toggles when its keys are pressed', () => {
    runMenuCommand('settings', false, navigate);
    expect(settingsOpen()).toBe(true);
    runMenuCommand('settings', false, navigate);
    expect(settingsOpen()).toBe(true);
    expect(togglePane).not.toHaveBeenCalled();
    runMenuCommand('settings', true, navigate);
    expect(togglePane.mock.calls).toEqual([['settings']]);
  });

  it('an accelerator the window already handled does not fire a second time', () => {
    // The Shell's keydown claimed this press and toggled the pane itself.
    expect(claimShortcut('settings', 'key')).toBe(true);
    runMenuCommand('settings', true, navigate);
    expect(claimShortcut('mood', 'key')).toBe(true);
    runMenuCommand('mood', true, navigate);
    expect(togglePane).not.toHaveBeenCalled();
    // The next press, heard only by the menu (an embedded frame had the keyboard), acts once.
    vi.setSystemTime((clock += 5_000));
    runMenuCommand('mood', true, navigate);
    runMenuCommand('settings', true, navigate);
    expect(togglePane.mock.calls).toEqual([['mood'], ['settings']]);
  });
});
