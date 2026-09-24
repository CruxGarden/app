import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

test('Navigator search disambiguates locations, shares routes, retries and survives restart', async () => {
  test.setTimeout(120_000);
  let instance = await launchApp();
  const dir = instance.dir;
  try {
    const { page } = instance;
    await enterGarden(page);
    const first = await createCrux(page, 'Dream study');
    const source = page.url();
    const origin = page.getByRole('button', { name: 'Garden location', exact: true });
    await origin.focus();
    await page.keyboard.press('ControlOrMeta+k');
    const nav = page.getByRole('complementary', { name: 'Navigator' });
    const input = nav.getByRole('searchbox', { name: 'Find Gardens and Cruxes' });
    await expect(input).toBeFocused({ timeout: 3000 });
    await page.keyboard.press('Escape');
    await expect(nav).toBeHidden();
    await expect(origin).toBeFocused();
    await origin.click();
    await page.getByRole('button', { name: 'Close crux', exact: true }).click();
    await page.getByRole('button', { name: 'New Garden', exact: true }).click();
    await page.getByRole('textbox', { name: 'Garden name' }).fill('Studio');
    await page.getByRole('button', { name: 'Create Garden', exact: true }).click();
    const second = await createCrux(page, 'Dream study');
    await page.goto(source + '&navView=neighborhood');
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', first);
    await page.keyboard.press('ControlOrMeta+k');
    await input.fill('Dream study');
    const results = nav.getByRole('region', { name: 'Search results' });
    await expect(results.getByRole('button', { name: /Dream study/ })).toHaveCount(2);
    await expect(results).toContainText('My Garden › Studio');
    await results
      .getByRole('button', { name: 'Dream study My Garden › Studio', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(nav).toBeHidden();
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', second);
    await expect(origin).toHaveText('Studio');
    expect(new URL(page.url()).searchParams.get('navView')).toBe('neighborhood');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', first);
    await page.getByRole('button', { name: 'Navigator', exact: true }).click();
    await page.keyboard.press('ControlOrMeta+k');
    await page.keyboard.press('Escape');
    await expect(nav).toBeVisible();
    // Hold a real API search response while the user moves to a different query.
    await instance.app.evaluate(({ app }) => {
      const path = process.getBuiltinModule('path');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { SqliteApi } = load(
        path.join(app.getAppPath(), 'dist/sqlite-api.js'),
      ) as typeof import('../src/sqlite-api');
      const original = SqliteApi.prototype.all;
      const state = globalThis as typeof globalThis & { releaseSearch?: () => void };
      SqliteApi.prototype.all = async function (sql: string, params?: unknown[]) {
        if (sql.includes("COALESCE(c.title, '') LIKE") && params?.[0] === '%Dream%') {
          SqliteApi.prototype.all = original;
          await new Promise<void>((resolve) => {
            state.releaseSearch = resolve;
          });
        }
        return original.call(this, sql, params);
      } as typeof original;
    });
    await input.fill('Dream');
    await expect
      .poll(() =>
        instance.app.evaluate(
          () => !!(globalThis as typeof globalThis & { releaseSearch?: () => void }).releaseSearch,
        ),
      )
      .toBe(true);
    await input.fill('Studio');
    await expect(
      results.getByRole('button', { name: 'Studio My Garden', exact: true }),
    ).toBeVisible();
    await instance.app.evaluate(() =>
      (globalThis as typeof globalThis & { releaseSearch?: () => void }).releaseSearch?.(),
    );
    await expect(results.getByRole('button', { name: /Dream study/ })).toHaveCount(0);
    await instance.app.evaluate(({ app }) => {
      const path = process.getBuiltinModule('path');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { SqliteApi } = load(
        path.join(app.getAppPath(), 'dist/sqlite-api.js'),
      ) as typeof import('../src/sqlite-api');
      const original = SqliteApi.prototype.all;
      SqliteApi.prototype.all = async function (sql: string, params?: unknown[]) {
        if (sql.includes("COALESCE(c.title, '') LIKE")) {
          SqliteApi.prototype.all = original;
          throw new Error('Search temporarily unavailable');
        }
        return original.call(this, sql, params);
      } as typeof original;
    });
    await input.fill('Dream');
    await expect(results.getByRole('alert')).toContainText('Search temporarily unavailable');
    await results.getByRole('button', { name: 'Retry search' }).click();
    await expect(results.getByRole('button', { name: /Dream study/ })).toHaveCount(2);
    await input.fill('nothing matches this');
    await expect(results).toContainText('No Gardens or Cruxes found');
    await input.fill('Studio');
    await expect(
      results.getByRole('button', { name: 'Studio My Garden', exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 480, height: 720 });
    await expect.poll(() => nav.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const canvas = document.querySelector<HTMLCanvasElement>('canvas.plasma-ground');
          return (
            !canvas || Math.abs(canvas.width / canvas.height - innerWidth / innerHeight) < 0.01
          );
        }),
      )
      .toBe(true);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.screenshot({ path: 'e2e/.results/navigation-search.png' });
    await input.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(nav).toBeVisible();
    await expect(origin).toHaveText('Studio');
    expect(new URL(page.url()).pathname).toBe('/home');
    const url = page.url();
    await instance.app.close();
    instance = await launchApp({ dir });
    await instance.page.getByRole('button', { name: /enter/i }).click();
    await instance.page.goto(url);
    await expect(
      instance.page.getByRole('button', { name: 'Garden location', exact: true }),
    ).toHaveText('Studio');
    await instance.page.keyboard.press('ControlOrMeta+k');
    const restored = instance.page.getByRole('searchbox', { name: 'Find Gardens and Cruxes' });
    await restored.fill('Dream study');
    await expect(
      instance.page
        .getByRole('region', { name: 'Search results' })
        .getByRole('button', { name: /Dream study/ }),
    ).toHaveCount(2);
    await restored.press('Escape');
    // The same command works while a cross-origin embedded surface owns input.
    await instance.page.evaluate(() => {
      const frame = document.createElement('iframe');
      frame.id = 'search-focus-fixture';
      frame.src = 'data:text/html,<input aria-label="Embedded input">';
      document.body.append(frame);
    });
    await instance.page.frameLocator('#search-focus-fixture').getByRole('textbox').click();
    await instance.app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('crux-app://'),
      )!;
      window.focus();
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'k', modifiers: ['control'] });
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'k', modifiers: ['control'] });
    });
    await expect(restored).toBeFocused();
    await restored.press('Escape');
    await instance.page.locator('#search-focus-fixture').evaluate((frame) => frame.remove());
    await instance.page.getByRole('button', { name: 'Explore', exact: true }).click();
    await expect(
      instance.page.getByRole('button', { name: 'Close Explore', exact: true }),
    ).toBeVisible();
    await instance.page.getByRole('button', { name: 'Close Explore', exact: true }).click();
    await instance.page.keyboard.press('ControlOrMeta+Alt+k');
    await expect(
      instance.page.getByRole('dialog', { name: 'Switch Crux workspace', exact: true }),
    ).toBeVisible();
    await instance.page.keyboard.press('ControlOrMeta+k');
    await expect(restored).toBeHidden();
  } finally {
    await instance.app.close().catch(() => {});
  }
});
