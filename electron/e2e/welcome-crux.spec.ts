import { setupWithFirstHomePage } from './setup-helpers';
import { test, expect } from '@playwright/test';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { storedCrux, goHome } from './multi-crux-helpers';

/** Ordinary setup, forms and Share, with no provider, mock model or AI enabled. */
test('a new Garden teaches a home page with name, photo, Growth and Share, entirely with AI off', async () => {
  test.setTimeout(12 * 60_000);
  const api = await startMockApi();
  try {
    const first = await launchApp({ ai: false, env: { CRUX_API_URL: api.url } });
    let id = '';
    let folder = '';
    const evidence = resolve(__dirname, '../../docs/welcome-crux');
    mkdirSync(evidence, { recursive: true });
    const illustrations =
      process.env.CRUX_REFRESH_GUIDE_IMAGES === '1'
        ? resolve(__dirname, '../../documentation-crux/src/assets')
        : test.info().outputPath('guide-illustrations');
    mkdirSync(illustrations, { recursive: true });
    const photo = readFileSync(resolve(__dirname, 'fixtures/glow-garden/seed.png'));
    try {
      const { page } = first;
      await setupWithFirstHomePage(page);
      await expect(page.locator('[data-workspace-id]')).toBeVisible();
      id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      await expect(page.getByTestId('pane-body-collaboration')).toHaveCount(0);
      await expect(page.getByText('Your first home page', { exact: true })).toBeVisible();
      await expect(page.getByLabel('Your Name', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Edit my home page', exact: true }).click();
      await expect(page.getByTestId('workshop-view')).toHaveAttribute('data-view', 'clean');
      await expect(page.getByLabel('Public address', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Source', exact: true })).toHaveCount(0);
      await page.getByLabel('Your Name', { exact: true }).fill('River Moss');
      await page.getByLabel('Tagline', { exact: true }).fill('Small things, thoughtfully made');
      await page.getByLabel('About', { exact: true }).fill('A home for my experiments.');
      await page.getByLabel('Upload your photo', { exact: true }).setInputFiles({
        name: 'not-a-photo.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Keep private files private'),
      });
      await expect(page.getByRole('alert')).toContainText('Choose a PNG, JPEG, WebP or GIF');
      await page
        .getByLabel('Upload your photo', { exact: true })
        .setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: photo });
      await expect
        .poll(() => JSON.parse(readFileSync(join(folder, 'src/config.json'), 'utf8')).photo)
        .toMatch(/^\/images\/photo-/);
      const config = JSON.parse(readFileSync(join(folder, 'src/config.json'), 'utf8'));
      expect(config.name).toBe('River Moss');
      expect(readFileSync(join(folder, 'public', config.photo))).toEqual(photo);
      await page.screenshot({ path: join(evidence, 'personalize.png') });
      await page
        .getByTestId('workshop-view')
        .screenshot({ path: join(illustrations, 'first-home-form.png') });
      await page.getByText('All steps and more help', { exact: true }).click();
      await page.getByRole('button', { name: '2. See your page', exact: true }).click();
      // Switching immediately after typing must flush the form's pending save.
      await page
        .getByLabel('About', { exact: true })
        .fill('A home for my experiments, always growing.');
      await page.getByRole('button', { name: 'Preview my page', exact: true }).click();
      const frame = page.frameLocator('iframe[data-crux-id]').first();
      await expect(frame.getByRole('heading', { name: 'River Moss', exact: true })).toBeVisible({
        timeout: 8 * 60_000,
      });
      await expect(
        frame.getByText('A home for my experiments, always growing.', { exact: true }),
      ).toBeVisible();
      await expect(frame.getByRole('img', { name: 'Portrait of River Moss' })).toBeVisible();
      // Astro may reload the preview after the config/photo writes. Retry the
      // whole observation so a replaced frame cannot abort the loaded-image check.
      await expect(async () => {
        const width = await frame
          .getByRole('img', { name: 'Portrait of River Moss' })
          .evaluate((node) => (node as HTMLImageElement).naturalWidth);
        expect(width).toBeGreaterThan(0);
      }).toPass({ timeout: 15_000 });
      await expect(
        frame.getByText('A home for my experiments, always growing.', { exact: true }),
      ).toBeInViewport({ ratio: 1 });
      await expect(frame.locator('astro-dev-toolbar')).toHaveCount(0);
      await expect(frame.getByRole('link', { name: 'Works', exact: true })).toHaveCount(0);
      await page.screenshot({ path: join(evidence, 'preview.png') });
      await page
        .getByTestId('workshop-view')
        .screenshot({ path: join(illustrations, 'first-home-preview.png') });
      await page.getByRole('button', { name: 'Optional: Watch it grow', exact: true }).click();
      await page.getByRole('button', { name: 'Open Growth', exact: true }).click();
      const growth = page.getByTestId('pane-body-history');
      await expect(growth).toBeVisible();
      await growth.getByRole('button', { name: 'Mark version', exact: true }).click();
      await growth.getByPlaceholder('Label (optional)').fill('My first home page');
      await growth.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(growth.getByText('My first home page', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: '3. Share it', exact: true }).click();
    } finally {
      await first.app.close();
    }

    const again = await launchApp({ dir: first.dir, ai: false, env: { CRUX_API_URL: api.url } });
    try {
      const { page } = again;
      await page.getByRole('button', { name: 'Enter', exact: true }).click();
      await page.getByRole('button', { name: 'Open Hello, world', exact: true }).click();
      await page.getByText('All steps and more help', { exact: true }).click();
      await expect(page.getByRole('button', { name: '3. Share it', exact: true })).toHaveAttribute(
        'aria-current',
        'step',
      );
      await page.getByRole('button', { name: 'Open Share', exact: true }).click();
      const share = page.getByTestId('pane-body-publish');
      await expect(share.getByTestId('functions-section')).not.toBeVisible();
      await expect(share.getByText('Optional enhancements', { exact: true })).toBeVisible();
      await page.screenshot({ path: join(evidence, 'before-sharing.png') });
      const shareBox = (await share.boundingBox())!;
      const helpBox = (await share
        .getByRole('button', { name: 'What happens when I share?' })
        .boundingBox())!;
      await page.screenshot({
        path: join(illustrations, 'first-home-share.png'),
        clip: { ...shareBox, height: helpBox.y + helpBox.height + 12 - shareBox.y },
      });
      await share.getByText('Local test website (optional)', { exact: true }).click();
      await share.getByText('Test locally first', { exact: false }).click();
      await share
        .getByRole('button', { name: 'Publish to local test Garden', exact: true })
        .click();
      await expect(share.getByRole('button', { name: 'Open test website' })).toBeVisible({
        timeout: 8 * 60_000,
      });
      const staged = await page.evaluate(() => window.electronAPI!.staging!.list());
      const testSite = staged.find((site) => site.id === id)!;
      expect(await (await fetch(testSite.url)).text()).toContain('River Moss');
      expect(api.state.published[id]).toBeUndefined();
      await page.getByRole('button', { name: 'Share', exact: true }).click();
      await page.getByPlaceholder('email@example.com').fill('tester@example.com');
      await page.getByRole('button', { name: 'Send Code', exact: true }).click();
      await page.getByPlaceholder('Enter code').fill('123456');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      const backup = page
        .getByRole('dialog')
        .filter({ hasText: 'A published site is not a backup' });
      await backup
        .getByRole('button', { name: 'Share without a backup', exact: true })
        .click({ timeout: 60000 });
      await expect(page.getByText('Up to date')).toBeVisible({ timeout: 8 * 60_000 });
      const published = api.state.published[id]!;
      const html = Buffer.from(
        published.find((file) => file.path === 'index.html')!.bytes,
      ).toString('utf8');
      expect(html).toContain('River Moss');
      expect(html).not.toContain('Your first home page');
      expect(
        published.filter((file) => file.path.endsWith('.html')).map((file) => file.path),
      ).toEqual(['index.html']);
      expect(html).not.toContain('This page is yours to write');
      const config = JSON.parse(readFileSync(join(folder, 'src/config.json'), 'utf8'));
      expect(
        Buffer.from(published.find((file) => file.path === config.photo.slice(1))!.bytes),
      ).toEqual(photo);
      await expect(page.getByText('Your page has been shared.', { exact: false })).toBeVisible();
      expect(existsSync(join(folder, 'LICENSE'))).toBe(true);
      await page.screenshot({ path: join(evidence, 'shared.png') });
      await goHome(page);
      await expect(
        page.getByRole('button', { name: 'Open Hello, world', exact: true }),
      ).toHaveCount(1);
    } finally {
      await again.app.close();
    }
  } finally {
    await api.close();
  }
});
