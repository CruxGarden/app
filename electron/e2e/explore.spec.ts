import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';

/**
 * Explore: search, the author chip on a result narrows to that author, the
 * active-filter chip removes it, "@name" in the box searches authors.
 */
test.describe('explore (mocked API)', () => {
  test('search → author chip → clear; @name search', async () => {
    const api = await startMockApi();
    const { app, page } = await launchApp({
      env: { CRUX_API_URL: api.url, CRUX_AI_MOCK: '1' },
    });
    try {
      // Two discoverable cruxes exist server-side without publishing from the UI
      const mk = (id: string, title: string, tags: string[]) => ({
        id,
        slug: title.toLowerCase().replace(/\s+/g, '-'),
        title,
        kind: 'page',
        visibility: 'public',
        discoverable: true,
        meta: { tags },
        authorId: 'author-1',
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

      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await page.getByRole('button', { name: 'Explore', exact: true }).click();
      await expect(page.getByText('Rainy Garden Notes')).toBeVisible();
      await expect(page.getByText('Sunny Recipes')).toBeVisible();

      // Search narrows and shows Best match
      const box = page.getByPlaceholder(/moods and authors/);
      await box.fill('rainy');
      await expect(page.getByText('Sunny Recipes')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Best match' })).toBeVisible();
      await box.fill('');
      await expect(page.getByText('Sunny Recipes')).toBeVisible();

      // Author chip on a card → active filter → remove
      await page.getByRole('button', { name: 'Only cruxes by tester' }).first().click();
      const filters = page.getByTestId('active-filters');
      await expect(filters).toContainText('@tester');
      expect(api.log.some((l) => l.includes('author=tester'))).toBe(true);
      await filters.getByRole('button', { name: 'Remove author filter tester' }).click();
      await expect(page.getByTestId('active-filters')).toHaveCount(0);

      // Tag chip on a card filters by tag
      await page.getByRole('button', { name: '#rain' }).first().click();
      await expect(page.getByTestId('active-filters')).toContainText('#rain');
      await expect(page.getByText('Sunny Recipes')).toHaveCount(0);
      await page.getByRole('button', { name: 'Remove tag filter rain' }).click();

      // "@nobody" finds nothing; "@tes" prefix finds both
      await box.fill('@nobody');
      await expect(page.getByText(/No results/)).toBeVisible();
      await box.fill('@tes');
      await expect(page.getByText('Rainy Garden Notes')).toBeVisible();
      await page.screenshot({ path: 'e2e/.results/explore-1.png' });
    } finally {
      await app.close();
      await api.close();
    }
  });
});
