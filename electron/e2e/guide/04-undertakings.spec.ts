import { test, expect, type Page } from '@playwright/test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { launchApp } from '../launch';
import { enterGarden, storedCrux } from '../multi-crux-helpers';
import { togglePanel } from '../panel-helpers';
import { openBuilder } from '../builder-helpers';
import { waitForSitePreview, openSite, pollBody, painted, replaceEditor } from './site-helpers';

/**
 * V1-TESTING-GUIDE § 04 · Undertakings — the rendered deliverable of each
 * worked example, after the edit the guide asks for. undertakings.spec.ts
 * covers the shared frame (a new Garden, the example as its child, the
 * notebook, Walkthrough, export/import); UND-02/05 render there; UND-07 needs a
 * real model; UND-08/09 are undertakings.spec.ts; UND-10 is
 * jobs/publish-undertakings.spec.ts (opt-in) and a visitor's browser by hand.
 */
async function startUndertaking(page: Page, id: string, name: string) {
  await page.getByRole('button', { name: 'Explore undertakings', exact: true }).click();
  await page.locator(`[data-undertaking-id="${id}"]`).click();
  await page.getByRole('button', { name: 'Start undertaking', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Add Crux', exact: true })).toBeHidden({
    timeout: 180_000,
  });
  await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(name);
}

async function gardenHome(page: Page) {
  if (/\/c\//.test(page.url())) {
    await page.getByRole('button', { name: 'Garden location', exact: true }).click();
    await page
      .getByRole('navigation', { name: 'Garden ancestry' })
      .getByRole('button')
      .last()
      .click();
  }
  await expect(page.getByRole('button', { name: 'Add Crux', exact: true })).toBeVisible();
}

async function openMember(page: Page, title: string) {
  await gardenHome(page);
  await page
    .getByRole('main')
    .getByRole('button', { name: `Open ${title}`, exact: true })
    .click();
  await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60_000 });
  const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
  const folder = (await storedCrux(page, id)).projectFolder as string;
  return { id, folder };
}

/** Every file under a folder (skipping build machinery). */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.astro') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

test.describe('guide 04 · Undertakings', () => {
  test('UND-01 — a home page: the name and tagline from Site settings are on the real page; notebook and example stay distinct', async () => {
    test.setTimeout(15 * 60_000);
    const { app, page } = await launchApp();
    try {
      page.setDefaultTimeout(60_000);
      await page.setViewportSize({ width: 1600, height: 1000 });
      await enterGarden(page);
      await startUndertaking(page, 'home-page', 'Make a home page');
      // The three things stay apart: the notebook, the page, the example's Garden.
      const main = page.getByRole('main');
      await expect(
        main.getByRole('button', { name: 'Open Planning notebook', exact: true }),
      ).toBeVisible();
      await expect(main.getByRole('button', { name: 'Open Home page', exact: true })).toBeVisible();
      await expect(main.getByRole('button', { name: /worked example/ })).toBeVisible();

      const { folder } = await openMember(page, 'Home page');
      await openBuilder(page);
      await page.getByRole('button', { name: /Site settings/ }).click();
      const form = page.getByRole('button', { name: 'Form', exact: true });
      if (await form.isVisible().catch(() => false)) await form.click();
      await page.getByLabel('Your Name', { exact: true }).fill('Made by me');
      await page.getByLabel('Tagline', { exact: true }).fill('Gardener at large');
      await page.keyboard.press('ControlOrMeta+S');
      await expect
        .poll(() => JSON.parse(readFileSync(join(folder, 'src/config.json'), 'utf8')), {
          timeout: 30_000,
        })
        .toMatchObject({ name: 'Made by me', tagline: 'Gardener at large' });

      // The real page updates.
      await page
        .getByRole('button', { name: 'Preview', exact: true })
        .click()
        .catch(() => {});
      const url = await waitForSitePreview(page, folder);
      const home = new URL('/', url).toString();
      await pollBody(home, 'Made by me', 3 * 60_000);
      const { site, close } = await openSite();
      try {
        await site.goto(home);
        await expect(site.getByRole('heading', { name: 'Made by me', level: 1 })).toBeVisible({
          timeout: 60_000,
        });
        await expect(site.getByText('Gardener at large').first()).toBeVisible();
      } finally {
        await close();
      }
      // The notebook was not touched by the site edit.
      await gardenHome(page);
      const { folder: notebook } = await openMember(page, 'Planning notebook');
      expect(existsSync(join(notebook, 'notebook/Start here.md'))).toBe(true);
      expect(readFileSync(join(notebook, 'notebook/Start here.md'), 'utf8')).not.toContain(
        'Made by me',
      );
    } finally {
      await app.close();
    }
  });

  test('UND-03 — a short book: the edited first page persists, only the chosen notes go into the EPUB', async () => {
    test.setTimeout(20 * 60_000);
    const { app, page } = await launchApp();
    try {
      page.setDefaultTimeout(60_000);
      await page.setViewportSize({ width: 1600, height: 1050 });
      await enterGarden(page);
      await startUndertaking(page, 'short-book', 'Write a short book');
      const { folder } = await openMember(page, 'Manuscript');
      const frame = page.frameLocator('iframe[data-crux-id]');
      const field = frame.getByLabel('Note title', { exact: true });
      await expect(field).toBeVisible({ timeout: 120_000 });
      if ((await field.inputValue()) !== 'The first page') {
        const show = frame.getByRole('button', { name: 'Show left sidebar', exact: true });
        if (await show.isVisible()) await show.click();
        await frame.getByRole('button', { name: 'The first page', exact: true }).first().click();
        await expect(field).toHaveValue('The first page');
      }
      await frame.locator('.tiptap').first().click();
      await page.keyboard.press('ControlOrMeta+End');
      await page.keyboard.press('Enter');
      await page.keyboard.insertText('A sentence of my own, on the first page.');
      await expect
        .poll(() => readFileSync(join(folder, 'notebook/The first page.md'), 'utf8'), {
          timeout: 30_000,
        })
        .toContain('A sentence of my own, on the first page.');

      // The public notes: the book is an EPUB of exactly the ticked pages.
      await togglePanel(page, 'Toggle details');
      const format = page.getByLabel('Book edition', { exact: true });
      await expect(format).toBeVisible({ timeout: 30_000 });
      await format.selectOption('epub');
      await togglePanel(page, 'Toggle details');
      await frame.getByRole('button', { name: 'Public edition…' }).click();
      const boxes = frame.locator('#garden-publication input[type=checkbox][data-note]');
      await expect(boxes.first()).toBeVisible({ timeout: 60_000 });
      const notes = await boxes.evaluateAll((els) => els.map((e) => e.getAttribute('data-note')!));
      const chosen = notes.filter((n) => n !== 'The first page.md').slice(0, 1);
      const left = notes.find((n) => n !== 'The first page.md' && !chosen.includes(n));
      for (const note of notes) {
        const box = frame.locator(`#garden-publication input[data-note="${note}"]`);
        const want = note === 'The first page.md' || chosen.includes(note);
        if ((await box.isChecked()) !== want) await box.click();
      }
      const publication = () =>
        JSON.parse(readFileSync(join(folder, 'notebook/publish.json'), 'utf8'));
      await expect
        .poll(() => publication().pages, { timeout: 30_000 })
        .toEqual(expect.arrayContaining(['The first page.md', ...chosen]));
      if (left) expect(publication().pages).not.toContain(left);
      await frame.getByRole('button', { name: 'Public edition…' }).click();

      await frame.getByRole('button', { name: 'Save book (EPUB)', exact: true }).click();
      const findEpub = () => walk(folder).find((p) => p.endsWith('.epub'));
      await expect.poll(findEpub, { timeout: 9 * 60_000 }).toBeTruthy();
      const bytes = readFileSync(findEpub()!);
      const epub = await JSZip.loadAsync(bytes);
      expect(await epub.file('mimetype')!.async('text')).toBe('application/epub+zip');
      const text = (
        await Promise.all(
          Object.keys(epub.files)
            .filter((f) => /\.(x?html|htm)$/.test(f))
            .map((f) => epub.file(f)!.async('text')),
        )
      ).join('\n');
      expect(text).toContain('A sentence of my own, on the first page.');
      if (left) {
        const leftBody = readFileSync(join(folder, 'notebook', left), 'utf8')
          .split('\n')
          .map((l) => l.replace(/^#+\s*/, '').trim())
          .find((l) => l.length > 20 && !l.startsWith('[') && !l.startsWith('!'));
        if (leftBody) expect(text).not.toContain(leftBody);
      }
    } finally {
      await app.close();
    }
  });

  test('UND-04 — a small business: the new name and offer are on the home page, and the FAQ page has its sections', async () => {
    test.setTimeout(20 * 60_000);
    const { app, page } = await launchApp();
    try {
      page.setDefaultTimeout(60_000);
      await page.setViewportSize({ width: 1600, height: 1000 });
      await enterGarden(page);
      await startUndertaking(page, 'small-business', 'Launch a small business');
      const { folder } = await openMember(page, 'Business site');
      await openBuilder(page);
      await page.getByRole('button', { name: /Site settings/ }).click();
      const form = page.getByRole('button', { name: 'Form', exact: true });
      if (await form.isVisible().catch(() => false)) await form.click();
      await page.getByLabel('Business name', { exact: true }).fill('Harbour Joinery');
      await page
        .getByLabel('One line', { exact: true })
        .fill('Fitted kitchens, measured and made.');
      await page.keyboard.press('ControlOrMeta+S');
      await expect
        .poll(() => JSON.parse(readFileSync(join(folder, 'src/config.json'), 'utf8')), {
          timeout: 30_000,
        })
        .toMatchObject({
          name: 'Harbour Joinery',
          description: 'Fitted kitchens, measured and made.',
        });

      await page
        .getByRole('button', { name: 'Preview', exact: true })
        .click()
        .catch(() => {});
      const url = await waitForSitePreview(page, folder);
      const home = new URL('/', url).toString();
      await pollBody(home, 'Harbour Joinery', 3 * 60_000);
      const faq = JSON.parse(
        readFileSync(join(folder, 'src/data/json-files/faqData.json'), 'utf8'),
      ) as { question: string; category: string }[];
      const { site, close } = await openSite();
      try {
        await site.goto(home);
        await painted(site, 'Harbour Joinery');
        await painted(site, 'Fitted kitchens, measured and made.');
        await site.goto(new URL('/faq/', url).toString());
        // Every FAQ category is a visible section with its questions.
        for (const category of new Set(faq.map((f) => f.category))) {
          const first = faq.find((f) => f.category === category)!;
          await painted(site, first.question);
        }
        expect(await site.locator('h2, h3').count()).toBeGreaterThanOrEqual(
          new Set(faq.map((f) => f.category)).size,
        );
      } finally {
        await close();
      }
    } finally {
      await app.close();
    }
  });

  test('UND-06 — a family history: the edited story is on its route and the other sample posts remain', async () => {
    test.setTimeout(20 * 60_000);
    const { app, page } = await launchApp();
    try {
      page.setDefaultTimeout(60_000);
      await page.setViewportSize({ width: 1600, height: 1000 });
      await enterGarden(page);
      await startUndertaking(page, 'family-history', 'Tell a family history');
      const { folder } = await openMember(page, 'Family journal');
      const posts = join(folder, 'content/posts');
      const before = readdirSync(posts).filter((f) => f.endsWith('.md'));
      expect(before.length).toBeGreaterThanOrEqual(1);
      // Everything else under content/ (notes, other posts) must survive as it is.
      const path = join(posts, 'hello-from-the-garden.md');
      const others = () =>
        Object.fromEntries(
          walk(join(folder, 'content'))
            .filter((p) => p !== path)
            .map((p) => [p, readFileSync(p, 'utf8')]),
        );
      const untouched = others();
      expect(Object.keys(untouched).length).toBeGreaterThanOrEqual(1);
      await openBuilder(page);
      await page
        .getByRole('button', { name: /A place I remember/ })
        .first()
        .click();
      const source = readFileSync(path, 'utf8');
      await replaceEditor(
        page,
        source
          .replace('A place I remember', 'A memory of my own')
          .replace(/\n---\n([\s\S]*)$/, '\n---\n$1\nThe kitchen smelled of bread on Sundays.\n'),
      );
      await expect.poll(() => readFileSync(path, 'utf8')).toContain('A memory of my own');
      expect(readFileSync(path, 'utf8')).toContain('The kitchen smelled of bread on Sundays.');
      // Nothing else was replaced.
      expect(
        readdirSync(posts)
          .filter((f) => f.endsWith('.md'))
          .sort(),
      ).toEqual(before.sort());
      expect(others()).toEqual(untouched);

      await page.getByRole('button', { name: 'Preview', exact: true }).click();
      const url = await waitForSitePreview(page, folder);
      expect(url).toMatch(/\/posts\/hello-from-the-garden$/);
      const { site, close } = await openSite();
      try {
        await pollBody(url, 'A memory of my own', 3 * 60_000);
        await site.goto(url);
        await expect(site.getByRole('heading', { name: 'A memory of my own' })).toBeVisible({
          timeout: 60_000,
        });
        await expect(site.locator('article')).toContainText(
          'The kitchen smelled of bread on Sundays.',
        );
        await site.goto(new URL('/posts/', url).toString());
        await expect(site.getByRole('link', { name: /A memory of my own/ }).first()).toBeVisible();
        expect(await site.locator('a[href^="/posts/"]').count()).toBeGreaterThanOrEqual(
          before.length,
        );
      } finally {
        await close();
      }
    } finally {
      await app.close();
    }
  });
});
