import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';
import { togglePanel } from './panel-helpers';

test('inline dimensions navigate without opening Navigator and retain versions and links after restart', async () => {
  test.setTimeout(120_000);
  let instance = await launchApp();
  const dir = instance.dir;
  try {
    const { page } = instance;
    await enterGarden(page);
    const main = await createCrux(page, 'Tide pool');
    const source = page.url();
    const links = page.getByRole('region', { name: 'Crux connections', exact: true });
    // Its Garden is the breadcrumb's; with nothing else linked there is no strip.
    await expect(links).toBeHidden();
    await expect(page.getByRole('complementary', { name: 'Navigator' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Garden location', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Garden location', exact: true })
      .getByRole('button', { name: 'Close crux', exact: true })
      .click();
    await page.getByRole('button', { name: 'New Garden', exact: true }).click();
    await page.getByRole('textbox', { name: 'Garden name' }).fill('References');
    await page.getByRole('button', { name: 'Create Garden', exact: true }).click();
    const target = await createCrux(page, 'Moonlight');
    await page.evaluate(
      ({ main, target }) =>
        window.electronAPI!.sqlite.run(
          "INSERT INTO dimensions (id,source_id,target_id,type,home_id,author_id,created,updated) SELECT ?,?,?,'graft',home_id,author_id,created,updated FROM cruxes WHERE id=?",
          [crypto.randomUUID(), main, target, main],
        ),
      { main, target },
    );
    await page.goto(source);
    await expect(links.getByRole('region', { name: 'Grafts', exact: true })).toContainText(
      'Moonlight',
    );
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
          throw new Error('Connection read interrupted');
        }
        return original.call(this, sql, params);
      } as typeof original;
    });
    await links.getByRole('button', { name: 'Refresh connections', exact: true }).click();
    await expect(links.getByRole('alert')).toContainText('Connection read interrupted');
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', main);
    await links.getByRole('button', { name: 'Retry connections', exact: true }).click();
    await expect(links.getByRole('button', { name: 'Moonlight', exact: true })).toBeVisible();
    await links.getByRole('button', { name: 'Moonlight', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'References',
    );
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', target);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', main);
    const history = page.getByTestId('pane-body-history');
    if (!(await history.isVisible())) await togglePanel(page, 'Toggle growth');
    await history.getByRole('button', { name: 'Mark version', exact: true }).click();
    await history.getByPlaceholder('Label (optional)').fill('Rough mix');
    await history.getByRole('button', { name: 'Save', exact: true }).click();
    await links
      .getByRole('region', { name: 'Growth', exact: true })
      .getByRole('button', { name: 'Rough mix', exact: true })
      .click();
    await expect(page.getByRole('dialog', { name: 'Whole Crux Growth' })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(`/c/${main}`);
    await page.getByRole('button', { name: 'Close Growth graph', exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('growth')).toBeNull();
    await page.setViewportSize({ width: 480, height: 720 });
    await expect
      .poll(() => links.evaluate((el) => el.scrollWidth <= el.clientWidth + 1))
      .toBe(true);
    await expect(links.getByRole('button', { name: 'Moonlight', exact: true })).toBeInViewport();
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
    await page.screenshot({ path: 'e2e/.results/crux-dimensions.png' });
    await instance.app.close();
    instance = await launchApp({ dir });
    await instance.page.getByRole('button', { name: /enter/i }).click();
    await instance.page.goto(source);
    const restored = instance.page.getByRole('region', { name: 'Crux connections', exact: true });
    await expect(restored.getByRole('button', { name: 'Rough mix', exact: true })).toBeVisible();
    await expect(restored.getByRole('button', { name: 'Moonlight', exact: true })).toBeVisible();
    await expect(instance.page.getByRole('complementary', { name: 'Navigator' })).toHaveCount(0);
  } finally {
    await instance.app.close().catch(() => {});
  }
});
