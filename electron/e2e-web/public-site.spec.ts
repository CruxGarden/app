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
  test('launch signup validates email and remembers the return without sending mail', async ({
    page,
  }) => {
    const submissions: URLSearchParams[] = [];
    await page.route('https://tech.us13.list-manage.com/**', async (route) => {
      submissions.push(new URLSearchParams(route.request().postData() ?? ''));
      await route.fulfill({
        status: 302,
        headers: { location: 'http://127.0.0.1:8123/subscribed' },
      });
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Crux Garden', exact: true })).toBeVisible();
    const email = page.getByRole('textbox', { name: 'Email address' });
    await email.fill('invalid');
    await page.getByRole('button', { name: 'Notify me' }).click();
    expect(await email.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(false);
    expect(submissions).toHaveLength(0);
    await email.fill('reader@example.invalid');
    await page.getByRole('button', { name: 'Notify me' }).click();
    await expect(page.getByRole('status')).toHaveText('Thank you, we will notify you at launch');
    expect(submissions).toHaveLength(1);
    expect(submissions[0].get('EMAIL')).toBe('reader@example.invalid');
    await page.goto('/');
    await expect(page.getByRole('status')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Notify me' })).toHaveCount(0);
  });

  test('direct subscription return is remembered on a fresh visit', async ({ page }) => {
    await page.goto('/subscribed');
    await expect(page.getByRole('status')).toHaveText('Thank you, we will notify you at launch');
    await page.goto('/');
    await expect(page.getByRole('status')).toBeVisible();
  });

  test('launch signup remains usable on a phone with reduced motion', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('textbox', { name: 'Email address' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Notify me' })).toBeInViewport();
  });

  test('Plans: Free has no domain line, Gardener does; billing return pages read right', async ({
    page,
  }) => {
    await page.goto('/plans');
    await expect(page.getByRole('heading', { name: 'Plans' })).toBeVisible();
    await expect(page.getByTestId('plans-free').getByText(/Your own domains/)).toHaveCount(0);
    await expect(page.getByTestId('plans-gardener').getByText(/Your own domains/)).toBeVisible();
    await expect(
      page.getByTestId('plans-gardener_plus').getByText(/Your own domains/),
    ).toBeVisible();
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
