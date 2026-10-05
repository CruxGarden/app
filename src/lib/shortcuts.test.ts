import { describe, expect, it } from 'vitest';
import {
  SHORTCUTS,
  claimShortcut,
  listShortcuts,
  matchesShortcut,
  shortcut,
  shortcutText,
} from './shortcuts';

describe('the keyboard shortcuts list', () => {
  it('lists every shortcut on the desktop with the collaborator on, grouped in order', () => {
    const groups = listShortcuts({ mac: true, desktop: true, collaborator: true });
    expect(groups.map((g) => g.group)).toEqual([
      'Anywhere',
      'Workspaces',
      'Files and panels',
      'Window',
    ]);
    expect(groups.flatMap((g) => g.rows).map((r) => r.id)).toEqual(SHORTCUTS.map((s) => s.id));
    const row = (id: string) => groups.flatMap((g) => g.rows).find((r) => r.id === id)!;
    expect(row('palette')).toEqual({
      id: 'palette',
      label: 'Search or run a command',
      keys: ['⌘', 'K'],
    });
    expect(row('settings').keys).toEqual(['⌘', ',']);
    expect(row('next-workspace').keys).toEqual(['⌃', 'Tab']);
  });

  it('leaves out what this setup does not have', () => {
    const web = listShortcuts({ mac: false, desktop: false, collaborator: false });
    const ids = web.flatMap((g) => g.rows).map((r) => r.id);
    expect(web.map((g) => g.group)).not.toContain('Window');
    expect(ids).not.toContain('new-crux');
    expect(ids).not.toContain('console');
    expect(ids).toEqual(expect.arrayContaining(['palette', 'settings', 'mood', 'save']));
    expect(web[0]!.rows[0]!.keys).toEqual(['Ctrl', 'K']);
  });

  it('never says "AI" in a label', () => {
    for (const s of SHORTCUTS) expect(s.label).not.toMatch(/\bAI\b/);
  });

  it('prints the hint the command palette shows beside Settings', () => {
    expect(shortcutText(shortcut('settings'), true)).toBe('⌘,');
    expect(shortcutText(shortcut('settings'), false)).toBe('Ctrl ,');
  });

  it('matches the keys the Shell handles, and not their neighbours', () => {
    expect(matchesShortcut(shortcut('mood'), { key: 'm', metaKey: true })).toBe(true);
    expect(matchesShortcut(shortcut('mood'), { key: 'm', ctrlKey: true })).toBe(true);
    expect(matchesShortcut(shortcut('mood'), { key: 'm' })).toBe(false);
    expect(matchesShortcut(shortcut('mood'), { key: 'm', metaKey: true, shiftKey: true })).toBe(
      false,
    );
    expect(matchesShortcut(shortcut('settings'), { key: ',', metaKey: true })).toBe(true);
  });
});

describe('one press, one action', () => {
  it('drops the menu accelerator that follows the window’s own keydown', () => {
    expect(claimShortcut('t-settings', 'key', 1000)).toBe(true);
    expect(claimShortcut('t-settings', 'menu', 1010)).toBe(false);
    // The pair is spent: the next press is a new one, whichever source hears it first.
    expect(claimShortcut('t-settings', 'menu', 1500)).toBe(true);
    expect(claimShortcut('t-settings', 'key', 1505)).toBe(false);
  });

  it('keeps separate presses, repeats from one source, and other shortcuts', () => {
    expect(claimShortcut('t-mood', 'key', 1000)).toBe(true);
    expect(claimShortcut('t-mood', 'key', 1050)).toBe(true);
    expect(claimShortcut('t-mood', 'menu', 2000)).toBe(true);
    expect(claimShortcut('t-other', 'key', 2001)).toBe(true);
  });
});
