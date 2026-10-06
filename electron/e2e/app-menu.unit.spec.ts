import { test, expect } from '@playwright/test';
import type { MenuItemConstructorOptions } from 'electron';
import { buildMenuTemplate, type MenuActions } from '../src/app-menu';
import {
  SHORTCUTS,
  shortcut,
  shortcutAccelerator,
  shortcutKeys,
  matchesShortcut,
} from '../src/shortcuts';

/** The application menu as data (EF09): what each platform and build kind gets. */
function build(platform: NodeJS.Platform, dev: boolean) {
  const calls: string[] = [];
  const actions: MenuActions = {
    command: (command, accelerator) => calls.push(`${command}:${accelerator}`),
    openLogs: () => calls.push('logs'),
    openWebsite: () => calls.push('website'),
    minimize: () => calls.push('minimize'),
  };
  return { template: buildMenuTemplate({ platform, dev, appName: 'Crux Garden' }, actions), calls };
}
const items = (menu: MenuItemConstructorOptions) =>
  (menu.submenu as MenuItemConstructorOptions[]) ?? [];
const all = (template: MenuItemConstructorOptions[]) => template.flatMap(items);
const roles = (template: MenuItemConstructorOptions[]) =>
  all(template)
    .map((item) => item.role)
    .filter(Boolean);
const labels = (template: MenuItemConstructorOptions[]) => template.map((menu) => menu.label);
const find = (template: MenuItemConstructorOptions[], id: string) =>
  all(template).find((item) => item.id === id)!;
const click = (item: MenuItemConstructorOptions, triggeredByAccelerator = false) =>
  (item.click as (...args: unknown[]) => void)({}, undefined, { triggeredByAccelerator });

for (const platform of ['darwin', 'win32', 'linux'] as const) {
  test(`${platform}: a packaged build has no reload and no developer tools`, () => {
    const { template } = build(platform, false);
    const found = roles(template).map((role) => String(role).toLowerCase());
    expect(found).not.toContain('reload');
    expect(found).not.toContain('forcereload');
    expect(found).not.toContain('toggledevtools');
    expect(JSON.stringify(template).toLowerCase()).not.toContain('devtools');
  });

  test(`${platform}: a development build can reload and open the developer tools`, () => {
    const found = roles(build(platform, true).template);
    expect(found).toEqual(expect.arrayContaining(['reload', 'forceReload', 'toggleDevTools']));
  });

  test(`${platform}: text editing, zoom and full screen roles are always present`, () => {
    for (const dev of [true, false]) {
      const { template } = build(platform, dev);
      const edit = template.find((menu) => menu.label === 'Edit')!;
      expect(items(edit).map((item) => item.role)).toEqual(
        expect.arrayContaining(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']),
      );
      expect(roles(template)).toEqual(
        expect.arrayContaining(['resetZoom', 'zoomIn', 'zoomOut', 'togglefullscreen', 'close']),
      );
    }
  });

  test(`${platform}: every window command is offered exactly where the platform expects`, () => {
    const { template, calls } = build(platform, false);
    for (const id of [
      'about',
      'settings',
      'check-updates',
      'new-crux',
      'mood',
      'field-guide',
      'shortcuts',
      'setup-again',
      'report-problem',
    ]) {
      const matching = all(template).filter((item) => item.id === id);
      expect(matching, id).toHaveLength(1);
      click(matching[0]!);
    }
    expect(calls).toEqual([
      'about:false',
      'settings:false',
      'check-updates:false',
      'new-crux:false',
      'mood:false',
      'field-guide:false',
      'shortcuts:false',
      'setup-again:false',
      'report-problem:false',
    ]);
    const help = template.find((menu) => menu.role === 'help')!;
    expect(items(help).map((item) => item.id)).toEqual(
      expect.arrayContaining([
        'field-guide',
        'shortcuts',
        'setup-again',
        'report-problem',
        'open-logs',
        'website',
      ]),
    );
  });
}

test('macOS has the app menu first; other platforms put its items under File and Help', () => {
  const mac = build('darwin', false).template;
  expect(labels(mac)).toEqual(['Crux Garden', 'File', 'Edit', 'View', 'Window', 'Help']);
  expect(items(mac[0]!).map((item) => item.id ?? item.role ?? item.type)).toEqual([
    'about',
    'separator',
    'settings',
    'check-updates',
    'separator',
    'services',
    'separator',
    'hide',
    'hideOthers',
    'unhide',
    'separator',
    'quit',
  ]);
  const windows = build('win32', false).template;
  expect(labels(windows)).toEqual(['File', 'Edit', 'View', 'Window', 'Help']);
  const file = items(windows[0]!);
  expect(file.map((item) => item.id ?? item.role ?? item.type)).toEqual([
    'new-crux',
    'separator',
    'settings',
    'separator',
    'close',
    'separator',
    'quit',
  ]);
  expect(items(windows.at(-1)!).map((item) => item.id)).toEqual(
    expect.arrayContaining(['check-updates', 'about']),
  );
});

test('accelerators come from the shared shortcut table, and say when the keys were used', () => {
  const { template, calls } = build('darwin', false);
  expect(find(template, 'settings').accelerator).toBe('CmdOrCtrl+,');
  expect(find(template, 'new-crux').accelerator).toBe('CmdOrCtrl+N');
  expect(find(template, 'mood').accelerator).toBe('CmdOrCtrl+M');
  // ⌘M is the Mood's: Minimize is offered without the role's own accelerator.
  expect(roles(template)).not.toContain('minimize');
  expect(find(template, 'minimize').accelerator).toBeUndefined();
  // ⌘K is taken before the menu sees it (before-input-event), so no item claims it.
  expect(all(template).some((item) => /\+K$/.test(String(item.accelerator ?? '')))).toBe(false);
  click(find(template, 'settings'), true);
  click(find(template, 'minimize'));
  click(find(template, 'open-logs'));
  click(find(template, 'website'));
  expect(calls).toEqual(['settings:true', 'minimize', 'logs', 'website']);
});

test('the shortcut table prints, matches and names its keys consistently', () => {
  expect(new Set(SHORTCUTS.map((s) => s.id)).size).toBe(SHORTCUTS.length);
  expect(shortcutKeys(shortcut('palette'), true)).toEqual(['⌘', 'K']);
  expect(shortcutKeys(shortcut('palette'), false)).toEqual(['Ctrl', 'K']);
  expect(shortcutKeys(shortcut('find-workspace'), true)).toEqual(['⌥', '⌘', 'K']);
  expect(shortcutKeys(shortcut('previous-workspace'), false)).toEqual(['Ctrl', 'Shift', 'Tab']);
  expect(shortcutKeys(shortcut('fullscreen'), true)).toEqual(['⌃', '⌘', 'F']);
  expect(shortcutKeys(shortcut('fullscreen'), false)).toEqual(['F11']);
  expect(shortcutKeys(shortcut('console'), true)).toEqual(['Esc']);
  expect(shortcutAccelerator(shortcut('zoom-in'), false)).toBe('CmdOrCtrl+Plus');
  const settings = shortcut('settings');
  expect(matchesShortcut(settings, { key: ',', metaKey: true })).toBe(true);
  expect(matchesShortcut(settings, { key: ',', ctrlKey: true })).toBe(true);
  expect(matchesShortcut(settings, { key: ',' })).toBe(false);
  expect(matchesShortcut(settings, { key: ',', metaKey: true, altKey: true })).toBe(false);
  expect(matchesShortcut(shortcut('mood'), { key: 'M', metaKey: true })).toBe(true);
  expect(matchesShortcut(shortcut('palette'), { key: 'k', metaKey: true, altKey: true })).toBe(
    false,
  );
  expect(
    matchesShortcut(shortcut('find-workspace'), { key: 'k', ctrlKey: true, altKey: true }),
  ).toBe(true);
  expect(matchesShortcut(shortcut('console'), { key: 'Escape' })).toBe(true);
  expect(matchesShortcut(shortcut('console'), { key: 'Escape', metaKey: true })).toBe(false);
});
