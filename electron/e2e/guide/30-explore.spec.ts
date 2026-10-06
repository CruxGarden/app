import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import type { DownloadItem, Event } from 'electron';
import { launchApp } from '../launch';
import { startMockApi } from '../api-mock';
import { enterGarden, createCrux } from '../multi-crux-helpers';
import { showPane, openPanel } from '../panel-helpers';
import { connectAccount, writeFirstFile } from '../journeys/journey-helpers';

/**
 * V1-TESTING-GUIDE § 30 · Explore — opening a result and coming back.
 * Search, filters and installs are in explore.spec.ts, tool-install and
 * mood-publish.
 */
function seed(api: Awaited<ReturnType<typeof startMockApi>>) {
  const mk = (id: string, title: string, tags: string[]) => ({
    id,
    slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    title,
    kind: 'page',
    visibility: 'public',
    discoverable: true,
    meta: { tags, publishedAt: '2026-09-02T00:00:00.000Z' },
    authorId: 'author-1',
    author_username: 'tester',
    created: '2026-09-01T00:00:00.000Z',
    updated: '2026-09-02T00:00:00.000Z',
  });
  api.state.cruxes['11111111-1111-4111-8111-111111111111'] = mk(
    '11111111-1111-4111-8111-111111111111',
    'Rainy Garden Notes',
    ['ambient', 'rain'],
  );
  api.state.cruxes['22222222-2222-4222-8222-222222222222'] = mk(
    '22222222-2222-4222-8222-222222222222',
    'Sunny Recipes',
    ['food'],
  );
}

test.describe('guide 30 · Explore', () => {
  test('EXPLORE-02 — a result opens the right author and Crux; the search is still there on return', async () => {
    const api = await startMockApi();
    seed(api);
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
      const explore = await showPane(page, 'Explore');
      await expect(explore.getByRole('link', { name: 'Rainy Garden Notes' })).toBeVisible();
      const box = explore.getByPlaceholder(/moods and authors/);
      await box.fill('rainy');
      await expect(explore.getByRole('link', { name: 'Sunny Recipes' })).toHaveCount(0);
      const result = explore.getByRole('link', { name: 'Rainy Garden Notes' });
      await result.focus();
      await page.keyboard.press('Enter');
      // The public page of that author's Crux.
      await expect(page).toHaveURL(/\/tester\/rainy-garden-notes/);
      await expect(page.getByText('Rainy Garden Notes').first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('/tester', { exact: false }).first()).toBeVisible();
      await page.goBack();
      // Back in the garden, Explore still shows the search that was made.
      await expect(page.getByTestId('pane-body-home')).toBeVisible({ timeout: 30_000 });
      const again = page.getByTestId('pane-body-explore');
      await expect(again).toBeVisible();
      await expect(again.getByPlaceholder(/moods and authors/)).toHaveValue('rainy');
      await expect(again.getByRole('link', { name: 'Rainy Garden Notes' })).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test('EXPLORE-01 — kind filters press and narrow, a query with no matches says so, clearing restores the list', async () => {
    const api = await startMockApi();
    seed(api);
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
      const explore = await showPane(page, 'Explore');
      await expect(explore.getByRole('link', { name: 'Rainy Garden Notes' })).toBeVisible();
      await explore.getByRole('tab', { name: 'Cruxes' }).click();
      await explore.getByRole('button', { name: 'Notes', exact: true }).click();
      await expect(explore.getByRole('button', { name: 'Notes', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(explore.getByRole('link', { name: 'Rainy Garden Notes' })).toHaveCount(0);
      await expect(explore.getByText('No results match your search')).toBeVisible();
      await explore.getByRole('button', { name: 'Pages', exact: true }).click();
      await expect(explore.getByRole('link', { name: 'Rainy Garden Notes' })).toBeVisible();
      const box = explore.getByPlaceholder(/moods and authors/);
      await box.fill('zebra crossing');
      await expect(explore.getByText('No results match your search')).toBeVisible();
      await box.fill('');
      await explore.getByRole('button', { name: 'Everything', exact: true }).click();
      await expect(explore.getByRole('link', { name: 'Rainy Garden Notes' })).toBeVisible();
      await expect(explore.getByRole('link', { name: 'Sunny Recipes' })).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test('EXPLORE-T1 — tags are the way in: shown on arrival, one click filters, chips clear; People, Tools and Moods are tabs', async () => {
    const api = await startMockApi();
    seed(api);
    api.state.cruxes['33333333-3333-4333-8333-333333333333'] = {
      ...api.state.cruxes['11111111-1111-4111-8111-111111111111']!,
      id: '33333333-3333-4333-8333-333333333333',
      slug: 'evening-mood',
      title: 'Evening Mood',
      kind: 'mood',
      meta: { tags: ['ambient'], publishedAt: '2026-09-02T00:00:00.000Z' },
    };
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
      const explore = await showPane(page, 'Explore');
      // Tags on arrival, most used first.
      const tags = explore.getByTestId('explore-tags');
      await expect(tags).toBeVisible();
      await expect(tags.getByRole('button', { name: /^#ambient/ })).toBeVisible();
      await expect(tags.getByRole('button').first()).toHaveText(/#ambient/);
      // One click filters; the chip says so and clears it.
      await tags.getByRole('button', { name: /^#rain/ }).click();
      await expect(explore.getByRole('link', { name: 'Sunny Recipes' })).toHaveCount(0);
      await expect(explore.getByRole('link', { name: 'Rainy Garden Notes' })).toBeVisible();
      await explore.getByRole('button', { name: 'Remove tag filter rain' }).click();
      await expect(explore.getByRole('link', { name: 'Sunny Recipes' })).toBeVisible();
      // All shows Moods as their own group; the Moods tab shows only them.
      await expect(explore.getByRole('region', { name: 'Moods' })).toContainText('Evening Mood');
      await explore.getByRole('tab', { name: 'Moods' }).click();
      await expect(explore.getByText('Evening Mood')).toBeVisible();
      await expect(explore.getByRole('link', { name: 'Sunny Recipes' })).toHaveCount(0);
      // People: a search finds the author.
      await explore.getByRole('tab', { name: 'People' }).click();
      await explore.getByLabel('Search Explore').fill('tester');
      await expect(explore.getByText('@tester')).toBeVisible({ timeout: 30_000 });
      // A tag on a card is a filter too.
      await explore.getByRole('tab', { name: 'All' }).click();
      await explore.getByLabel('Search Explore').fill('');
      await explore
        .getByLabel('Topics in Sunny Recipes')
        .getByRole('button', { name: '#food' })
        .click();
      await expect(explore.getByRole('button', { name: 'Remove tag filter food' })).toBeVisible();
      await expect(explore.getByRole('link', { name: 'Rainy Garden Notes' })).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

  test('EXPLORE-06 — a Mood installed from Explore is the advertised one: it wears with its colours and exports as a package', async () => {
    test.setTimeout(180_000);
    const api = await startMockApi();
    const { app, page, dir } = await launchApp({ env: { CRUX_API_URL: api.url } });
    const cssVar = (name: string) =>
      page.evaluate(
        (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
        name,
      );
    try {
      await enterGarden(page);
      // A published Crux first: that is what connects the account and opens publishing.
      await createCrux(page, 'Carrier');
      await writeFirstFile(page, 'index.html', '<h1>Hi</h1>');
      const share = await openPanel(page, 'publish', 'Toggle share');
      await share.getByRole('button', { name: 'Share', exact: true }).click({ timeout: 60_000 });
      await connectAccount(page);
      const ask = page.getByRole('dialog').filter({ hasText: 'A published site is not a backup' });
      await expect(ask).toBeVisible({ timeout: 30_000 });
      await ask.getByRole('button', { name: 'Share without a backup' }).click();
      await expect(page.getByText('Up to date')).toBeVisible({ timeout: 30_000 });
      // A look of one's own, saved and published as a Mood.
      const mood = await showPane(page, 'Mood');
      await mood.getByRole('button', { name: 'Theme', exact: true }).click();
      await mood.getByLabel('Find a token').fill('accent');
      await mood.getByLabel('Accent color').first().fill('#ff8800');
      await expect.poll(() => cssVar('--accent')).toMatch(/#ff8800|255, 136, 0/i);
      await mood.getByRole('button', { name: 'Moods', exact: true }).click();
      await mood.getByRole('button', { name: 'Save current as Mood' }).click();
      await mood.getByRole('textbox', { name: 'Mood name' }).fill('Sea Glass');
      await mood.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(mood.getByRole('status').filter({ hasText: 'Saved "Sea Glass"' })).toBeVisible();
      await mood.getByRole('button', { name: 'Share Sea Glass' }).click();
      await expect(mood.getByRole('status').filter({ hasText: 'Shared "Sea Glass"' })).toBeVisible({
        timeout: 60_000,
      });
      const moodCrux = Object.values(api.state.cruxes).find((c) => c.kind === 'mood')!;
      // Wear a bundled Mood and drop the local copy, so what comes back is the installed one.
      await page
        .getByTestId('bundled-moods')
        .getByTestId('bundled-digital-fractal-garden')
        .getByRole('button', { name: 'Apply' })
        .click();
      await expect.poll(() => cssVar('--accent')).not.toMatch(/#ff8800|255, 136, 0/i);
      await mood.getByRole('button', { name: 'Delete Mood Sea Glass', exact: true }).click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Delete locally', exact: true })
        .click();
      await expect(mood.getByRole('button', { name: 'Apply Sea Glass', exact: true })).toHaveCount(
        0,
      );
      // Explore → Moods → Install.
      const explore = await showPane(page, 'Explore');
      await explore.getByRole('tab', { name: 'Moods', exact: true }).click();
      const card = page.getByTestId(`explore-mood-${moodCrux.id as string}`);
      await expect(card).toBeVisible({ timeout: 30_000 });
      await card.getByRole('button', { name: 'Install', exact: true }).click();
      await expect(card).toContainText('Installed', { timeout: 30_000 });
      // Wear it: the advertised colours arrive from the installed package.
      const apply = mood.getByRole('button', { name: 'Apply Sea Glass', exact: true });
      await expect(apply).toBeVisible({ timeout: 30_000 });
      await apply.click();
      await expect(apply).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => cssVar('--accent')).toMatch(/#ff8800|255, 136, 0/i);
      // Export: a whole .cruxmood package, from local content.
      const archive = join(dir, 'sea-glass.cruxmood');
      await app.evaluate(({ session }, destination) => {
        const listener = (_event: Event, item: DownloadItem) => {
          if (!item.getFilename().endsWith('.cruxmood')) return;
          session.defaultSession.removeListener('will-download', listener);
          item.setSavePath(destination);
        };
        session.defaultSession.on('will-download', listener);
      }, archive);
      await mood.getByRole('button', { name: 'Export Sea Glass', exact: true }).click();
      await expect.poll(() => existsSync(archive), { timeout: 30_000 }).toBe(true);
      await expect
        .poll(async () => {
          try {
            const zip = await JSZip.loadAsync(readFileSync(archive));
            const pkg = JSON.parse(await zip.file('package.json')!.async('text')) as {
              name: string;
            };
            return pkg.name;
          } catch {
            return null;
          }
        })
        .toBe('Sea Glass');
    } finally {
      await app.close();
      await api.close();
    }
  });
});
