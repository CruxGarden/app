import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

async function pane(page: Page, name: string, toggle: string) {
  if (!(await page.getByTestId(`pane-body-${name}`).isVisible()))
    await page.getByRole('button', { name: toggle, exact: true }).click();
}
test('Glasshouse is created without a key, exports all Tasks, and imports as an independent demo', async () => {
  test.setTimeout(180000);
  const { app, page, dir } = await launchApp();
  page.setDefaultTimeout(15000);
  try {
    await enterGarden(page);
    await page
      .getByRole('banner')
      .getByRole('link', { name: /^Tending/ })
      .click();
    await page.getByRole('button', { name: 'Create demo Crux', exact: true }).click();
    await expect(page.getByText('Glasshouse is ready.', { exact: false })).toBeVisible({
      timeout: 60000,
    });
    const group = page.getByRole('region', { name: 'Glasshouse · Tending demo', exact: true });
    await expect(group.getByText('Ready to review', { exact: true })).toHaveCount(2);
    await expect(group.getByText('Working', { exact: true })).toHaveCount(0);
    await expect(group.getByText('Not checked', { exact: true })).toHaveCount(4);
    await page.screenshot({ path: '/private/tmp/glasshouse-tending.png', fullPage: true });
    await group.getByRole('button', { name: 'Open Main', exact: true }).click();
    const originalId = (await page
      .locator('[data-workspace-id]')
      .getAttribute('data-workspace-id'))!;

    await page.evaluate(() => {
      const w = window as unknown as { __demoBlob?: Blob };
      const blobs = new Map<string, Blob>();
      const original = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        const url = original(blob);
        if (blob instanceof Blob) blobs.set(url, blob);
        return url;
      };
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download.endsWith('.crux')) w.__demoBlob = blobs.get(this.href);
        if (!this.download) click.call(this);
      };
    });
    await pane(page, 'export', 'Toggle export');
    await page.getByRole('button', { name: 'Export Crux', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => !!(window as unknown as { __demoBlob?: Blob }).__demoBlob))
      .toBe(true);
    const encoded = await page.evaluate(async () => {
      const bytes = new Uint8Array(
        await (window as unknown as { __demoBlob: Blob }).__demoBlob.arrayBuffer(),
      );
      let value = '';
      for (let i = 0; i < bytes.length; i += 0x8000)
        value += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(value);
    });
    const archive = join(dir, 'glasshouse.crux');
    writeFileSync(archive, Buffer.from(encoded, 'base64'));
    // A delivery artifact in scratch; copying into demos/ is an explicit release step.
    writeFileSync('/private/tmp/glasshouse.crux', Buffer.from(encoded, 'base64'));

    await page.getByRole('banner').getByRole('button').first().click();
    await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Import .crux file', exact: true }).click(),
    ]);
    await chooser.setFiles(archive);
    await expect(page.locator('[data-workspace-id]')).not.toHaveAttribute(
      'data-workspace-id',
      originalId,
    );
    const taskbar = page.getByTestId('task-bar');
    await expect(taskbar.getByRole('link', { name: /^Brand foundation/ })).toBeVisible();
    await taskbar.getByRole('link', { name: /^Checkout/ }).click();
    const collaboration = page.getByRole('button', { name: 'Toggle collaboration' });
    if ((await collaboration.getAttribute('aria-pressed')) === 'true') await collaboration.click();
    await pane(page, 'artifacts', 'Toggle artifacts');
    await page.getByRole('tree').getByText('index.html', { exact: true }).click();
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const preview = page.frameLocator('iframe[data-crux-id]');
    await expect(
      preview.getByRole('heading', { name: 'A little green. A whole new feeling.' }),
    ).toBeVisible();
    await preview.getByRole('button', { name: 'Add to bag' }).first().click();
    await preview.getByRole('button', { name: 'Try demo checkout' }).click();
    await expect(preview.getByRole('status')).toContainText('Demo order placed: 1 plant');
    await preview.getByRole('button', { name: 'Try demo checkout' }).click();
    await expect(preview.getByRole('status')).toContainText('Your bag is empty');
    await page.screenshot({ path: '/private/tmp/glasshouse-workspace.png' });
    // Capture the static site at a presentation width, through its actual preview server.
    const url = (await page.locator('iframe[data-crux-id]').getAttribute('src'))!;
    const siteWindow = app.waitForEvent('window');
    await app.evaluate(({ BrowserWindow }, url) => {
      const window = new BrowserWindow({ width: 1200, height: 1050, show: false });
      void window.loadURL(url);
    }, url);
    const site = await siteWindow;
    await site.setViewportSize({ width: 1200, height: 1050 });
    await site.goto(url);
    await expect(
      site.getByRole('heading', { name: 'A little green. A whole new feeling.' }),
    ).toBeVisible();
    await site.screenshot({ path: '/private/tmp/glasshouse-preview.png', fullPage: true });
    await site.setViewportSize({ width: 390, height: 844 });
    expect(await site.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await site.screenshot({ path: '/private/tmp/glasshouse-mobile.png', fullPage: true });
    await site.close();

    await page.getByRole('button', { name: 'Review changes', exact: true }).click();
    const review = page.getByRole('dialog', { name: 'Review changes for Main' });
    await review.getByRole('button', { name: 'Check combined result' }).click();
    await expect(review.getByRole('checkbox')).toBeEnabled();
    await review.getByRole('checkbox').check();
    await review.getByRole('button', { name: 'Merge into Main', exact: true }).click();
    await expect(review).toHaveCount(0);
    await pane(page, 'history', 'Toggle history');
    await page.getByRole('button', { name: 'Whole Crux · branches & merges', exact: true }).click();
    const graph = page.getByRole('dialog', { name: 'Whole Crux Growth' });
    await expect(
      graph.getByRole('button', { name: 'Brand foundation · merged', exact: true }),
    ).toBeVisible();
    await expect(
      graph.getByRole('button', { name: 'Checkout · merged', exact: true }),
    ).toBeVisible();
    await expect(graph.getByTestId('growth-canvas-2d').locator('canvas')).toBeVisible();
    await page.screenshot({ path: '/private/tmp/glasshouse-growth.png' });
  } finally {
    // This screenshot journey creates an extra BrowserWindow. Destroy its test
    // windows before quitting so browser connections cannot hold server teardown.
    // The dedicated lifecycle suite covers interactive workspace-close behavior.
    await app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) window.destroy();
    });
    await app.close();
  }
});
