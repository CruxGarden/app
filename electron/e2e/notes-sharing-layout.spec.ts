import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';

const evidence = resolve(__dirname, '../../docs/notes-sharing-layout');
test('Notes sharing layout: Settings → pending save → selection → static routes → reader', async () => {
  test.setTimeout(240000);
  const { app, page } = await launchApp();
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Notes/ }).click();
    await page.getByLabel('Name', { exact: true }).fill('A branching notebook');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const folder = (await storedCrux(page, id)).projectFolder as string;
    const frame = () => page.frameLocator('iframe[data-crux-id]');
    await expect(frame().getByRole('heading', { name: 'Welcome', exact: true })).toBeVisible({
      timeout: 120000,
    });
    const publication = () =>
      JSON.parse(readFileSync(join(folder, 'notebook/publish.json'), 'utf8'));
    for (const name of ['Start', 'Research/Épisode one']) {
      await frame().getByLabel('New note', { exact: true }).fill(name);
      await frame().getByRole('button', { name: 'Create note', exact: true }).click();
      await expect(
        frame().getByRole('heading', { name: name.split('/').pop(), exact: true }),
      ).toBeVisible();
      await frame()
        .locator('.tiptap[contenteditable=true]')
        .first()
        .fill(name === 'Start' ? 'FIRST_PAGE_BODY' : 'SECOND_PAGE_PENDING_BODY');
      if (name === 'Start') await frame().getByLabel('Include in public edition').check();
    }
    await page.getByRole('button', { name: 'Toggle metadata', exact: true }).click();
    const layout = page.getByLabel('Public notebook layout', { exact: true });
    await expect(layout).toHaveValue('single-page');
    await layout.selectOption('separate-pages');
    await expect(layout).toBeEnabled();
    await expect.poll(() => publication().layout).toBe('separate-pages');
    expect(readFileSync(join(folder, 'notebook/Research/Épisode one.md'), 'utf8')).toContain(
      'SECOND_PAGE_PENDING_BODY',
    );
    // The iframe opened publish.json before Settings saved it. Selection must preserve the new layout.
    await frame().getByLabel('Include in public edition').check();
    await expect.poll(() => publication().pages).toEqual(['Start.md', 'Research/Épisode one.md']);
    expect(publication().layout).toBe('separate-pages');
    mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: join(evidence, 'settings.png') });
    await frame().getByRole('button', { name: 'Save now', exact: true }).click();
    await expect(frame().getByRole('status')).toContainText('Saved');
    writeFileSync(
      join(folder, 'notebook/Start.md'),
      '---\ninternal: PRIVATE_METADATA\n---\n# Start\nFIRST_PAGE_BODY\n[Continue](Research/%C3%89pisode%20one.md)\n[Hidden](Welcome.md)\n![Dot](assets/dot.png)',
    );
    writeFileSync(
      join(folder, 'notebook/Research/Épisode one.md'),
      '# Episode\nSECOND_PAGE_PENDING_BODY\n[Back](../Start.md)',
    );
    writeFileSync(join(folder, 'notebook/Welcome.md'), 'PRIVATE_NOTE_BODY');
    mkdirSync(join(folder, 'notebook/assets'), { recursive: true });
    writeFileSync(
      join(folder, 'notebook/assets/dot.png'),
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
        'base64',
      ),
    );
    const built = await page.evaluate(
      async (folder) => window.electronAPI!.toolchain.build(folder),
      folder,
    );
    expect(built.code, built.log).toBe(0);
    const dist = join(folder, 'dist');
    const startHtml = readFileSync(join(dist, 'notes/Start.md/index.html'), 'utf8');
    expect(startHtml).toContain('FIRST_PAGE_BODY');
    expect(startHtml).not.toContain('SECOND_PAGE_PENDING_BODY');
    expect(startHtml).not.toContain('<astro-island');
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
    const server = createServer((req, res) => {
      let path = decodeURIComponent(req.url!.split('?')[0]!);
      if (path.includes('..')) {
        res.writeHead(404);
        res.end();
        return;
      }
      if (path.endsWith('/')) path += 'index.html';
      try {
        res.setHeader(
          'Content-Type',
          path.endsWith('.css')
            ? 'text/css'
            : path.endsWith('.js')
              ? 'text/javascript'
              : 'text/html',
        );
        res.end(readFileSync(join(dist, path)));
      } catch {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    try {
      const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      const previewUrl = await page.locator('iframe[data-crux-id]').getAttribute('src');
      // Block scripts on the public site: navigation, note content and images must still work.
      await page.route(`${origin}/**`, (route) =>
        route.request().resourceType() === 'script' ? route.abort() : route.continue(),
      );
      await page.locator('iframe[data-crux-id]').evaluate((el: HTMLIFrameElement, url) => {
        el.src = url;
      }, origin + '/');
      await expect(frame().locator('article')).toContainText('FIRST_PAGE_BODY');
      await expect(frame().getByRole('link', { name: 'Hidden', exact: true })).toHaveCount(0);
      await frame().getByRole('link', { name: 'Continue', exact: true }).click();
      await expect(frame().locator('article')).toContainText('SECOND_PAGE_PENDING_BODY');
      expect(
        await frame()
          .locator('html')
          .evaluate(() => location.pathname),
      ).toBe('/notes/Research/%C3%89pisode%20one.md/');
      await frame()
        .locator('html')
        .evaluate(() => location.reload());
      await expect(frame().locator('article')).toContainText('SECOND_PAGE_PENDING_BODY');
      await frame().getByRole('link', { name: 'Back', exact: true }).click();
      await expect(frame().locator('article')).toContainText('FIRST_PAGE_BODY');
      await expect
        .poll(() =>
          frame()
            .locator('article img')
            .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
        )
        .toBe(true);
      await page.screenshot({ path: join(evidence, 'separate-pages.png') });
      await page.unroute(`${origin}/**`);
      await page.locator('iframe[data-crux-id]').evaluate((el: HTMLIFrameElement, url) => {
        el.src = url!;
      }, previewUrl);
      await expect(frame().getByRole('heading', { name: 'Welcome', exact: true })).toBeVisible({
        timeout: 60000,
      });
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
      await page.locator('iframe[data-crux-id]').evaluate((el: HTMLIFrameElement, url) => {
        el.src = url;
      }, origin + '/');
      await expect(frame().getByLabel('Search notebook')).toBeVisible();
      await frame().getByLabel('Search notebook').fill('SECOND_PAGE_PENDING_BODY');
      await expect(frame().locator('nav a')).toHaveCount(1);
      await frame().locator('nav a').click();
      await expect(frame().locator('article')).toContainText('SECOND_PAGE_PENDING_BODY');
      writeFileSync(
        join(evidence, 'evidence.json'),
        JSON.stringify(
          {
            pendingSave: true,
            selectionPreserved: true,
            noJavaScriptNavigation: true,
            nestedUnicodeRoutes: true,
            images: true,
            privateContentExcluded: true,
            switchBackRemovesPages: true,
            readerSearch: true,
          },
          null,
          2,
        ),
      );
    } finally {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
  } finally {
    await app.close();
  }
});
