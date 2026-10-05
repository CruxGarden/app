import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

/**
 * The desktop shell's own behaviour (EF04, EF08, EF09): the window comes back
 * where it was, the Keyboard Shortcuts list opens from the command palette and
 * from the application menu, and Report a Problem shows what it shares and
 * builds the issue link — with the system browser stubbed, so nothing opens.
 */
test.describe('desktop shell', () => {
  test('the window reopens at the size and place it was left', async () => {
    const first = await launchApp({ ai: false });
    let bounds: { x: number; y: number; width: number; height: number };
    try {
      bounds = await first.app.evaluate(({ BrowserWindow, screen }) => {
        const window = BrowserWindow.getAllWindows()[0]!;
        const area = screen.getDisplayMatching(window.getBounds()).workArea;
        // Inside whatever screen this machine has, and not the default 1400×900.
        window.setBounds({
          x: area.x + 40,
          y: area.y + 30,
          width: Math.min(1010, area.width - 80),
          height: Math.min(720, area.height - 60),
        });
        return window.getBounds();
      });
      expect(bounds.width).not.toBe(1400);
    } finally {
      await first.app.close();
    }
    expect(existsSync(join(first.dir, 'userData', 'window-state.json'))).toBe(true);

    const second = await launchApp({ ai: false, dir: first.dir });
    try {
      const restored = await second.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]!.getBounds(),
      );
      expect(restored).toEqual(bounds);
    } finally {
      await second.app.close();
    }
  });

  test('Keyboard shortcuts opens from the command palette and from the Help menu', async () => {
    const { app, page } = await launchApp({ ai: false });
    try {
      await enterGarden(page);
      await page.keyboard.press('ControlOrMeta+k');
      const palette = page.getByTestId('command-palette');
      await expect(palette).toBeVisible();
      await palette.getByRole('combobox').fill('keyboard shortcuts');
      await palette.locator('[data-command="shortcuts"]').click();
      const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true });
      await expect(dialog).toBeVisible();
      const list = dialog.getByTestId('shortcuts-list');
      await expect(list.locator('[data-shortcut="palette"]')).toContainText(
        'Search or run a command',
      );
      await expect(list.locator('[data-shortcut="settings"]')).toContainText(',');
      // Desktop: the window's own shortcuts are listed too.
      await expect(list.locator('[data-shortcut="close-window"]')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();

      // The application menu sends one command; the same dialog answers it.
      const menu = await app.evaluate(({ Menu }) => {
        const menu = Menu.getApplicationMenu()!;
        const has = (role: string) => {
          const walk = (items: Electron.MenuItem[]): boolean =>
            items.some(
              (item) =>
                String(item.role ?? '').toLowerCase() === role ||
                (!!item.submenu && walk(item.submenu.items)),
            );
          return walk(menu.items);
        };
        menu.getMenuItemById('shortcuts')!.click();
        return { paste: has('paste'), undo: has('undo'), selectAll: has('selectall') };
      });
      expect(menu).toEqual({ paste: true, undo: true, selectAll: true });
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape');

      // ⌘, still toggles Settings exactly once per press, with the menu carrying the same keys.
      const settings = page.getByTestId('desktop-settings');
      await page.keyboard.press('ControlOrMeta+,');
      await expect(settings).toBeAttached();
      // A doubled toggle (keydown and accelerator both acting) would have closed it again.
      await page.waitForTimeout(600);
      await expect(settings).toBeAttached();
      await expect(page.getByTestId('about-settings')).toContainText('Open-source notices');
    } finally {
      await app.close();
    }
  });

  test('Report a problem shows what it shares and builds the issue link without sending anything', async () => {
    const { app, page, dir } = await launchApp({ ai: false });
    try {
      // Stub the system browser in the main process; record what it is asked to open.
      await app.evaluate(({ shell }) => {
        const g = globalThis as unknown as { __opened: string[] };
        g.__opened = [];
        shell.openExternal = async (url: string) => {
          g.__opened.push(url);
        };
      });
      const version = await app.evaluate(({ app }) => app.getVersion());
      await enterGarden(page);
      await page.keyboard.press('ControlOrMeta+k');
      const palette = page.getByTestId('command-palette');
      await palette.getByRole('combobox').fill('report a problem');
      await palette.locator('[data-command="report-problem"]').click();

      const dialog = page.getByRole('dialog', { name: 'Report a problem', exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByTestId('report-details')).toContainText(`Crux Garden ${version}`);
      await expect(dialog.getByRole('button', { name: 'Copy details', exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Show logs', exact: true })).toBeVisible();
      expect(
        await app.evaluate(() => (globalThis as unknown as { __opened: string[] }).__opened),
      ).toEqual([]);

      await dialog.getByRole('button', { name: 'Open an issue', exact: true }).click();
      await expect
        .poll(() =>
          app.evaluate(() => (globalThis as unknown as { __opened: string[] }).__opened.length),
        )
        .toBe(1);
      const [opened] = await app.evaluate(
        () => (globalThis as unknown as { __opened: string[] }).__opened,
      );
      const url = new URL(opened!);
      expect(`${url.origin}${url.pathname}`).toBe('https://github.com/CruxGarden/app/issues/new');
      const body = url.searchParams.get('body')!;
      expect(body).toContain(`Crux Garden ${version}`);
      expect(body).toContain('**What happened**');
      // Only the version and the operating system: no profile path, no log.
      expect(body).not.toContain(dir);
      expect(body).not.toContain('main.log');
    } finally {
      await app.close();
    }
  });

  test('after a session that was killed, the next launch quietly offers Report a problem once', async () => {
    const env = { CRUX_CRASH_NOTICE: '1' };
    const first = await launchApp({ ai: false, env });
    await enterGarden(first.page);
    const gone = new Promise<void>((resolve) => first.app.process().once('exit', () => resolve()));
    first.app.process().kill('SIGKILL');
    await gone;
    expect(existsSync(join(first.dir, 'userData', 'session-marker.json'))).toBe(true);

    const second = await launchApp({ ai: false, env, dir: first.dir });
    try {
      // The notice belongs to the workspace shell, which opens after the gateway.
      await second.page.getByRole('button', { name: /enter/i }).click();
      const notice = second.page
        .getByTestId('toast')
        .filter({ hasText: "didn't close properly last time" });
      await expect(notice).toBeVisible({ timeout: 30_000 });
      await notice.getByRole('button', { name: 'Report a problem', exact: true }).click();
      await expect(
        second.page.getByRole('dialog', { name: 'Report a problem', exact: true }),
      ).toBeVisible();
    } finally {
      await second.app.close();
    }
    // A clean quit clears the marker: the third launch says nothing.
    expect(existsSync(join(first.dir, 'userData', 'session-marker.json'))).toBe(false);
  });
});
