import { test, expect } from '@playwright/test';
import { startMockApi, type MockApi } from '../e2e/api-mock';

let api: MockApi;
const items = [
  ['Paper planets', 'An atlas of small imaginary worlds.', 'worlds', '#124559'],
  ['A little rhythm', 'A tiny instrument for a rainy afternoon.', 'music', '#74452f'],
  ['Midnight garden', 'A growing collection of sketches and experiments.', 'worlds', '#514066'],
  ['Field notes', 'Things worth looking at twice.', 'notes', '#45644a'],
];
test.beforeAll(async () => {
  api = await startMockApi({ port: 8124 });
  items.forEach(([title, description, tag], index) => {
    api.state.cruxes[`discovery-${index}`] = {
      id: `discovery-${index}`,
      slug: `creation-${index}`,
      title,
      description,
      type: 'workspace',
      kind: 'page',
      authorId: 'author-api-1',
      visibility: 'public',
      discoverable: true,
      meta: { tags: [tag] },
      created: '2026-09-01T00:00:00Z',
      updated: '2026-09-01T00:00:00Z',
    };
  });
});
test.afterAll(async () => {
  await api?.close();
});

test('discovery shows large previews and creators, remembers topics, and supports ordinary links', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route('**/_crux/cover.jpg', async (route) => {
    const index = Number(
      route
        .request()
        .url()
        .match(/discovery-(\d)/)?.[1] ?? 0,
    );
    const [title, , , color] = items[index];
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="${color}"/><circle cx="540" cy="175" r="115" fill="#ffffff" opacity=".14"/><circle cx="190" cy="440" r="210" fill="#ffffff" opacity=".07"/><text x="50" y="280" fill="white" font-family="serif" font-size="54">${title}</text><text x="54" y="330" fill="white" opacity=".6" font-family="sans-serif" font-size="18">EXPLORE TEST FIXTURE</text></svg>`,
    });
  });
  await page.route('http://127.0.0.1:8124/explore?*', async (route) => {
    const response = await route.fetch();
    const values = await response.json();
    await route.fulfill({
      response,
      json: values.map((value: Record<string, unknown>) => ({
        ...value,
        author_meta: { avatarUrl: 'http://127.0.0.1:8124/creator-avatar.svg' },
      })),
    });
  });
  await page.route('**/creator-avatar.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#ba8061"/><circle cx="40" cy="31" r="17" fill="#ffddbb"/><ellipse cx="40" cy="79" rx="29" ry="28" fill="#333344"/></svg>',
    }),
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/explore');
  await expect(page.getByRole('heading', { name: 'Find your next spark.' })).toBeVisible();
  await expect(page.getByTestId('explore-tags')).toContainText('Popular tags');
  const card = page.getByTestId('explore-crux-discovery-0');
  const preview = card.getByRole('img', { name: 'Preview of Paper planets' });
  await expect(preview).toBeVisible();
  await expect
    .poll(() => preview.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
  const box = await preview.boundingBox();
  expect(box!.width).toBeGreaterThan(300);
  expect(box!.height).toBeGreaterThan(190);
  const authorBox = await card.getByRole('link', { name: "Visit Tester's Garden" }).boundingBox();
  expect(authorBox!.y + authorBox!.height).toBeLessThanOrEqual(720);
  await expect(card.getByRole('link', { name: "Visit Tester's Garden" })).toHaveAttribute(
    'href',
    '/tester',
  );
  await expect(card.getByRole('link', { name: 'Paper planets', exact: true })).toHaveAttribute(
    'href',
    '/tester/creation-0',
  );
  await expect
    .poll(() =>
      card
        .getByRole('link', { name: "Visit Tester's Garden" })
        .locator('img')
        .evaluate((el: HTMLImageElement) => el.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.screenshot({ path: '../docs/product-review/2026-09-30/polished-explore.png' });
  await card.getByRole('button', { name: '#worlds', exact: true }).click();
  await expect(page.getByTestId('active-filters')).toContainText('#worlds');
  await expect(page.getByTestId('explore-crux-discovery-1')).toHaveCount(0);
  await page.goto('/explore');
  await expect(page.getByRole('region', { name: 'Your recent tags' })).toContainText('#worlds');
  await page
    .getByRole('region', { name: 'Your recent tags' })
    .getByRole('button', { name: '#worlds' })
    .click();
  await expect(page.getByTestId('active-filters')).toContainText('#worlds');
  await card.getByRole('link', { name: "Visit Tester's Garden" }).click();
  await expect(page).toHaveURL(/\/tester$/);
  await page.goBack();
  await expect(page.getByTestId('active-filters')).toContainText('#worlds');
  await page.getByRole('button', { name: 'Clear recent tags' }).click();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Your recent tags' })).toHaveCount(0);
});

test('phone discovery handles broken previews and avatars without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/_crux/cover.jpg', (route) => route.fulfill({ status: 404, body: '' }));
  await page.route('http://127.0.0.1:8124/explore?*', async (route) => {
    const response = await route.fetch();
    const values = await response.json();
    await route.fulfill({
      response,
      json: values.map((value: Record<string, unknown>) => ({
        ...value,
        author_meta: { avatarUrl: 'http://127.0.0.1:8124/broken-avatar.png' },
      })),
    });
  });
  await page.route('**/broken-avatar.png', (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto('/explore');
  const card = page.getByTestId('explore-crux-discovery-0');
  await expect(card.getByText('Preview coming soon')).toBeVisible();
  const creator = card.getByRole('link', { name: "Visit Tester's Garden" });
  await expect(creator.getByRole('img')).toHaveCount(0);
  await expect(creator.getByText('T', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect((await card.boundingBox())!.width).toBeGreaterThan(280);
  await page.screenshot({ path: '../docs/product-review/2026-09-30/polished-explore-phone.png' });
  await page.getByRole('tab', { name: 'People', exact: true }).click();
  await expect(page.getByRole('link').filter({ hasText: '@tester' })).toBeVisible();
});

test('an unavailable catalogue offers retry instead of pretending there are no creations', async ({
  page,
}) => {
  await page.route('http://127.0.0.1:8124/explore?*', (route) =>
    route.fulfill({ status: 503, body: '{}' }),
  );
  await page.goto('/explore');
  await expect(page.getByRole('alert')).toContainText("Couldn't reach crux.garden");
  await expect(page.getByText('Nothing here yet')).toHaveCount(0);
  await page.unroute('http://127.0.0.1:8124/explore?*');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('link', { name: 'Paper planets', exact: true })).toBeVisible();
});
