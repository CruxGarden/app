import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { launchApp } from './launch';
import { showPane } from './panel-helpers';
import { storedCrux, reenterWorkspace } from './multi-crux-helpers';

test('offline field guide has working search and creates an editable ordinary Crux without AI', async () => {
  test.setTimeout(300_000);
  const { app, page, dir } = await launchApp({ ai: false });
  let folder = '';
  const evidence = resolve(__dirname, '../../docs/documentation');
  mkdirSync(evidence, { recursive: true });
  try {
    // Block renderer HTTP; the native toolchain may install dependencies for the editable copy.
    await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort());
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await page.getByText('Plant a new garden').click();
    await page.getByRole('checkbox', { name: /Include a first home page/ }).uncheck();
    await page.getByRole('button', { name: 'Welcome', exact: true }).click();
    await showPane(page, 'Explore');
    await page.getByRole('button', { name: 'Read the field guide →', exact: true }).click();
    const guide = page.frameLocator('iframe[title="Crux Garden documentation"]');
    await expect(
      guide.getByRole('heading', { name: 'A little space for your ideas.', exact: true }),
    ).toBeVisible();
    await guide.getByRole('link', { name: 'Make your first home page →', exact: true }).click();
    await expect(
      guide.getByRole('heading', { name: 'Your first home page', exact: true }),
    ).toBeVisible();
    await guide.getByRole('button', { name: 'Search', exact: true }).click();
    await guide.getByPlaceholder('Search', { exact: true }).fill('Growth');
    await expect(guide.locator('.pagefind-ui__result').first()).toBeVisible();
    await guide
      .locator('.pagefind-ui__result-link')
      .filter({ hasText: 'Growth: keep the story' })
      .first()
      .click();
    await expect(
      guide.getByRole('heading', { name: 'Growth: keep the story', exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: join(evidence, 'offline-guide.png') });
    await page.getByRole('button', { name: 'Make a copy', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible();
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const project = await storedCrux(page, id);
    expect(project.template).toBe('documentation');
    expect(project.messages ?? []).toEqual([]);
    folder = project.projectFolder;
    expect(existsSync(join(folder, 'astro.config.mjs'))).toBe(true);
    expect(existsSync(join(folder, 'LICENSE'))).toBe(true);
    expect(existsSync(join(folder, 'dist'))).toBe(false);
    const preview = page.frameLocator('iframe[data-crux-id]').first();
    await expect(
      preview.getByRole('heading', { name: 'A little space for your ideas.', exact: true }),
    ).toBeVisible({ timeout: 120_000 });
    await page.getByRole('button', { name: 'Edit content', exact: true }).click();
    await page.getByRole('button', { name: '⚙️ Site settings', exact: true }).click();
    await page.getByLabel('Site title', { exact: true }).fill('My very own guide');
    await expect
      .poll(() => JSON.parse(readFileSync(join(folder, 'src/config.json'), 'utf8')).title)
      .toBe('My very own guide');
    await page.screenshot({ path: join(evidence, 'editable-copy.png') });
    const built = await page.evaluate(
      (folder) => window.electronAPI!.toolchain.build(folder),
      folder,
    );
    expect(built.code, built.log).toBe(0);
    expect(readFileSync(join(folder, 'dist/index.html'), 'utf8')).toContain('My very own guide');
    expect(existsSync(join(folder, 'dist/guides/growth/index.html'))).toBe(true);
    expect(existsSync(join(folder, 'dist/blog/small-beginnings/index.html'))).toBe(true);
  } finally {
    await app.close();
  }
  const again = await launchApp({ dir, ai: false });
  try {
    await reenterWorkspace(again.page, 'My Field Guide');
    expect(JSON.parse(readFileSync(join(folder, 'src/config.json'), 'utf8')).title).toBe(
      'My very own guide',
    );
    await again.page.getByRole('button', { name: 'Clean', exact: true }).click();
    const preview = again.page.frameLocator('iframe[data-crux-id]').first();
    await expect(
      preview.getByRole('heading', { name: 'A little space for your ideas.', exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      preview.getByRole('link', { name: 'My very own guide documentation', exact: true }),
    ).toBeVisible();
  } finally {
    await again.app.close();
  }
});
