import type { MenuItemConstructorOptions } from 'electron';
import type { MenuCommand } from './bridge';
import { shortcut, shortcutAccelerator } from './shortcuts';

/**
 * The application menu (EF09), as data: `buildMenuTemplate` is a pure function
 * of the platform and the build kind, so what a packaged build may show is
 * checked without Electron (e2e/app-menu.unit.spec.ts). Reload and the
 * developer tools exist only in development builds. Items that act in the
 * window send one named command to the renderer, which runs the same function
 * the command palette runs; nothing is implemented twice.
 */
export interface MenuActions {
  /** `viaAccelerator`: the keys were pressed, not the item clicked (the renderer de-duplicates). */
  command(command: MenuCommand, viaAccelerator: boolean): void;
  openLogs(): void;
  openWebsite(): void;
  minimize(): void;
}

export interface MenuContext {
  platform: NodeJS.Platform;
  /** A development (unpackaged) build: reload and developer tools are offered. */
  dev: boolean;
  appName: string;
}

export const WEBSITE_URL = 'https://crux.garden';

export function buildMenuTemplate(
  context: MenuContext,
  actions: MenuActions,
): MenuItemConstructorOptions[] {
  const mac = context.platform === 'darwin';
  const separator: MenuItemConstructorOptions = { type: 'separator' };
  const send = (
    id: MenuCommand,
    label: string,
    accelerator?: string,
  ): MenuItemConstructorOptions => ({
    id,
    label,
    ...(accelerator ? { accelerator } : {}),
    click: (_item, _window, event) =>
      actions.command(
        id,
        !!(event as { triggeredByAccelerator?: boolean })?.triggeredByAccelerator,
      ),
  });
  const keys = (id: Parameters<typeof shortcut>[0]) => shortcutAccelerator(shortcut(id), mac);

  const about = send('about', `About ${context.appName}`);
  const settings = send('settings', 'Settings…', keys('settings'));
  const checkForUpdates = send('check-updates', 'Check for Updates…');

  const template: MenuItemConstructorOptions[] = [];
  if (mac)
    template.push({
      label: context.appName,
      submenu: [
        about,
        separator,
        settings,
        checkForUpdates,
        separator,
        { role: 'services' },
        separator,
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        separator,
        { role: 'quit' },
      ],
    });

  template.push({
    label: 'File',
    submenu: [
      send('new-crux', 'New Crux', keys('new-crux')),
      separator,
      ...(mac ? [] : [settings, separator]),
      { role: 'close', label: 'Close Window' },
      ...(mac ? [] : [separator, { role: 'quit' } as MenuItemConstructorOptions]),
    ],
  });

  // Text fields everywhere (and every embedded editor) rely on these roles.
  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      separator,
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(mac ? [{ role: 'pasteAndMatchStyle' } as MenuItemConstructorOptions] : []),
      { role: 'delete' },
      { role: 'selectAll' },
    ],
  });

  template.push({
    label: 'View',
    submenu: [
      ...(context.dev
        ? ([
            { role: 'reload' },
            { role: 'forceReload' },
            { role: 'toggleDevTools' },
            separator,
          ] as MenuItemConstructorOptions[])
        : []),
      send('mood', 'Mood', keys('mood')),
      separator,
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      separator,
      { role: 'togglefullscreen' },
    ],
  });

  template.push({
    label: 'Window',
    role: 'window',
    submenu: [
      // Not the `minimize` role: its ⌘M belongs to the Mood here.
      { id: 'minimize', label: 'Minimize', click: () => actions.minimize() },
      ...(mac
        ? ([{ role: 'zoom' }, separator, { role: 'front' }] as MenuItemConstructorOptions[])
        : []),
    ],
  });

  template.push({
    label: 'Help',
    role: 'help',
    submenu: [
      send('field-guide', 'Field Guide'),
      send('shortcuts', 'Keyboard Shortcuts'),
      send('setup-again', 'Run Setup Again…'),
      separator,
      send('report-problem', 'Report a Problem…'),
      { id: 'open-logs', label: 'Open Logs', click: () => actions.openLogs() },
      separator,
      { id: 'website', label: 'Crux Garden Website', click: () => actions.openWebsite() },
      ...(mac ? [] : [separator, checkForUpdates, about]),
    ],
  });
  return template;
}
