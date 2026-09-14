import { test, expect, chromium, type Page } from '@playwright/test';
import { existsSync, readFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

/**
 * The Digital Garden template (Veka on Astro, with backlinks and a graph): a
 * person plants a note from the Builder and links it with a wikilink; the live
 * site resolves the link, shows the new note under "Linked from" on its target,
 * lists it on the home page and draws it in the graph; the scripted collaborator
 * plants a seedling with write_file; Share builds and publishes the site with
 * the graph data and search index; the garden survives a restart; a complete
 * Crux archive imports into a clean Garden with the folder gone.
 */
const evidence = resolve(__dirname, '../../docs/digital-garden');
const NOTE_BODY = 'Compost turns what is finished into what comes next. See [[Tending notes]].';

test('Digital Garden: plant a note, wikilink, backlinks, graph, collaborator, share, restart, clean import', async () => {
  test.setTimeout(20 * 60_000);
  mkdirSync(evidence, { recursive: true });
  const api = await startMockApi();
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1', CRUX_API_URL: api.url } });
  const archive = join(first.dir, 'garden.crux');
  let folder = '';
  let id = '';
  const note = (name: string) => join(folder, 'src/content/wiki/notes', `${name}.md`);
  const openSite = async (url: string) => {
    const browser = await chromium.launch();
    const site = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    return { site, close: () => browser.close() };
  };
  let siteUrl = '';
  try {
    const { page } = first;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);

    await test.step('create from the picker; the Builder lists the seed notes', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Digital Garden/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder as string;
      await expect.poll(() => existsSync(note('growth-stages')), { timeout: 60000 }).toBe(true);
      await page.getByRole('button', { name: 'Edit content', exact: true }).click();
      await expect(page.getByRole('button', { name: /new note/i }).first()).toBeVisible({
        timeout: 30000,
      });
      await expect(page.getByText('Growth stages').first()).toBeVisible();
      await page.screenshot({ path: join(evidence, 'garden-builder.png') });
    });

    await test.step('a person plants a note with a wikilink; the live site resolves it', async () => {
      await page
        .getByRole('button', { name: /new note/i })
        .first()
        .click();
      await page.getByPlaceholder('Note title').fill('Compost');
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      const monaco = page.locator('.monaco-editor').first();
      await expect(monaco).toBeVisible({ timeout: 30000 });
      await expect.poll(() => existsSync(note('compost')), { timeout: 30000 }).toBe(true);
      expect(readFileSync(note('compost'), 'utf8')).toContain('growthStage: seedling');
      await monaco.click();
      await page.keyboard.press('ControlOrMeta+ArrowDown');
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.type(NOTE_BODY);
      await page.keyboard.press('ControlOrMeta+s');
      await expect
        .poll(() => readFileSync(note('compost'), 'utf8'), { timeout: 30000 })
        .toContain('[[Tending notes]]');
      // The note's Preview view shows the live site: astro dev starts with the Crux and the
      // first run installs the garden's dependencies. On a timeout the dev server's own log
      // is the evidence, so the wait reads it instead of a bare locator failure.
      await page.getByRole('button', { name: 'Preview', exact: true }).click();
      const preview = page.locator('iframe[src^="http://127.0.0.1"]');
      const failed = page.getByText('Preview could not start', { exact: true });
      let retried = false;
      await expect
        .poll(
          async () => {
            if (await preview.isVisible()) return 'ready';
            const status = await page.evaluate(
              (f) => window.electronAPI!.devserver.status(f),
              folder,
            );
            if (await failed.isVisible().catch(() => false)) {
              const log = await page.evaluate((f) => window.electronAPI!.devserver.log(f), folder);
              const detail = await page
                .locator('pre', { hasText: /./ })
                .last()
                .textContent()
                .catch(() => '');
              if (retried) throw new Error(`preview failed twice; detail: ${detail}\nlog: ${log}`);
              console.log(
                `[digital-garden] preview failed once; retrying. detail: ${detail}\nlog: ${log.slice(-1500)}`,
              );
              retried = true;
              await page.getByRole('button', { name: 'Retry preview' }).click();
            }
            return status.status;
          },
          { timeout: 8 * 60_000, message: 'the site preview never appeared' },
        )
        .toBe('ready');
      await expect(preview).toHaveAttribute('src', /\/wiki\/notes\/compost$/);
      siteUrl = (await preview.getAttribute('src'))!;
      await page.screenshot({ path: join(evidence, 'garden-note-preview.png') });
      const { site, close } = await openSite(siteUrl);
      try {
        await site.goto(siteUrl);
        await expect(site.getByRole('heading', { name: 'Compost', exact: true })).toBeVisible({
          timeout: 60000,
        });
        const link = site.locator('article').getByRole('link', { name: 'Tending notes' });
        await expect(link).toHaveAttribute('href', '/wiki/notes/tending-notes');
        await expect(site.locator('[data-backlinks]')).toContainText(
          'No other note links here yet',
        );
        await link.click();
        await expect(
          site.getByRole('heading', { name: 'Tending notes', exact: true }),
        ).toBeVisible();
        const backlinks = site.locator('[data-backlinks]');
        await expect(backlinks).toContainText('Linked from · 3');
        await expect(backlinks.getByRole('link', { name: /Compost/ })).toBeVisible();
        await site.waitForTimeout(800); // let the view transition settle before the picture
        await site.screenshot({ path: join(evidence, 'garden-backlinks.png'), fullPage: true });
        await site.goto(new URL('/', siteUrl).toString());
        await expect(site.getByRole('link', { name: /Compost/ })).toBeVisible();
        await site.goto(new URL('/graph', siteUrl).toString());
        await expect(site.locator('#garden-graph')).toHaveAttribute('data-ready', 'true', {
          timeout: 60000,
        });
        await expect(site.locator('#garden-graph canvas')).toBeVisible();
        await expect(site.locator('#garden-graph')).toHaveAttribute('data-nodes', '6');
        const graph = (await (
          await site.request.get(new URL('/graph.json', siteUrl).toString())
        ).json()) as {
          nodes: { id: string }[];
          links: { source: string; target: string }[];
        };
        expect(graph.nodes.map((n) => n.id)).toContain('notes/compost');
        expect(graph.links).toContainEqual({
          source: 'notes/compost',
          target: 'notes/tending-notes',
        });
        await site.waitForTimeout(1500);
        await site.screenshot({ path: join(evidence, 'garden-graph.png') });
      } finally {
        await close();
      }
    });

    await test.step('the scripted collaborator plants a seedling with write_file', async () => {
      const collab = page.getByRole('button', { name: 'Toggle collaboration' });
      if ((await collab.getAttribute('aria-pressed')) !== 'true') await collab.click();
      const box = page.getByPlaceholder('Send a message...');
      await box.fill('Add a note about moss [garden:note]');
      await box.press('Enter');
      await expect(
        page.getByText(
          'Planted a seedling about moss, linked to Tending notes and Growth stages.',
          {
            exact: true,
          },
        ),
      ).toBeVisible({ timeout: 120000 });
      await expect.poll(() => existsSync(note('moss')), { timeout: 30000 }).toBe(true);
      const { site, close } = await openSite(siteUrl);
      try {
        await expect
          .poll(
            async () =>
              (await site.request.get(new URL('/wiki/notes/moss', siteUrl).toString())).status(),
            { timeout: 60000 },
          )
          .toBe(200);
        await site.goto(new URL('/wiki/notes/moss', siteUrl).toString());
        await expect(site.getByRole('heading', { name: 'Moss', exact: true })).toBeVisible();
        await site.screenshot({ path: join(evidence, 'garden-agent-note.png') });
      } finally {
        await close();
      }
      await collab.click();
    });

    await test.step('Share builds the garden and publishes it with the graph data and search', async () => {
      await page.getByRole('button', { name: 'Toggle share' }).click();
      await page.getByRole('button', { name: 'Share', exact: true }).click();
      await page.getByPlaceholder('email@example.com').fill('tester@example.com');
      await page.getByRole('button', { name: 'Send Code', exact: true }).click();
      await page.getByPlaceholder('Enter code').fill('123456');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      const backupAsk = page
        .getByRole('dialog')
        .filter({ hasText: 'A published site is not a backup' });
      await expect(backupAsk).toBeVisible({ timeout: 60000 });
      await backupAsk.getByRole('button', { name: 'Share without a backup', exact: true }).click();
      await expect(page.getByText('Up to date')).toBeVisible({ timeout: 6 * 60_000 });
      const paths = (api.state.published[id] ?? []).map((f) => f.path);
      for (const path of [
        'index.html',
        'graph/index.html',
        'graph.json',
        'wiki/notes/compost/index.html',
        'wiki/notes/moss/index.html',
        'wiki/notes/tending-notes/index.html',
        'pagefind/pagefind.js',
      ])
        expect(paths, paths.join(', ')).toContain(path);
      const tending = Buffer.from(
        api.state.published[id]!.find((f) => f.path === 'wiki/notes/tending-notes/index.html')!
          .bytes,
      ).toString('utf8');
      expect(tending).toContain('Linked from · 4');
      expect(tending).toContain('href="/wiki/notes/moss"');
      const home = Buffer.from(
        api.state.published[id]!.find((f) => f.path === 'index.html')!.bytes,
      ).toString('utf8');
      expect(home).not.toMatch(/fonts\.googleapis|cdn\.jsdelivr/);
      await page.screenshot({ path: join(evidence, 'garden-published.png') });
      await page.getByRole('button', { name: 'Toggle share' }).click();
    });
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ dir: first.dir, env: { CRUX_API_URL: api.url } });
  try {
    const { page } = second;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.getByRole('button', { name: /enter/i }).click();
    await test.step('restart: the garden and its notes are still there', async () => {
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      await page.getByRole('button', { name: 'Edit content', exact: true }).click();
      await expect(page.getByText('Moss').first()).toBeVisible({ timeout: 30000 });
      await expect(page.getByText('Compost').first()).toBeVisible();
      await page.screenshot({ path: join(evidence, 'garden-reopened.png') });
      await exportNativeCrux(page, archive, second.app, async () => {
        await page.getByRole('button', { name: 'Toggle export' }).click();
        await page.getByRole('button', { name: 'Export Crux', exact: true }).click();
      });
    });
  } finally {
    await second.app.close();
    renameSync(folder, `${folder}-unavailable`);
  }

  const third = await launchApp({ env: { CRUX_API_URL: api.url } });
  try {
    const { page } = third;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);
    await test.step('clean Garden: the complete Crux imports with every note', async () => {
      await importNativeCrux(page, archive);
      const importedId = (await page
        .locator('[data-workspace-id]')
        .getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, importedId)).projectFolder as string;
      await expect.poll(() => existsSync(note('moss')), { timeout: 60000 }).toBe(true);
      expect(existsSync(note('compost'))).toBe(true);
      expect(existsSync(join(folder, 'src/lib/wiki/links.mjs'))).toBe(true);
      expect(existsSync(join(folder, 'node_modules'))).toBe(false);
      // The archive carried the layout as it was exported: open the Workshop again.
      const edit = page.getByRole('button', { name: 'Edit content', exact: true });
      if (!(await edit.isVisible().catch(() => false)))
        await page.getByRole('button', { name: 'Toggle workshop' }).click();
      await edit.click();
      await expect(page.getByText('Moss').first()).toBeVisible({ timeout: 30000 });
      await page.screenshot({ path: join(evidence, 'garden-imported.png') });
    });
  } finally {
    await third.app.close();
    await api.close();
  }
});
