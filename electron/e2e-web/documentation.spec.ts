import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const evidence = resolve(__dirname, '../../docs/documentation');
test('public docs deep links, search and journal work with local assets', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort());
  await page.goto('/docs/start/first-home/');
  await expect(
    page.getByRole('heading', { name: 'Your first home page', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explore creations', exact: true })).toHaveAttribute(
    'href',
    '/explore',
  );
  await expect(
    page
      .getByRole('navigation', { name: 'Crux Garden links' })
      .getByRole('link', { name: 'Get started', exact: true }),
  ).toHaveAttribute('href', '/docs/start/get-started/');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByPlaceholder('Search', { exact: true }).fill('Growth');
  await page
    .locator('.pagefind-ui__result-link')
    .filter({ hasText: 'Growth: keep the story' })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Growth: keep the story', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Growth: keep the story', exact: true }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Select theme' }).selectOption('dark');
  mkdirSync(evidence, { recursive: true });
  await page.screenshot({ path: resolve(evidence, 'docs-dark.png'), fullPage: true });
  await page.getByRole('link', { name: 'Garden journal', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A practice of making things.' })).toBeVisible();
  await page.getByRole('link', { name: /A garden begins with one small thing/ }).click();
  await expect(
    page.getByRole('heading', { name: 'A garden begins with one small thing', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Field guide ↗', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'A little space for your ideas.', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('phone layouts retain navigation and readable content', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/docs/');
  await expect(
    page.getByRole('heading', { name: 'A little space for your ideas.', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('link', { name: 'Tasks and multiple agents', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Tasks and multiple agents', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: resolve(evidence, 'docs-phone.png'), fullPage: true });
  await page.goto('/docs/start/first-home/');
  const illustrations = page.locator('.sl-markdown-content img');
  await expect(illustrations).toHaveCount(3);
  for (const illustration of await illustrations.all()) {
    await illustration.scrollIntoViewIfNeeded();
    await expect
      .poll(() => illustration.evaluate((node: HTMLImageElement) => node.naturalWidth))
      .toBeGreaterThan(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: resolve(evidence, 'first-home-phone.png'), fullPage: true });
  await page.goto('/blog/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByRole('heading', { name: 'A practice of making things.' })).toBeVisible();
  await page.screenshot({ path: resolve(evidence, 'journal-phone.png'), fullPage: true });
});
