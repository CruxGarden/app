import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';
import { togglePanel } from './panel-helpers';

test('Neighborhood follows real dimensions across Gardens, reveals a second hop and opens Growth in its owner', async () => {
  test.setTimeout(120_000);
  let instance = await launchApp();
  const dir = instance.dir;
  try {
    const { page } = instance;
    await enterGarden(page);
    const main = await createCrux(page, 'Low tide');
    const source = page.url();
    await page.getByRole('button', { name: 'Navigator', exact: true }).click();
    const nav = page.getByRole('complementary', { name: 'Navigator' });
    await nav
      .getByRole('combobox', { name: 'Navigation view' })
      .selectOption('neighborhood', { timeout: 3000 });
    await expect(nav.getByRole('region', { name: 'Gates', exact: true })).toContainText(
      'My Garden',
    );
    await nav.getByRole('button', { name: 'My Garden', exact: true }).click();
    await expect(nav.getByRole('region', { name: 'Gardens', exact: true })).toContainText(
      'Low tide',
    );
    await page.getByRole('button', { name: 'New Garden', exact: true }).click();
    await page.getByRole('textbox', { name: 'Garden name' }).fill('Studio');
    await page.getByRole('button', { name: 'Create Garden', exact: true }).click();
    const target = await createCrux(page, 'Dream study');
    await page.evaluate(
      async ({ main, target }) => {
        await window.electronAPI!.sqlite.run(
          "INSERT INTO dimensions (id,source_id,target_id,type,home_id,author_id,created,updated) SELECT ?,?,?,'graft',home_id,author_id,created,updated FROM cruxes WHERE id = ?",
          [crypto.randomUUID(), main, target, main],
        );
      },
      { main, target },
    );
    await page.goto(source + '&navView=neighborhood');
    if (!(await nav.isVisible()))
      await page.getByRole('button', { name: 'Navigator', exact: true }).click();
    const neighborhood = nav.getByRole('region', { name: 'Neighborhood', exact: true });
    const grafts = neighborhood.getByRole('region', { name: 'Grafts', exact: true });
    await expect(grafts.getByRole('button', { name: 'Dream study', exact: true })).toBeVisible();
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
        if (sql.includes('AS nodeId')) {
          SqliteApi.prototype.all = original;
          throw new Error('Connections temporarily unavailable');
        }
        return original.call(this, sql, params);
      } as typeof original;
    });
    await nav.getByRole('button', { name: 'Refresh navigation', exact: true }).click();
    await expect(neighborhood.getByRole('alert')).toContainText(
      'Connections temporarily unavailable',
    );
    await neighborhood.getByRole('button', { name: 'Retry connections', exact: true }).click();
    await expect(grafts.getByRole('button', { name: 'Dream study', exact: true })).toBeVisible();
    await grafts.getByRole('button', { name: 'Connections of Dream study', exact: true }).click();
    await expect(grafts.getByRole('region', { name: 'Gates', exact: true })).toContainText(
      'Studio',
    );
    await grafts.getByRole('button', { name: 'Dream study', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'Studio',
    );
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', target);
    expect(new URL(page.url()).searchParams.get('navView')).toBeNull();
    // Entering another Garden resolves its preference instead of copying the source view.
    await nav.getByRole('combobox', { name: 'Navigation view' }).selectOption('neighborhood');
    await expect(nav.getByRole('combobox', { name: 'Navigation view' })).toBeEnabled();
    await expect(neighborhood.getByRole('region', { name: 'Grafts', exact: true })).toContainText(
      'Low tide',
    );
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', main);
    const history = page.getByTestId('pane-body-history');
    if (!(await history.isVisible())) await togglePanel(page, 'Toggle history');
    await history.getByRole('button', { name: 'Mark version', exact: true }).click();
    await history.getByPlaceholder('Label (optional)').fill('Demo');
    await history.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      neighborhood
        .getByRole('region', { name: 'Growth', exact: true })
        .getByRole('button', { name: 'Demo', exact: true }),
    ).toBeVisible();
    await neighborhood
      .getByRole('region', { name: 'Growth', exact: true })
      .getByRole('button', { name: 'Demo', exact: true })
      .click();
    await expect.poll(() => new URL(page.url()).searchParams.get('growth')).not.toBeNull();
    expect(new URL(page.url()).pathname).toBe(`/c/${main}`);
    await expect(page.getByRole('dialog', { name: 'Whole Crux Growth' })).toBeVisible();
    await page.getByRole('button', { name: 'Close Growth graph', exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('growth')).toBeNull();
    await page.setViewportSize({ width: 480, height: 720 });
    await expect.poll(() => nav.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    // Wait for Plasma's actual resized canvas, not a transient old frame.
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
    await expect(nav.getByRole('combobox', { name: 'Navigation view' })).toBeInViewport();
    await page.screenshot({ path: 'e2e/.results/navigation-neighborhood.png' });
    const url = page.url();
    await instance.app.close();
    instance = await launchApp({ dir });
    await instance.page.getByRole('button', { name: /enter/i }).click();
    await instance.page.goto(url);
    await instance.page.getByRole('button', { name: 'Navigator', exact: true }).click();
    await expect(
      instance.page
        .getByRole('complementary', { name: 'Navigator' })
        .getByRole('region', { name: 'Grafts', exact: true }),
    ).toContainText('Dream study');
    const restoredNav = instance.page.getByRole('complementary', { name: 'Navigator' });
    await restoredNav.getByRole('combobox', { name: 'Navigation view' }).selectOption('tree');
    await expect(
      restoredNav.getByRole('button', { name: 'Low tide', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    expect(new URL(instance.page.url()).pathname).toBe(`/c/${main}`);
  } finally {
    await instance.app.close().catch(() => {});
  }
});
