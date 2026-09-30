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
    await page.getByRole('button', { name: 'Notify', exact: true }).click();
    expect(await email.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(false);
    expect(submissions).toHaveLength(0);
    await email.fill('reader@example.invalid');
    await page.getByRole('button', { name: 'Notify', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Thank you, we will notify you at launch');
    expect(submissions).toHaveLength(1);
    expect(submissions[0].get('EMAIL')).toBe('reader@example.invalid');
    await page.goto('/');
    await expect(page.getByRole('status')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Notify', exact: true })).toHaveCount(0);
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
    await expect(page.getByRole('button', { name: 'Notify', exact: true })).toBeInViewport();
    await expect(
      page.getByRole('button', { name: 'Play Sagittarius A*', exact: true }),
    ).toBeInViewport();
    await page.screenshot({ path: 'e2e-web/.results/public-entry-mobile.png' });
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

test('direct Explore links load; creation loading, failure and retry stay useful', async ({
  page,
}) => {
  await page.goto('/explore');
  await expect(page.getByText('Garden Notes').first()).toBeVisible();
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/authors/tester/cruxes/garden-notes', async (route) => {
    await waiting;
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  });
  await page.getByRole('link', { name: 'Garden Notes', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Loading creation…');
  release();
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Not found', exact: true })).toHaveCount(0);
  await page.unroute('**/authors/tester/cruxes/garden-notes');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.frameLocator('iframe').first().getByText('Garden Notes live')).toBeVisible();
  await page.goto('/@nobody/missing');
  await expect(page.getByRole('heading', { name: 'Not found', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Explore', exact: true }).first().click();
  await expect(page.getByText('Garden Notes').first()).toBeVisible();
});

test('Garden outages offer retry, and Explore clears pending search', async ({ page }) => {
  await page.route('**/authors/tester', (route) => route.fulfill({ status: 500, body: '{}' }));
  await page.goto('/@tester');
  await expect(page.getByRole('heading', { name: "Couldn't reach this garden" })).toBeVisible();
  await page.unroute('**/authors/tester');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Garden Notes').first()).toBeVisible();
  await page.goto('/explore?q=old');
  const search = page.getByPlaceholder(/search/i).first();
  await search.fill('pending');
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await page.waitForTimeout(400);
  await expect(search).toHaveValue('');
  expect(new URL(page.url()).searchParams.get('q')).toBeNull();
});

test('public Gardens load another page on demand and preserve results on refusal', async ({
  page,
}) => {
  let failMore = true;
  await page.route('**/authors/tester/cruxes?*', async (route) => {
    const currentPage = Number(new URL(route.request().url()).searchParams.get('page'));
    expect(new URL(route.request().url()).searchParams.get('perPage')).toBe('24');
    if (currentPage === 2 && failMore) return route.fulfill({ status: 503, body: '{}' });
    const crux = {
      ...api.state.cruxes[ID],
      id: currentPage === 1 ? ID : 'other',
      title: currentPage === 1 ? 'First page' : 'Second page',
      slug: currentPage === 1 ? 'first' : 'second',
    };
    await route.fulfill({
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Pagination',
        Pagination: JSON.stringify({ lastPage: 2, currentPage }),
      },
      body: JSON.stringify([crux]),
    });
  });
  await page.goto('/@tester');
  await expect(page.getByText('First page', { exact: true })).toBeVisible();
  await expect(page.getByText('Second page', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Load more Cruxes' }).click();
  await expect(page.getByRole('alert')).toContainText('Couldn’t load more');
  await expect(page.getByText('First page', { exact: true })).toBeVisible();
  failMore = false;
  await page.getByRole('button', { name: 'Try loading more again' }).click();
  await expect(page.getByText('Second page', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load more Cruxes' })).toHaveCount(0);
});

test('the deployed teaser player loads on demand, pauses, rewinds and remembers volume', async ({
  page,
}) => {
  // A short valid WAV exercises browser playback without streaming the remote song.
  const audio = Buffer.alloc(44 + 16000);
  audio.write('RIFF');
  audio.writeUInt32LE(audio.length - 8, 4);
  audio.write('WAVEfmt ', 8);
  audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20);
  audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(8000, 24);
  audio.writeUInt32LE(16000, 28);
  audio.writeUInt16LE(2, 32);
  audio.writeUInt16LE(16, 34);
  audio.write('data', 36);
  audio.writeUInt32LE(16000, 40);
  let requests = 0;
  await page.route('**/sagittarius-a-star.m4a', async (route) => {
    requests++;
    await route.fulfill({ contentType: 'audio/wav', body: audio });
  });
  await page.goto('/');
  const play = page.getByRole('button', { name: 'Play Sagittarius A*', exact: true });
  await expect(play).toBeVisible();
  await expect(page.getByRole('link', { name: /Explore/ })).toHaveCount(0);
  expect(requests).toBe(0);
  await play.click();
  await expect(
    page.getByRole('button', { name: 'Pause Sagittarius A*', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.locator('audio').evaluate((el: HTMLAudioElement) => el.currentTime))
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause Sagittarius A*', exact: true }).click();
  await expect(play).toBeVisible();
  const volume = page.getByRole('slider', { name: 'Sagittarius A* volume' });
  await volume.fill('0.3');
  expect(await page.locator('audio').evaluate((el: HTMLAudioElement) => el.volume)).toBeCloseTo(
    0.3,
  );
  await page.getByRole('button', { name: 'Stop Sagittarius A*', exact: true }).click();
  expect(await page.locator('audio').evaluate((el: HTMLAudioElement) => el.currentTime)).toBe(0);
  await page.reload();
  await expect(volume).toHaveValue('0.3');
  await expect(play).toBeVisible();
});

test('public creations explain their purpose and published process, and creator pages stay readable on a phone', async ({
  page,
}) => {
  await page.goto('/@tester/garden-notes');
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  const details = page.getByRole('complementary', { name: 'About this creation' });
  await expect(details.getByRole('heading', { name: 'Garden Notes' })).toBeVisible();
  await expect(details.getByRole('link', { name: 'By @tester' })).toHaveAttribute(
    'href',
    '/@tester',
  );
  await expect(details.getByText('Slug', { exact: true })).not.toBeVisible();
  await expect(details.getByRole('link', { name: 'Get started with Crux Garden' })).toHaveAttribute(
    'href',
    '/docs/start/get-started/',
  );
  await details.getByText('How this was made', { exact: true }).click();
  await expect(details.getByText('write me a notes page', { exact: true })).toBeVisible();
  await expect(details.getByText('Here are your notes.', { exact: true })).toBeVisible();
  await page.screenshot({ path: '../docs/product-review/2026-09-30/polished-public-details.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.route('**/authors/tester', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: {
        ...(await response.json()),
        displayName: 'River Moss',
        bio: 'I make little places for ideas, drawings and things worth sharing. '.repeat(15),
        meta: {},
      },
    });
  });
  await page.goto('/@tester');
  await expect(page.getByRole('heading', { name: 'River Moss', exact: true })).toBeVisible();
  await expect(page.getByText('R', { exact: true }).first()).toBeVisible();
  const more = page.getByRole('button', { name: 'Read full bio', exact: true });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await more.click();
  await expect(page.getByRole('button', { name: 'Show less' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await page.getByRole('button', { name: 'Show less' }).click();
  const creation = page.getByTestId(`explore-crux-${ID}`);
  expect((await creation.boundingBox())!.width).toBeGreaterThan(300);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: '../docs/product-review/2026-09-30/polished-creator-phone.png' });
});
