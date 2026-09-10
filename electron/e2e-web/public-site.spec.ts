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
  test('Landing: wordmark, download, Mood selection, Explore shows what people made', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'You can grow anything.', level: 1 }),
    ).toBeVisible();
    await expect(page.getByTestId('download-button')).toBeVisible();
    // Wearing a Mood changes the accent for the current visit.
    const accent = () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      );
    const before = await accent();
    await page.getByRole('button', { name: /See all .* Moods/ }).click();
    await page
      .getByRole('group', { name: 'Moods' })
      .getByRole('button')
      .filter({ hasText: 'Terminal' })
      .click();
    await expect.poll(accent).not.toBe(before);
    // the recent cruxes strip shows the seeded crux and links to its page
    await expect(page.getByText('Garden Notes').first()).toBeVisible();
  });

  test('the homepage garden rotates, changes worlds, and leads to creations', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    const canvas = page.getByTestId('garden-canvas');
    await expect(canvas).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'You can grow anything.', level: 1 }),
    ).toBeVisible();
    await page
      .getByRole('group', { name: 'Visit a garden world' })
      .getByRole('button', { name: 'The Keeper', exact: true })
      .click();
    await expect(page.locator('.garden-landscape')).toHaveAttribute('data-world', 'the-keeper');
    await page.screenshot({ path: '/private/tmp/crux-homepage-keeper.png', fullPage: true });
    await page.screenshot({ path: '/private/tmp/crux-homepage-hero.png' });
    const before = await canvas.screenshot();
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 110, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    expect((await canvas.screenshot()).equals(before)).toBe(false);
    await page.getByRole('button', { name: 'Reset garden view' }).click();
    const worlds = page.getByRole('group', { name: 'Visit a garden world' });
    await worlds.getByRole('button', { name: 'Ancient Egypt', exact: true }).click();
    await expect(page.locator('.garden-landscape')).toHaveAttribute('data-world', 'ancient-egypt');
    await expect(page.getByText('Landscape study · an idea for a future Mood.')).toBeVisible();
    await page.screenshot({ path: '/private/tmp/crux-homepage-egypt.png', fullPage: true });
    await worlds.getByRole('button', { name: 'GLUMLOT', exact: true }).click();
    await expect(page.locator('.garden-landscape')).toHaveAttribute('data-world', 'glumlot');
    await page.screenshot({ path: '/private/tmp/crux-homepage-glumlot.png', fullPage: true });
    await page
      .getByRole('group', { name: 'Places in the garden' })
      .getByRole('button', { name: /The arcade/ })
      .click();
    await expect(page.getByRole('heading', { name: 'A game to get lost in.' })).toBeVisible();
    await page.getByRole('link', { name: 'Explore games' }).click();
    await expect(page).toHaveURL(/\/explore\?q=game$/);
  });

  test('a refresh draws a new world and applies its corresponding Mood', async ({ page }) => {
    await page.goto('/');
    const landscape = page.locator('.garden-landscape');
    await expect(landscape).toBeVisible();
    const first = await landscape.getAttribute('data-world');
    const worlds = page.getByRole('group', { name: 'Visit a garden world' });
    const firstName = await worlds.locator('[aria-pressed="true"]').innerText();
    await page.reload();
    await expect(landscape).toBeVisible();
    await expect(landscape).not.toHaveAttribute('data-world', first!);
    await expect(worlds.locator('[aria-pressed="true"]')).not.toHaveText(firstName);
    const selected = await landscape.getAttribute('data-world');
    const name = await worlds.locator('[aria-pressed="true"]').innerText();
    const moodName = ['ancient-egypt', 'paper-theatre'].includes(selected!) ? 'The Keeper' : name;
    const moods = page.getByRole('group', { name: 'Moods' });
    await expect(moods.getByRole('button').filter({ hasText: moodName })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Returning through client-side navigation does not count as a page refresh.
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Explore', exact: true })
      .click();
    await page.goBack();
    await expect(landscape).toHaveAttribute('data-world', selected!);
  });

  test('the homepage works on a phone and with reduced motion', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByTestId('garden-canvas')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: '/private/tmp/crux-homepage-mobile.png', fullPage: true });
    await page.screenshot({ path: '/private/tmp/crux-homepage-mobile-hero.png' });
    await page.getByRole('link', { name: 'Start growing' }).click();
    await expect(page.getByRole('heading', { name: 'What will you grow?' })).toBeInViewport();
    await expect(page.getByTestId('download-button')).toBeVisible();
  });

  test('without WebGL the headline, world choices, and creation links remain usable', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
        if (type.includes('webgl')) return null;
        return original.apply(this, [type, ...args] as Parameters<typeof original>);
      } as typeof original;
    });
    await page.goto('/');
    await expect(page.getByText('A world of possibilities.', { exact: true })).toBeVisible();
    const button = page
      .getByRole('group', { name: 'Places in the garden' })
      .getByRole('button', { name: /The workshop/ });
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'That useful little thing.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Explore tools' })).toHaveAttribute(
      'href',
      '/explore?q=tool',
    );
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
