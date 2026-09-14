import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { outputs } from './game-cruxspace-helpers';

/**
 * The Whiteboard follow-up (CREATION-ADDITIONS-PLAN.md item 1): the drawing
 * renders into Cruxspace outputs from the bar and from the collaborator, and
 * Share publishes it as a page in Excalidraw's view mode.
 */
test('Whiteboard: PNG and SVG outputs, and the drawing shares as a view-mode page', async () => {
  test.setTimeout(8 * 60_000);
  const api = await startMockApi();
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1', CRUX_API_URL: api.url } });
  const evidence = resolve(__dirname, '../../docs/whiteboard');
  mkdirSync(evidence, { recursive: true });
  let folder = '';
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const errors: string[] = [];
  try {
    const { page } = first;
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1600, height: 1050 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Whiteboard/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder;
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#editor')).toHaveAttribute('data-ready', 'true', {
      timeout: 60000,
    });
    await expect(frame.locator('#save-state')).toHaveText('Saved in this Crux', { timeout: 45000 });
    expect(doc().scene.elements.length).toBeGreaterThan(0);

    await test.step('a person saves a PNG from the bar', async () => {
      await frame.getByRole('button', { name: 'Save PNG to Cruxspace' }).click();
      await expect(frame.locator('#output-state')).toContainText('as an image output', {
        timeout: 60000,
      });
      await expect.poll(() => outputs(folder).length).toBe(1);
      const [png] = outputs(folder);
      expect(png!.mimeType).toBe('image/png');
      expect(readFileSync(join(folder, png!.path)).subarray(1, 4).toString()).toBe('PNG');
      await page.screenshot({ path: join(evidence, 'whiteboard-output.png') });
    });

    await test.step('the scripted collaborator saves an SVG', async () => {
      await page.getByRole('button', { name: 'Ask agent', exact: true }).click();
      await page
        .getByPlaceholder('Send a message...')
        .fill('Keep a vector copy [whiteboard:image]');
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(
        page.getByText('Saved the whiteboard as an SVG output.', { exact: true }),
      ).toBeVisible({
        timeout: 120000,
      });
      await expect.poll(() => outputs(folder).length).toBe(2);
      const svg = outputs(folder).find((o) => o.label === 'Idea map, vector')!;
      expect(svg.mimeType).toBe('image/svg+xml');
      expect(readFileSync(join(folder, svg.path), 'utf8')).toContain('<svg');
    });

    await test.step('Share publishes the drawing page with Excalidraw', async () => {
      await page
        .getByTestId('workshop-view')
        .getByRole('button', { name: 'Share selected content', exact: true })
        .click();
      const share = page.getByTestId('pane-body-publish');
      await share.getByRole('button', { name: 'Share selected content', exact: true }).click();
      await page.getByPlaceholder('email@example.com').fill('tester@example.com');
      await page.getByRole('button', { name: 'Send Code', exact: true }).click();
      await page.getByPlaceholder('Enter code').fill('123456');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      const backupAsk = page
        .getByRole('dialog')
        .filter({ hasText: 'A published site is not a backup' });
      await expect(backupAsk).toBeVisible({ timeout: 60000 });
      await backupAsk.getByRole('button', { name: 'Share without a backup', exact: true }).click();
      await expect(share.getByText(/^(Up to date|Changes to share)$/)).toBeVisible({
        timeout: 6 * 60_000,
      });
      const paths = (api.state.published[id] ?? []).map((f) => f.path);
      expect(paths).toEqual(
        expect.arrayContaining([
          'index.html',
          'app.js',
          'vendor/engine.js',
          'shared/session.js',
          'data/project.json',
        ]),
      );
      await page.screenshot({ path: join(evidence, 'whiteboard-published.png') });
    });
    expect(errors).toEqual([]);
  } finally {
    await first.app.close();
    await api.close();
  }
});
