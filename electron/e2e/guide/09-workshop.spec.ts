import { revealOptionsFor } from '../panel-helpers';
import { test, expect } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from '../launch';
import {
  enterGarden,
  createCrux,
  storedCrux,
  switchCrux,
  setAutoCheck,
} from '../multi-crux-helpers';
import { enableAdvancedMode, openPanel } from '../panel-helpers';
import { openBuilder } from '../builder-helpers';
import {
  createFromPicker,
  waitForSitePreview,
  openSite,
  pollBody,
  pollStatus,
  PNG_DOT,
} from './site-helpers';

/**
 * V1-TESTING-GUIDE § 09 · Workshop: editing, preview and capture. WORK-01/02
 * live in the editor specs, WORK-03 in homepage-keel.spec.ts, WORK-08 in
 * screenshot.spec.ts and WORK-10 in tool-info.spec.ts.
 */
test.describe('guide 09 · Workshop', () => {
  test('WORK-07 — Open in browser reaches the system browser; links, reload and two previews stay in their own site', async () => {
    const { app, page } = await launchApp();
    try {
      // The system browser, stubbed in the main process: every open is recorded.
      await app.evaluate(({ shell }) => {
        const g = globalThis as unknown as { __opened: string[] };
        g.__opened = [];
        shell.openExternal = async (url: string) => {
          g.__opened.push(url);
        };
      });
      const opened = () =>
        app.evaluate(() => (globalThis as unknown as { __opened: string[] }).__opened);

      await enterGarden(page);
      const site = async (id: string, name: string) => {
        const folder = (await storedCrux(page, id)).projectFolder as string;
        writeFileSync(
          join(folder, 'index.html'),
          `<h1>${name}</h1><a href="page2.html">Second page</a>`,
        );
        writeFileSync(
          join(folder, 'page2.html'),
          `<h1>Page two of ${name}</h1><a href="/">Home</a>`,
        );
        const artifacts = await openPanel(page, 'artifacts', 'Toggle artifacts');
        await artifacts.getByRole('tree').getByText('index.html', { exact: true }).click({
          timeout: 30_000,
        });
        await page.getByRole('button', { name: 'Preview', exact: true }).click();
        const frame = page.frameLocator('iframe[data-crux-id]');
        await expect(frame.getByRole('heading')).toHaveText(name, { timeout: 30_000 });
        return frame;
      };

      const alpha = await createCrux(page, 'Alpha site');
      const frame = await site(alpha, 'Alpha site');
      const alphaSrc = (await page.locator('iframe[data-crux-id]').getAttribute('src'))!;

      // The app's own control opens the preview's address in the browser.
      await page.getByRole('button', { name: 'Open ↗' }).click();
      await expect.poll(opened).toHaveLength(1);
      expect((await opened())[0]).toMatch(/^http:\/\/127\.0\.0\.1:\d+/);
      expect(new URL((await opened())[0]!).origin).toBe(new URL(alphaSrc).origin);

      // A relative link and a root link stay inside this site.
      await frame.getByRole('link', { name: 'Second page' }).click();
      await expect(frame.getByRole('heading')).toHaveText('Page two of Alpha site');
      await frame.getByRole('link', { name: 'Home' }).click();
      await expect(frame.getByRole('heading')).toHaveText('Alpha site');
      // Reload keeps the same site.
      await revealOptionsFor(page.getByTestId('preview-refresh'));
      await page.getByTestId('preview-refresh').click();
      await expect(frame.getByRole('heading')).toHaveText('Alpha site');

      // A second Crux previews on its own server, not Alpha's.
      const beta = await createCrux(page, 'Beta site');
      await site(beta, 'Beta site');
      await page.getByRole('button', { name: 'Open ↗' }).click();
      await expect.poll(opened).toHaveLength(2);
      const [a, b] = (await opened()).map((u) => new URL(u).origin);
      expect(a).not.toBe(b);
      expect(await (await fetch(a!)).text()).toContain('<h1>Alpha site</h1>');
      expect(await (await fetch(b!)).text()).toContain('<h1>Beta site</h1>');
      // Returning to the first shows its own page again.
      await switchCrux(page, 'Alpha site');
      await expect(page.frameLocator('iframe[data-crux-id]').getByRole('heading')).toHaveText(
        'Alpha site',
      );
    } finally {
      await app.close();
    }
  });

  test('WORK-05 — content forms: text, color and image fields agree with source; entries add, reorder and delete', async () => {
    test.setTimeout(240_000);
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      const { folder } = await createFromPicker(page, /Astro Feed/);
      const config = () => JSON.parse(readFileSync(join(folder, 'src/config.json'), 'utf8'));
      await expect.poll(() => existsSync(join(folder, 'src/config.json'))).toBe(true);
      await openBuilder(page);

      // Site settings opens config.json as a form.
      await page.getByRole('button', { name: 'Site settings' }).click({ timeout: 30_000 });
      const form = page.getByRole('button', { name: 'Form', exact: true });
      if (await form.isVisible().catch(() => false)) await form.click();
      const workshop = page.getByTestId('pane-body-workshop');
      const name = workshop.getByLabel('Name', { exact: true });
      await expect(name).toBeVisible({ timeout: 30_000 });
      await name.fill('Playwright Person');
      const color = workshop.locator('input[type="color"]');
      await expect(color).toHaveValue('#d96c3f');
      await color.fill('#3366ff');
      await workshop.getByLabel('Avatar', { exact: true }).fill('/images/me.png');
      await expect
        .poll(() => config(), { timeout: 30_000 })
        .toMatchObject({ name: 'Playwright Person', accent: '#3366ff', avatar: '/images/me.png' });
      // The colour's text twin shows the value a person can read.
      await expect(workshop.getByText('#3366ff', { exact: true })).toBeVisible();

      await enableAdvancedMode(page);
      // Source ↔ Form agree.
      await page.getByRole('button', { name: 'Source', exact: true }).click();
      await expect(page.locator('.monaco-editor').first()).toContainText('#3366ff');
      await page.getByRole('button', { name: 'Form', exact: true }).click();
      await expect(workshop.locator('input[type="color"]')).toHaveValue('#3366ff');
      await expect(workshop.getByLabel('Avatar', { exact: true })).toHaveValue('/images/me.png');

      // Repeated entries: two posts, reordered by their date, one deleted.
      const post = (slug: string) => join(folder, 'src/pages/p', `${slug}.md`);
      for (const title of ['First light', 'Second light']) {
        await openBuilder(page);
        await page
          .getByRole('button', { name: /new post/i })
          .first()
          .click();
        await page.getByPlaceholder('Post title').fill(title);
        await page.getByRole('button', { name: 'Create', exact: true }).click();
        await expect.poll(() => existsSync(post(title.toLowerCase().replace(' ', '-')))).toBe(true);
      }
      await openBuilder(page);
      const posts = page.locator('section', {
        has: page.getByRole('heading', { name: /^Posts · / }),
      });
      const order = () =>
        posts
          .locator('li')
          .evaluateAll((items) =>
            items.map((li) => li.querySelector('button span > span')?.textContent?.trim() ?? ''),
          );
      await expect
        .poll(() => order())
        .toEqual(expect.arrayContaining(['First light', 'Second light']));
      // Newest first: pushing First light back in time moves it behind Second light.
      const first = readFileSync(post('first-light'), 'utf8').replace(
        /^date: .*$/m,
        'date: 2020-01-01',
      );
      writeFileSync(post('first-light'), first);
      await expect
        .poll(
          async () => {
            const o = await order();
            return o.indexOf('Second light') < o.indexOf('First light');
          },
          { timeout: 30_000 },
        )
        .toBe(true);
      // Delete one from the Builder: asked first, then gone from the list and the disk.
      await posts
        .locator('li', { hasText: 'First light' })
        .getByTitle('Delete post')
        .click({ force: true });
      const ask = page.getByRole('dialog').filter({ hasText: /Delete "First light"/ });
      await expect(ask).toBeVisible();
      await ask.getByRole('button', { name: 'Delete' }).click();
      await expect.poll(() => existsSync(post('first-light')), { timeout: 30_000 }).toBe(false);
      await expect.poll(() => order()).not.toContain('First light');
      expect(existsSync(post('second-light'))).toBe(true);
    } finally {
      await app.close();
    }
  });

  test('WORK-06 — a punctuated title becomes a clean slug; front matter, route and image path agree', async () => {
    test.setTimeout(12 * 60_000);
    const { app, page } = await launchApp();
    try {
      page.setDefaultTimeout(60_000);
      await page.setViewportSize({ width: 1600, height: 1000 });
      await enterGarden(page);
      const { folder } = await createFromPicker(page, /Astro Blog/);
      const post = join(folder, 'content/posts/emigre-cafe-notes.md');
      await expect
        .poll(() => existsSync(join(folder, 'content/posts/hello-from-the-garden.md')), {
          timeout: 60_000,
        })
        .toBe(true);
      mkdirSync(join(folder, 'public/images'), { recursive: true });
      writeFileSync(join(folder, 'public/images/cafe.png'), PNG_DOT);

      await openBuilder(page);
      await page
        .getByRole('button', { name: /new post/i })
        .first()
        .click();
      await page.getByPlaceholder('Post title').fill('Émigré Café — notes!');
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      const monaco = page.locator('.monaco-editor').first();
      await expect(monaco).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => existsSync(post), { timeout: 30_000 }).toBe(true);
      // The slug is clean; the title keeps its punctuation, quoted for YAML.
      expect(readFileSync(post, 'utf8')).toMatch(/^title: ['"]Émigré Café — notes!['"]$/m);
      await monaco.click();
      await page.keyboard.press('ControlOrMeta+ArrowDown');
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.insertText('A picture from the café.\n\n![The café](/images/cafe.png)\n');
      await page.keyboard.press('ControlOrMeta+s');
      await expect.poll(() => readFileSync(post, 'utf8')).toContain('/images/cafe.png');

      await page.getByRole('button', { name: 'Preview', exact: true }).click();
      const url = await waitForSitePreview(page, folder);
      expect(url).toMatch(/\/posts\/emigre-cafe-notes$/);
      const { site, close } = await openSite();
      try {
        await pollStatus(url, 200);
        await site.goto(url);
        await expect(site.getByRole('heading', { name: 'Émigré Café — notes!' })).toBeVisible({
          timeout: 60_000,
        });
        const img = site.locator('article img[src="/images/cafe.png"]');
        await expect(img).toHaveCount(1);
        expect((await site.request.get(new URL('/images/cafe.png', url).toString())).status()).toBe(
          200,
        );
        // The list links to the same route.
        await site.goto(new URL('/', url).toString());
        await expect(site.getByRole('link', { name: /Émigré Café — notes!/ })).toHaveAttribute(
          'href',
          /\/posts\/emigre-cafe-notes\/?$/,
        );
      } finally {
        await close();
      }
    } finally {
      await app.close();
    }
  });

  test('WORK-04 — a syntax error names the file in the preview and the log; fixing it recovers the page', async () => {
    test.setTimeout(12 * 60_000);
    const { app, page } = await launchApp();
    try {
      page.setDefaultTimeout(60_000);
      await enterGarden(page);
      const { folder } = await createFromPicker(page, /^Empty \(Astro\)/);
      const url = await waitForSitePreview(page, folder);
      await pollBody(url, 'Hello.');
      const index = join(folder, 'src/pages/index.astro');
      const good = readFileSync(index, 'utf8');

      // A small mistake: an unfinished statement in the frontmatter.
      writeFileSync(index, good.replace("import '../styles/global.css';", 'const broken = ;'));
      await pollStatus(url, 500, 3 * 60_000);
      // The error names the file: in the preview (Vite's overlay, which the
      // dev client draws over the page) or in the dev server's log.
      const overlay = page
        .frameLocator('iframe[src^="http://127.0.0.1"]')
        .locator('vite-error-overlay');
      await expect
        .poll(
          async () => {
            const log = await page.evaluate((f) => window.electronAPI!.devserver.log(f), folder);
            const shown = await overlay.textContent({ timeout: 1000 }).catch(() => '');
            return `${shown}\n${log}`;
          },
          { timeout: 90_000, intervals: [2000] },
        )
        .toMatch(/index\.astro/);

      // Fixed: the page comes back without restarting anything.
      writeFileSync(index, good.replace('<h1>Hello.</h1>', '<h1>Fixed.</h1>'));
      await pollStatus(url, 200, 3 * 60_000);
      await pollBody(url, 'Fixed.');
    } finally {
      await app.close();
    }
  });

  test('WORK-09 — Check it: absent without a page, a real failure on a broken page, a pass once fixed', async () => {
    test.setTimeout(240_000);
    const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    try {
      await enterGarden(page);
      const id = await createCrux(page, 'Checked page');
      const folder = (await storedCrux(page, id)).projectFolder as string;
      // No index.html: the check is unavailable, and says nothing.
      await expect(page.getByTestId('preview-check')).toHaveCount(0);

      // A first page makes the Crux visual: the check's switch and button appear.
      writeFileSync(join(folder, 'index.html'), '<p>Nothing yet.</p>');
      await expect(page.getByTestId('preview-check')).toBeVisible({ timeout: 30_000 });
      // The automatic check off: the scripted model's landing page arrives
      // without its heading and nobody looks at it.
      await setAutoCheck(page, false);
      const input = page.getByPlaceholder('Send a message...');
      await input.fill('Please make a landing page');
      await input.press('Enter');
      await expect(page.getByText('Done — the landing page is ready.')).toBeVisible({
        timeout: 60_000,
      });
      await expect.poll(() => existsSync(join(folder, 'index.html'))).toBe(true);
      expect(readFileSync(join(folder, 'index.html'), 'utf8')).not.toContain('<h1>');
      await expect(page.getByTestId('turn-job')).toHaveCount(0);

      // The person's Check it on the broken page: a real failure, named in
      // the transcript, handed back for one fix turn, then re-checked.
      const checkIt = page.getByTestId('preview-check');
      await expect(checkIt).toBeVisible({ timeout: 30_000 });
      await checkIt.click();
      const card = page.getByTestId('turn-job');
      const checkMessage = page.getByTestId('check-message');
      await expect(checkMessage).toHaveCount(1, { timeout: 60_000 });
      await expect(checkMessage).toContainText('Check found: Heading missing');
      await expect(page.getByText('Fixed — added the heading.')).toBeVisible({ timeout: 60_000 });
      await expect(card).toHaveAttribute('data-check', 'passed', { timeout: 60_000 });
      await expect
        .poll(() => readFileSync(join(folder, 'index.html'), 'utf8'))
        .toContain('<h1>Welcome</h1>');
      await card.getByRole('button', { name: 'Dismiss' }).click();
      await expect(card).toHaveCount(0);

      // On the fixed page the same button passes with no follow-up.
      await checkIt.click();
      await expect(card).toHaveAttribute('data-check', 'passed', { timeout: 60_000 });
      await expect(card).toContainText('Checked ✓');
      await expect(checkMessage).toHaveCount(1);
      await expect(page.getByText('Fixed — added the heading.')).toHaveCount(1);
    } finally {
      await app.close();
    }
  });
});
