import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden } from './multi-crux-helpers';
import { showPane } from './panel-helpers';

/**
 * Screenshots of Explore with a seeded catalogue, for the UI pass. Not an
 * assertion of behaviour. Output: e2e/.results/polish/explore-*.png
 */
test('explore: arrival, a tag, a search, the Moods tab', async () => {
  const api = await startMockApi();
  const mk = (id: string, title: string, kind: string, tags: string[], description: string) => ({
    id,
    slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    title,
    description,
    kind,
    visibility: 'public',
    discoverable: true,
    meta: { tags, publishedAt: '2026-09-02T00:00:00.000Z' },
    authorId: 'author-1',
    author_username: 'tester',
    created: '2026-09-01T00:00:00.000Z',
    updated: '2026-09-02T00:00:00.000Z',
  });
  const seed = [
    [
      'Rainy Garden Notes',
      'notes',
      ['ambient', 'rain', 'journal'],
      'Field notes from a wet month.',
    ],
    ['Sunny Recipes', 'page', ['food', 'summer'], 'Six things to cook when it is too hot to cook.'],
    [
      'Moss Atlas',
      'webapp',
      ['plants', 'maps', 'ambient'],
      'Every moss on the north wall, mapped.',
    ],
    ['Pocket Synth', 'webapp', ['music', 'toys'], 'A two-octave synth for the browser.'],
    ['Evening Mood', 'mood', ['ambient', 'dusk'], 'Amber light, slow waves.'],
    ['Paper Mood', 'mood', ['light', 'reading'], 'Warm white, black ink.'],
    ['Sketch (p5)', 'tool', ['drawing', 'code'], 'p5.js sketches with a live canvas.'],
    ['Notation', 'tool', ['music', 'abc'], 'ABC notation with playback.'],
  ] as const;
  seed.forEach(([title, kind, tags, description], i) => {
    const id = `${i + 1}`.padStart(8, '0') + '-0000-4000-8000-000000000000';
    api.state.cruxes[id] = mk(id, title, kind, [...tags], description);
  });
  const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await enterGarden(page);
    const explore = await showPane(page, 'Explore');
    await expect(explore.getByRole('link', { name: 'Moss Atlas' })).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'e2e/.results/polish/explore-1-arrival.png' });
    await explore
      .getByTestId('explore-tags')
      .getByRole('button', { name: /^#ambient/ })
      .click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'e2e/.results/polish/explore-2-tag.png' });
    await explore.getByRole('button', { name: 'Remove tag filter ambient' }).click();
    await explore.getByLabel('Search Explore').fill('mo');
    await page.waitForTimeout(900);
    await page.screenshot({ path: 'e2e/.results/polish/explore-3-search.png' });
    await explore.getByLabel('Search Explore').fill('');
    await explore.getByRole('tab', { name: 'Moods' }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'e2e/.results/polish/explore-4-moods.png' });
  } finally {
    await app.close();
  }
});
