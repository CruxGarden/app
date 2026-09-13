import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { openWindow, serve } from './public-site-helpers';

/**
 * Public notebook layout (ADR 0028) with the actual Tigrana: the Settings pane
 * chooses single-page or separate-pages, the bar's Public edition… panel
 * chooses the notes, and the edition script renders static routes that work
 * without JavaScript (separate pages) or one searchable page. The published
 * site is checked in its own window, so the Workshop's own preview is untouched.
 */
const evidence = resolve(__dirname, '../../docs/notes-sharing-layout');
const frameOf = (page: Page) => page.frameLocator('iframe[data-crux-id]');
const status = (page: Page) => frameOf(page).locator('#garden-project [role=status]');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);
test('Notes sharing layout: Settings → selection → static routes → reader', async () => {
  test.setTimeout(10 * 60_000);
  mkdirSync(evidence, { recursive: true });
  const instance = await launchApp();
  try {
    const { page } = instance;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1050 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Notes/ }).click();
    await page.getByLabel('Name', { exact: true }).fill('A branching notebook');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const folder = (await storedCrux(page, id)).projectFolder as string;
    const publication = () =>
      JSON.parse(readFileSync(join(folder, 'notebook/publish.json'), 'utf8'));
    await expect(status(page)).toHaveText('Saved', { timeout: 120000 });
    await expect
      .poll(() => existsSync(join(folder, 'notebook/Welcome.md')), { timeout: 60000 })
      .toBe(true);

    // Notes written by another editor (the desktop Tigrana, a script): the watcher ingests them.
    mkdirSync(join(folder, 'notebook/Research'), { recursive: true });
    mkdirSync(join(folder, 'notebook/.assets'), { recursive: true });
    writeFileSync(
      join(folder, 'notebook/Start.md'),
      '---\ninternal: PRIVATE_METADATA\n---\n# Start\nFIRST_PAGE_BODY\n[Continue](Research/%C3%89pisode%20one.md)\n[Hidden](Welcome.md)\n![Dot](.assets/dot.png)',
    );
    writeFileSync(
      join(folder, 'notebook/Research/Épisode one.md'),
      '# Episode\nSECOND_PAGE_PENDING_BODY\n[Back](../Start.md)',
    );
    writeFileSync(join(folder, 'notebook/Welcome.md'), 'PRIVATE_NOTE_BODY');
    writeFileSync(join(folder, 'notebook/.assets/dot.png'), png);

    await page.getByRole('button', { name: 'Toggle metadata', exact: true }).click();
    const layout = page.getByLabel('Public notebook layout', { exact: true });
    await expect(layout).toHaveValue('single-page');
    await layout.selectOption('separate-pages');
    await expect.poll(() => publication().layout).toBe('separate-pages');

    // The selection keeps the layout Settings chose; the first note chosen is the front page.
    await frameOf(page).getByRole('button', { name: 'Public edition…' }).click();
    const box = (path: string) =>
      frameOf(page).locator(`#garden-publication input[data-note="${path}"]`);
    await expect(box('Start.md')).toBeVisible({ timeout: 60000 });
    await box('Start.md').check();
    await box('Research/Épisode one.md').check();
    await expect.poll(() => publication().pages).toEqual(['Start.md', 'Research/Épisode one.md']);
    expect(publication().layout).toBe('separate-pages');
    await frameOf(page).getByRole('button', { name: 'Public edition…' }).click();
    await expect(status(page)).toHaveText('Saved');

    const installed = await page.evaluate(
      async (folder) => window.electronAPI!.toolchain.install(folder),
      folder,
    );
    expect(installed.code, installed.log).toBe(0);
    const built = await page.evaluate(
      async (folder) => window.electronAPI!.toolchain.build(folder),
      folder,
    );
    expect(built.code, built.log).toBe(0);
    const dist = join(folder, 'dist');
    const startHtml = readFileSync(join(dist, 'notes/Start.md/index.html'), 'utf8');
    expect(startHtml).toContain('FIRST_PAGE_BODY');
    expect(startHtml).not.toContain('SECOND_PAGE_PENDING_BODY');
    expect(readFileSync(join(dist, 'notes/Research/Épisode one.md/index.html'), 'utf8')).toContain(
      'SECOND_PAGE_PENDING_BODY',
    );
    const allText = (path: string): string =>
      readdirSync(path, { withFileTypes: true })
        .map((f) =>
          f.isDirectory() ? allText(join(path, f.name)) : readFileSync(join(path, f.name), 'utf8'),
        )
        .join('\n');
    expect(allText(dist)).not.toContain('PRIVATE_NOTE_BODY');
    expect(allText(dist)).not.toContain('PRIVATE_METADATA');

    const server = await serve(dist);
    try {
      // Block scripts on the public site: navigation, note content and images must still work.
      const site = await openWindow(instance.app, server.origin + '/');
      await site.route(`${server.origin}/**`, (route) =>
        route.request().resourceType() === 'script' ? route.abort() : route.continue(),
      );
      await expect(site.locator('article')).toContainText('FIRST_PAGE_BODY');
      await expect(site.getByRole('link', { name: 'Hidden', exact: true })).toHaveCount(0);
      await site.getByRole('link', { name: 'Continue', exact: true }).click();
      await expect(site.locator('article')).toContainText('SECOND_PAGE_PENDING_BODY');
      expect(new URL(site.url()).pathname).toBe('/notes/Research/%C3%89pisode%20one.md/');
      await site.reload();
      await expect(site.locator('article')).toContainText('SECOND_PAGE_PENDING_BODY');
      await site.getByRole('link', { name: 'Back', exact: true }).click();
      await expect(site.locator('article')).toContainText('FIRST_PAGE_BODY');
      await expect
        .poll(() =>
          site
            .locator('article img')
            .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
        )
        .toBe(true);
      await site.screenshot({ path: join(evidence, 'separate-pages.png') });
      await site.close();

      // The same Settings control switches the existing Crux back without changing selection.
      await layout.selectOption('single-page');
      await expect.poll(() => publication().layout).toBe('single-page');
      expect(publication().pages).toHaveLength(2);
      const rebuilt = await page.evaluate(
        async (folder) => window.electronAPI!.toolchain.build(folder),
        folder,
      );
      expect(rebuilt.code, rebuilt.log).toBe(0);
      expect(existsSync(join(dist, 'notes/Start.md/index.html'))).toBe(false);
      const single = await openWindow(instance.app, server.origin + '/');
      await expect(single.getByLabel('Search notebook')).toBeVisible();
      await single.getByLabel('Search notebook').fill('SECOND_PAGE_PENDING_BODY');
      await expect(single.locator('nav a:not([hidden])')).toHaveCount(1);
      await single.locator('nav a:not([hidden])').click();
      await expect(single.locator('article:not([hidden])')).toContainText(
        'SECOND_PAGE_PENDING_BODY',
      );
      await single.screenshot({ path: join(evidence, 'single-page.png') });
      await single.close();
    } finally {
      await server.close();
    }
    await expect(status(page)).toHaveText('Saved', { timeout: 120000 });
  } finally {
    await instance.app.close();
  }
});
