import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { startMockApi } from '../api-mock';
import { enterGarden } from '../multi-crux-helpers';
import { showPane } from '../panel-helpers';

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
});
