import { test, expect, chromium } from '@playwright/test';
import { existsSync, readFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';
import { openBuilder } from './builder-helpers';

/**
 * The Blog starter re-seeded from Astro Cactus: a person writes a post from the
 * Builder and the live site serves it at /posts/<slug> and lists it on the
 * front page; the scripted collaborator drafts a post with write_file; Share
 * builds and publishes the site with its search index and feed; the blog
 * survives a restart; a complete Crux archive imports into a clean Garden.
 */
const evidence = resolve(__dirname, '../../docs/blog-cactus');

test('Blog (Cactus): Builder post, live route, collaborator post, share, restart, clean import', async () => {
  test.setTimeout(20 * 60_000);
  mkdirSync(evidence, { recursive: true });
  const api = await startMockApi();
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1', CRUX_API_URL: api.url } });
  const archive = join(first.dir, 'blog.crux');
  let folder = '';
  let id = '';
  const post = (name: string) => join(folder, 'content/posts', `${name}.md`);
  const openSite = async () => {
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

    await test.step('create from the picker; the Builder lists the seed post', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /Astro Blog/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder as string;
      await expect
        .poll(() => existsSync(post('hello-from-the-garden')), { timeout: 60000 })
        .toBe(true);
      await openBuilder(page);
      await expect(page.getByRole('button', { name: /new post/i }).first()).toBeVisible({
        timeout: 30000,
      });
      await expect(page.getByText('Hello from the garden').first()).toBeVisible();
      await page.screenshot({ path: join(evidence, 'blog-builder.png') });
    });

    await test.step('a person writes a post; the live site serves and lists it', async () => {
      await page
        .getByRole('button', { name: /new post/i })
        .first()
        .click();
      await page.getByPlaceholder('Post title').fill('Compost');
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      const monaco = page.locator('.monaco-editor').first();
      await expect(monaco).toBeVisible({ timeout: 30000 });
      await expect.poll(() => existsSync(post('compost')), { timeout: 30000 }).toBe(true);
      expect(readFileSync(post('compost'), 'utf8')).toMatch(
        /publishDate: ['"]?\d{4}-\d{2}-\d{2}T12:00:00Z['"]?/,
      );
      await monaco.click();
      await page.keyboard.press('ControlOrMeta+ArrowDown');
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.type('Compost turns what is finished into what comes next.');
      await page.keyboard.press('ControlOrMeta+s');
      await expect
        .poll(() => readFileSync(post('compost'), 'utf8'), { timeout: 30000 })
        .toContain('what comes next');
      await page.getByRole('button', { name: 'Preview', exact: true }).click();
      const preview = page.locator('iframe[src^="http://127.0.0.1"]');
      const failed = page.getByText('Preview could not start', { exact: true });
      await expect
        .poll(
          async () => {
            if (await preview.isVisible()) return 'ready';
            if (await failed.isVisible().catch(() => false)) {
              const log = await page.evaluate((f) => window.electronAPI!.devserver.log(f), folder);
              const astroLog = existsSync(join(folder, '.astro/dev.log'))
                ? readFileSync(join(folder, '.astro/dev.log'), 'utf8').slice(-2000)
                : '(no .astro/dev.log)';
              throw new Error(`preview failed: ${log.slice(-2000)}\nastro: ${astroLog}`);
            }
            return 'waiting';
          },
          { timeout: 8 * 60_000, message: 'the site preview never appeared' },
        )
        .toBe('ready');
      await expect(preview).toHaveAttribute('src', /\/posts\/compost$/);
      siteUrl = (await preview.getAttribute('src'))!;
      await page.screenshot({ path: join(evidence, 'blog-post-preview.png') });
      const { site, close } = await openSite();
      try {
        await site.goto(siteUrl);
        await expect(site.getByRole('heading', { name: 'Compost', exact: true })).toBeVisible({
          timeout: 60000,
        });
        await expect(site.locator('article')).toContainText('what comes next');
        await site.goto(new URL('/', siteUrl).toString());
        await expect(site.getByRole('link', { name: /Compost/ })).toBeVisible();
        await site.screenshot({ path: join(evidence, 'blog-home.png'), fullPage: true });
        await site.goto(new URL('/posts/markdown-elements/', siteUrl).toString());
        await expect(site.locator('article')).toBeVisible();
      } finally {
        await close();
      }
    });

    await test.step('the scripted collaborator drafts a post with write_file', async () => {
      const collab = page.getByRole('button', { name: 'Toggle collaboration' });
      if ((await collab.getAttribute('aria-pressed')) !== 'true') await collab.click();
      const box = page.getByPlaceholder('Send a message...');
      await box.fill('Write a post about moss [blog:post]');
      await box.press('Enter');
      await expect(
        page.getByText('Drafted a post about moss and tagged it garden.', { exact: true }),
      ).toBeVisible({
        timeout: 120000,
      });
      await expect.poll(() => existsSync(post('moss')), { timeout: 30000 }).toBe(true);
      const { site, close } = await openSite();
      try {
        await expect
          .poll(
            async () =>
              (await site.request.get(new URL('/posts/moss/', siteUrl).toString())).status(),
            {
              timeout: 60000,
            },
          )
          .toBe(200);
        await site.goto(new URL('/tags/garden/', siteUrl).toString());
        await expect(site.getByRole('link', { name: /Moss/ })).toBeVisible();
        await site.screenshot({ path: join(evidence, 'blog-tag.png') });
      } finally {
        await close();
      }
      await collab.click();
    });

    await test.step('Share builds the blog and publishes it with search and a feed', async () => {
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
      await expect(page.getByText('Up to date')).toBeVisible({ timeout: 8 * 60_000 });
      const paths = (api.state.published[id] ?? []).map((f) => f.path);
      for (const path of [
        'index.html',
        'posts/compost/index.html',
        'posts/moss/index.html',
        'posts/index.html',
        'tags/garden/index.html',
        'rss.xml',
        'pagefind/pagefind.js',
        'og-image/compost.png',
      ])
        expect(paths, paths.join(', ')).toContain(path);
      const home = Buffer.from(
        api.state.published[id]!.find((f) => f.path === 'index.html')!.bytes,
      ).toString('utf8');
      expect(home).not.toMatch(/fonts\.googleapis|cdn\.jsdelivr/);
      await page.screenshot({ path: join(evidence, 'blog-published.png') });
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
    await test.step('restart: the posts are still there', async () => {
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      await openBuilder(page);
      await expect(page.getByText('Moss').first()).toBeVisible({ timeout: 30000 });
      await expect(page.getByText('Compost').first()).toBeVisible();
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
    await test.step('clean Garden: the complete Crux imports with every post', async () => {
      await importNativeCrux(page, archive);
      const importedId = (await page
        .locator('[data-workspace-id]')
        .getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, importedId)).projectFolder as string;
      await expect.poll(() => existsSync(post('moss')), { timeout: 60000 }).toBe(true);
      expect(existsSync(post('compost'))).toBe(true);
      expect(existsSync(join(folder, 'node_modules'))).toBe(false);
      await page.screenshot({ path: join(evidence, 'blog-imported.png') });
    });
  } finally {
    await third.app.close();
    await api.close();
  }
});
