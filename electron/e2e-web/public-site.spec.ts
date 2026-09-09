import { test, expect } from '@playwright/test';
import { startMockApi, type MockApi } from '../e2e/api-mock';

/**
 * The public website in Chromium against the mock API (port 8124, see
 * playwright.web.config.ts). Seeds one published, discoverable crux.
 */
let api: MockApi;
const ID = '5c0ffee5-0000-4000-8000-00000000c0de';

test.beforeAll(async () => {
  api = await startMockApi({ port: 8124 });
  api.state.cruxes[ID] = {
    id: ID,
    slug: 'garden-notes',
    title: 'Garden Notes',
    description: 'A small published page',
    type: 'workspace',
    kind: 'page',
    authorId: 'author-api-1',
    visibility: 'public',
    discoverable: true,
    meta: {
      publishedAt: '2026-09-01T00:00:00.000Z',
      publishedVersion: 2,
      tags: ['notes'],
      messages: [
        { role: 'user', content: 'write me a notes page', timestamp: '2026-09-01T00:00:00.000Z' },
        {
          role: 'assistant',
          content: 'Here are your notes.',
          timestamp: '2026-09-01T00:00:01.000Z',
        },
      ],
    },
    created: '2026-09-01T00:00:00.000Z',
    updated: '2026-09-01T00:00:00.000Z',
  };
  api.state.published[ID] = [
    { path: 'index.html', mime: 'text/html', bytes: Buffer.from('<h1>Garden Notes live</h1>') },
  ];
});
test.afterAll(async () => {
  await api?.close();
});

test.describe('public site', () => {
  test('Landing: wordmark, download, Moods that stick, Explore shows what people made', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Crux Garden', level: 1 })).toBeVisible();
    await expect(page.getByTestId('download-button')).toBeVisible();
    // wearing a Mood changes the accent and survives a reload
    const accent = () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      );
    const before = await accent();
    await page
      .getByRole('group', { name: 'Moods' })
      .getByRole('button')
      .filter({ hasText: 'Terminal' })
      .click();
    await expect.poll(accent).not.toBe(before);
    const worn = await accent();
    await page.reload();
    await expect.poll(accent).toBe(worn);
    // the recent cruxes strip shows the seeded crux and links to its page
    await expect(page.getByText('Garden Notes').first()).toBeVisible();
  });

  test('Plans: Free has no domain line, Gardener does; billing return pages read right', async ({
    page,
  }) => {
    await page.goto('/plans');
    await expect(page.getByRole('heading', { name: 'Plans' })).toBeVisible();
    await expect(page.getByText(/Your own domains/)).toHaveCount(1);
    await expect(page.getByText(/Gardener/).first()).toBeVisible();
    await page.goto('/billing/success?session_id=cs_test_123');
    await expect(page.getByRole('heading', { name: 'You’re all set' })).toBeVisible();
    await page.goto('/billing/cancel');
    await expect(page.getByRole('heading', { name: 'No changes made' })).toBeVisible();
  });

  test('Explore, a public crux page and a public garden page', async ({ page }) => {
    await page.goto('/explore');
    await expect(page.getByText('Garden Notes').first()).toBeVisible();
    await page.goto('/@tester/garden-notes');
    await expect(page.getByText('Garden Notes').first()).toBeVisible({ timeout: 30_000 });
    // the served page renders (in an iframe) and the conversation is one click away
    const frame = page.frameLocator('iframe').first();
    await expect(frame.getByText('Garden Notes live')).toBeVisible({ timeout: 30_000 });
    await page.goto('/@tester');
    await expect(page.getByText('tester').first()).toBeVisible();
    await expect(page.getByText('Garden Notes').first()).toBeVisible();
  });
});
