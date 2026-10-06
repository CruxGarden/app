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
    // This journey reloads the animated production page several times.
    test.setTimeout(120_000);
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
    await expect(page.getByText('grow anything', { exact: true })).toBeVisible();
    // Preserve the deployed coming-soon page; other site routes stay directly available.
    await expect(page.getByRole('link')).toHaveCount(0);
    await expect(page.locator('form')).toHaveAttribute(
      'action',
      'https://tech.us13.list-manage.com/subscribe/post?u=4c2e196117cdb095809f3bb3b&id=f31692b207&f_id=008b35e5f0',
    );
    await page.screenshot({ path: test.info().outputPath('landing-desktop.png') });
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
    expect(submissions[0].get('tags')).toBe('7209613,7209430');
    expect(submissions[0].get('b_4c2e196117cdb095809f3bb3b_f31692b207')).toBe('');
    await page.goto('/');
    await expect(page.getByRole('status')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Notify', exact: true })).toHaveCount(0);
    await page.goto('/?reset');
    await expect(email).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);
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
    await expect(page.getByRole('heading', { name: 'Return to your Garden' })).toBeVisible();
    await expect(page.getByText('Your plan is active.', { exact: false })).toHaveCount(0);
    await expect(page.getByText(/this page alone does not confirm payment/)).toBeVisible();
    await page.goto('/billing/cancel');
    await expect(page.getByRole('heading', { name: 'Checkout closed' })).toBeVisible();
  });

  test('Explore Home, a published Crux and a creator profile', async ({ page }) => {
    await page.goto('/explore');
    await expect(page.getByRole('link', { name: 'Explore Home', exact: true })).toHaveAttribute(
      'href',
      '/explore',
    );
    await expect(page.getByRole('link', { name: 'Get Crux Garden', exact: true })).toHaveAttribute(
      'href',
      '/#download',
    );
    await expect(page.getByRole('navigation', { name: 'Garden and Explore' })).toHaveCount(0);
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
  await page.getByRole('link', { name: 'Explore Home', exact: true }).first().click();
  await expect(page.getByText('Garden Notes').first()).toBeVisible();
});

test('Garden outages offer retry, and Explore clears pending search', async ({ page }) => {
  await page.route('**/authors/tester', (route) => route.fulfill({ status: 500, body: '{}' }));
  await page.goto('/@tester');
  await expect(page.getByRole('heading', { name: "Couldn't reach this creator" })).toBeVisible();
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
  await search.fill('notes');
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('notes');
  await page.getByRole('link', { name: 'Explore Home', exact: true }).click();
  await expect(page.getByText('Looking…', { exact: true })).toBeHidden();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(search).toHaveValue('');
  await expect(page.getByTestId(`explore-crux-${ID}`)).toBeVisible();
  await page.goBack();
  await expect(search).toHaveValue('notes');
  await page.goForward();
  await expect(search).toHaveValue('');
  await expect(page.getByText('Looking…', { exact: true })).toBeHidden();
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
  // Include cold WebGL startup and the persistence reload in the journey budget.
  test.setTimeout(120_000);
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

test('a creator Garden presents tools and Moods with their own actions and category filters', async ({
  page,
}) => {
  const ids = ['5c0ffee5-0000-4000-8000-000000000001', '5c0ffee5-0000-4000-8000-000000000002'];
  const slugs = ['creator-tool-test', 'creator-mood-test'];
  for (const [i, kind] of ['tool', 'mood'].entries())
    api.state.cruxes[ids[i]!] = {
      ...api.state.cruxes[ID],
      id: ids[i],
      kind,
      title: kind === 'tool' ? 'Pocket Notes Tool' : 'Meadow Mood',
      slug: slugs[i],
      meta: { publishedAt: '2026-10-01', template: 'unknown-community-tool' },
    };
  try {
    api.state.published[ids[0]!] = [
      {
        path: '_crux/tool-package.zip',
        mime: 'application/zip',
        bytes: Buffer.from('download fixture'),
      },
    ];
    await page.goto('/tester/creator-tool-test');
    await expect(
      page.getByRole('heading', { name: 'Pocket Notes Tool', exact: true }),
    ).toBeVisible();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download .cruxtool', exact: true }).click();
    expect((await downloaded).suggestedFilename()).toBe('creator-tool-test.cruxtool');
    await page.goto('/tester/creator-mood-test');
    await expect(page.getByRole('button', { name: 'Download .cruxmood' })).toBeDisabled();
    await expect(page.getByRole('status')).toContainText('missing its installable file');
    await page.goto('/tester');
    await expect(page.getByTestId('explore-tool-unknown-community-tool')).toBeVisible();
    await expect(page.getByTestId(`explore-mood-${ids[1]}`)).toBeVisible();
    await expect(
      page
        .getByTestId('explore-tool-unknown-community-tool')
        .getByRole('link', { name: 'Open in Garden' }),
    ).toHaveAttribute('href', `crux-garden://install/tool/${ids[0]}`);
    await expect(
      page.getByTestId(`explore-mood-${ids[1]}`).getByRole('link', { name: 'Open in Garden' }),
    ).toHaveAttribute('href', `crux-garden://install/mood/${ids[1]}`);
    await page.getByRole('button', { name: 'Tools', exact: true }).click();
    await expect(page.getByTestId('explore-tool-unknown-community-tool')).toBeVisible();
    await expect(page.getByTestId(`explore-mood-${ids[1]}`)).toHaveCount(0);
    await page.getByRole('button', { name: 'Moods', exact: true }).click();
    await expect(page.getByTestId(`explore-mood-${ids[1]}`)).toBeVisible();
    await expect(page.getByTestId('explore-tool-unknown-community-tool')).toHaveCount(0);
    await page.getByRole('button', { name: 'Creations', exact: true }).click();
    await expect(page.getByText('Garden Notes', { exact: true }).first()).toBeVisible();
    expect(api.log.some((l) => l.includes('/authors/tester/cruxes'))).toBe(true);
  } finally {
    for (const id of ids) {
      delete api.state.cruxes[id];
      delete api.state.published[id];
    }
  }
});

test('download leads to actual release installers and explains the shortest first-website path', async ({
  page,
}) => {
  await page.route('https://api.github.com/repos/CruxGarden/app/releases/latest', (route) =>
    route.fulfill({
      json: {
        tag_name: 'v1.0.0',
        draft: false,
        prerelease: false,
        assets: [
          {
            name: 'Crux.Garden-1.0.0-arm64.dmg',
            browser_download_url:
              'https://github.com/CruxGarden/app/releases/download/v1.0.0/Crux.Garden-1.0.0-arm64.dmg',
          },
          {
            name: 'Crux.Garden-1.0.0-win-x64.exe',
            browser_download_url:
              'https://github.com/CruxGarden/app/releases/download/v1.0.0/Crux.Garden-1.0.0-win-x64.exe',
          },
          {
            name: 'Crux.Garden-1.0.0-x64.dmg',
            browser_download_url: 'https://elsewhere.invalid/installer.dmg',
          },
        ],
      },
    }),
  );
  await page.goto('/#download');
  await expect(page).toHaveURL(/\/#download$/);
  await expect(page.getByRole('heading', { name: 'Your first website starts here' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Download for Mac · Apple silicon' }),
  ).toHaveAttribute(
    'href',
    'https://github.com/CruxGarden/app/releases/download/v1.0.0/Crux.Garden-1.0.0-arm64.dmg',
  );
  await expect(page.getByRole('link', { name: 'Download for Windows' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download for Mac · Intel' })).toHaveCount(0);
  await expect(page.getByText('Make my home page', { exact: true })).toBeVisible();
  await expect(page.getByText('A local test Garden is available', { exact: false })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('download.png'), fullPage: true });
});

test('download failure has a useful retry and never offers a draft release', async ({ page }) => {
  let requests = 0;
  await page.route('https://api.github.com/repos/CruxGarden/app/releases/latest', (route) => {
    requests++;
    return route.fulfill({
      status: requests === 1 ? 503 : 200,
      json:
        requests === 1
          ? {}
          : {
              draft: true,
              assets: [
                {
                  name: 'Crux.Garden-1.0.0-arm64.dmg',
                  browser_download_url:
                    'https://github.com/CruxGarden/app/releases/download/v1.0.0/app.dmg',
                },
              ],
            },
    });
  });
  await page.goto('/#download');
  await expect(page.getByRole('status')).toContainText(
    'couldn’t find an available public installer',
  );
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect.poll(() => requests).toBe(2);
  await expect(page.getByRole('link', { name: /^Download for/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Check releases' })).toHaveAttribute(
    'href',
    'https://github.com/CruxGarden/app/releases',
  );
});

test('legal pages render, are linked from the public footer and from the teaser', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/explore');
  const legal = page.getByRole('navigation', { name: 'Legal' });
  for (const [name, path, phrase] of [
    ['Terms', '/terms', 'What you make is yours'],
    ['Privacy', '/privacy', 'What stays on your device'],
    ['Contact', '/contact', 'Report a published creation'],
  ] as const) {
    await legal.getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: phrase })).toBeVisible();
    await expect(page.getByText(/Last updated \d+ \w+ \d{4}/)).toBeVisible();
    await expect(page).toHaveTitle(`${name} — Crux Garden`);
    expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toMatch(
      new RegExp(`${path}$`),
    );
    // Readable on a phone: the page never scrolls sideways.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  // No contact address is configured in this build, so the issue tracker is offered.
  await expect(page.getByRole('link', { name: 'GitHub issues' })).toHaveAttribute(
    'href',
    'https://github.com/CruxGarden/app/issues',
  );
  // A word that is also a page is never read as somebody's garden.
  await expect(page.getByText('Creator not found')).toHaveCount(0);

  await page.goto('/plans');
  await page
    .getByRole('navigation', { name: 'Legal' })
    .getByRole('link', { name: 'Privacy' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
  await page.goto('/plans');
  await expect(page.getByText(/By subscribing you agree to the/)).toBeVisible();
  // Leaving a page puts the site's own title back.
  await page.goto('/terms');
  await page.getByRole('link', { name: 'Crux Garden', exact: true }).first().click();
  await expect(page).toHaveTitle('Crux Garden');
});

test('a visitor can report a published creation; refusals keep what they wrote', async ({
  page,
}) => {
  api.state.reports = [];
  await page.goto('/@tester/garden-notes');
  await expect(page).toHaveTitle('Garden Notes — Crux Garden');
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    'content',
    /\/tester\/garden-notes$/,
  );
  const trigger = page.getByRole('button', { name: 'Report', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Report this creation' });
  await expect(dialog).toBeVisible();

  // A reason is required before anything is sent.
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Choose a reason for the report.');
  expect(api.state.reports).toHaveLength(0);

  await dialog.getByLabel('What is wrong with it?').selectOption('spam');
  await dialog.getByLabel('Details (optional)').fill('Sells tickets that do not exist.');
  await dialog.getByLabel(/Your email/).fill('reader@example.invalid');

  // Too many reports: said plainly, and the form is untouched.
  api.state.reportStatus = 429;
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await expect(dialog.getByRole('alert')).toContainText(/try again later/i);
  await expect(dialog.getByLabel('Details (optional)')).toHaveValue(
    'Sells tickets that do not exist.',
  );

  // A server failure: the same, and closing and reopening still keeps the draft.
  api.state.reportStatus = 500;
  await dialog.getByRole('button', { name: 'Send again' }).click();
  await expect(dialog.getByRole('alert')).toContainText('could not be sent');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog.getByLabel('Details (optional)')).toHaveValue(
    'Sells tickets that do not exist.',
  );
  await expect(dialog.getByLabel('What is wrong with it?')).toHaveValue('spam');

  api.state.reportStatus = undefined;
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await expect(dialog.getByRole('status')).toContainText('Your report was sent');
  expect(api.state.reports).toEqual([
    {
      cruxId: ID,
      reason: 'spam',
      details: 'Sells tickets that do not exist.',
      email: 'reader@example.invalid',
    },
  ]);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(trigger).toBeFocused();

  // A garden page is not a creation: nothing to report there.
  await page.goto('/@tester');
  await expect(page.getByRole('button', { name: 'Report', exact: true })).toHaveCount(0);
});
