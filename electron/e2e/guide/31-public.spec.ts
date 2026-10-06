import { test, expect, type Page } from '@playwright/test';
import { launchApp } from '../launch';
import { startMockApi } from '../api-mock';
import { enterGarden } from '../multi-crux-helpers';
import { showPane } from '../panel-helpers';

/**
 * V1-TESTING-GUIDE § 31 · Public garden and public Crux — as the app renders
 * them against the API (the same pages the website serves at crux.garden):
 * the author page, a Crux page, the metadata that says how it was made, and
 * the not-found pages. The production website itself is manual.
 */
const ID = '11111111-1111-4111-8111-111111111111';

function seed(api: Awaited<ReturnType<typeof startMockApi>>) {
  api.state.cruxes[ID] = {
    id: ID,
    slug: 'rainy-garden-notes',
    title: 'Rainy Garden Notes',
    kind: 'page',
    visibility: 'public',
    discoverable: true,
    meta: {
      tags: ['ambient', 'rain'],
      publishedAt: '2026-09-02T00:00:00.000Z',
      summary: 'A page of notes written while it rained.',
      settings: { model: 'claude-sonnet-5' },
      messages: [
        { role: 'user', content: 'Make me a page about rain.', timestamp: '2026-09-01T00:00:00Z' },
        {
          role: 'assistant',
          content: 'Done — a rainy page.',
          model: 'claude-sonnet-5',
          timestamp: '2026-09-01T00:00:01Z',
        },
      ],
    },
    authorId: 'author-api-1',
    author_username: 'tester',
    created: '2026-09-01T00:00:00.000Z',
    updated: '2026-09-02T00:00:00.000Z',
  };
  api.state.published[ID] = [
    {
      path: 'index.html',
      mime: 'text/html',
      bytes: Buffer.from('<!doctype html><h1 id="rain">Rain on the glass</h1>'),
    },
  ];
}

/** Route the in-app router without reloading the shell. */
async function visit(page: Page, path: string) {
  await page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

test.describe('guide 31 · Public garden and public Crux', () => {
  test('PUBLIC-01 — a Crux page, its author link to the public garden, a card back to the Crux, and Back', async () => {
    test.setTimeout(150_000);
    const api = await startMockApi();
    seed(api);
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
      const explore = await showPane(page, 'Explore');
      const result = explore.getByRole('link', { name: 'Rainy Garden Notes' });
      await result.focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/tester\/rainy-garden-notes/);
      const crumbs = page.locator('header');
      await expect(crumbs.getByText('Rainy Garden Notes')).toBeVisible({ timeout: 30_000 });
      // The author link leads to the public garden: one flat page of shared Cruxes.
      await crumbs.getByRole('link', { name: 'tester', exact: true }).click();
      await expect(page).toHaveURL(/\/tester$/, { timeout: 30_000 });
      await expect(page.getByRole('heading', { name: 'tester' })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('Published in Explore', { exact: false })).toBeVisible();
      // A card opens the Crux again.
      await page.getByRole('button', { name: 'Open Rainy Garden Notes', exact: true }).click();
      await expect(page).toHaveURL(/\/tester\/rainy-garden-notes/);
      await expect(page.locator('header').getByText('Rainy Garden Notes')).toBeVisible({
        timeout: 30_000,
      });
      // Back returns to the garden page.
      await page.goBack();
      await expect(page).toHaveURL(/\/tester$/);
      await expect(page.getByText('Published in Explore', { exact: false })).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      await app.close();
      await api.close();
    }
  });

  test('PUBLIC-03 — the metadata behind a public Crux names its author and collaborator and carries no credentials', async () => {
    test.setTimeout(150_000);
    const api = await startMockApi();
    seed(api);
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
      const explore = await showPane(page, 'Explore');
      await explore.getByRole('link', { name: 'Rainy Garden Notes' }).focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/tester\/rainy-garden-notes/);
      await page.getByRole('button', { name: 'Details' }).click({ timeout: 30_000 });
      // Who made it and with whom, what it is, and where its tags lead.
      await expect(page.getByText('Collaborators')).toBeVisible();
      await expect(page.getByText('Claude Sonnet 5')).toBeVisible();
      await expect(page.getByText('Author', { exact: true })).toBeVisible();
      await expect(page.getByText('tester', { exact: true }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'rain', exact: true })).toHaveAttribute(
        'href',
        /\/explore\?tag=rain/,
      );
      await expect(page.getByText('Kind', { exact: true })).toBeVisible();
      // The record is readable, not editable, and holds nothing secret.
      await expect(page.getByRole('textbox')).toHaveCount(0);
      const text = await page.locator('body').innerText();
      expect(text).not.toMatch(/sk-ant-|Bearer |token/i);
      // Off again.
      await page.getByRole('button', { name: 'Details' }).click();
      await expect(page.getByText('Collaborators')).toHaveCount(0);
    } finally {
      await app.close();
      await api.close();
    }
  });

  test('PUBLIC-05 — a missing Crux, an unknown author and a path that leads nowhere each say so and offer a way back', async () => {
    test.setTimeout(150_000);
    const api = await startMockApi();
    seed(api);
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
      // An unknown author.
      await visit(page, '/nobody');
      await expect(page.getByRole('heading', { name: 'Creator not found' })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText('There is no @nobody at this address.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Explore Home' })).toBeVisible();
      // A malformed, over-long address: every public path is an author or a Crux address,
      // so this lands on the Crux page's not-found (the 404 page is for nothing else).
      await visit(page, '/tester/no-such-crux/deep/path/that/goes/nowhere');
      await expect(page.getByText('Not found', { exact: true })).toBeVisible({ timeout: 30_000 });
      // A Crux that does not exist (or is private) under a real author.
      await visit(page, '/tester/no-such-crux');
      await expect(page.getByText('Not found', { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("This creation doesn't exist or is private")).toBeVisible();
      // Recovery is offered here too, not a dead end.
      await expect(
        page
          .getByRole('button', { name: 'Explore Home' })
          .or(page.getByRole('link', { name: 'Explore Home', exact: true })),
      ).toBeVisible();
      // The way back works.
      await visit(page, '/nobody');
      await page.getByRole('button', { name: 'Explore Home' }).click();
      await expect(page.getByRole('heading', { name: 'Explore Home', exact: true })).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      await app.close();
      await api.close();
    }
  });
});
