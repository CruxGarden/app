import { test, expect, type Page } from '@playwright/test';
import { cpSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { launchApp } from './launch';
import { enterGarden, createCrux, storedCrux, storedFingerprint } from './multi-crux-helpers';
import { newTaskButton, openPanel, togglePanel } from './panel-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';
const title = 'Crux Garden: The Zen of Vibecoding';
const source = resolve(__dirname, '../../examples/zen-vibecoding');
const delivery = process.env.CRUX_ZEN_DELIVERY ?? join(tmpdir(), 'crux-zen-delivery');
const archive = join(delivery, 'Crux Garden - The Zen of Vibecoding.crux');
async function preview(page: Page) {
  await openPanel(page, 'artifacts', 'Toggle artifacts');
  await page.getByRole('tree').getByText('index.html', { exact: true }).click();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  // Keep Workshop usable after Task controls and archive export opened panes.
  for (const panel of ['export', 'collaboration', 'artifacts']) {
    if (await page.getByTestId(`pane-body-${panel}`).isVisible())
      await togglePanel(page, `Toggle ${panel}`);
  }
  await page.getByRole('button', { name: 'Clean', exact: true }).click();
  const frame = page.frameLocator('iframe[data-crux-id]').first();
  await expect(frame.getByRole('heading', { name: 'Plant one small idea' })).toBeVisible();
  return frame;
}

test.describe.serial('Zen of Vibecoding', () => {
  test('real Task isolation, validation, review/merge, journal and portable export', async () => {
    test.setTimeout(180_000);
    mkdirSync(delivery, { recursive: true });
    const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    try {
      await enterGarden(page);
      const main = await createCrux(page, title);
      const { projectFolder } = await storedCrux(page, main);
      for (const path of [
        'index.html',
        'style.css',
        'app.mjs',
        'missions.mjs',
        'README.md',
        'garden',
      ])
        cpSync(join(source, path), join(projectFolder, path), { recursive: true });
      await expect.poll(() => storedFingerprint(page, main, 'missions.mjs')).toBeTruthy();
      const frame = await preview(page);
      await frame.getByRole('button', { name: 'Check my garden', exact: true }).click();
      await expect(frame.getByRole('status').first()).toContainText('garden/seed.json');
      // Export the untouched adventure through the actual product flow, before
      // fixture output is added. Users receive a fresh game, not a completed demo.
      await exportNativeCrux(page, archive, app, async () => {
        await openPanel(page, 'export', 'Toggle export');
      });
      await (await newTaskButton(page)).click();
      await page.getByRole('textbox', { name: 'Task name', exact: true }).fill('Plant a seed');
      await page.getByRole('button', { name: 'Save and start task' }).click();
      await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
      const task = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      // Only the provider is scripted. The real Collaboration turn runs the
      // write_file tool and reports back while the player visits Main.
      await openPanel(page, 'collaboration', 'Toggle collaboration');
      await page.evaluate(() => {
        document.documentElement.dataset.seedPaused = '';
        window.addEventListener(
          'crux:mock-pause',
          () => {
            document.documentElement.dataset.seedPaused = 'yes';
          },
          { once: true },
        );
      });
      const input = page
        .getByTestId('pane-body-collaboration')
        .getByPlaceholder('Send a message...');
      await input.fill('[zen:seed] Plant Mosslight in garden/seed.json');
      await input.press('Enter');
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.seedPaused))
        .toBe('yes');
      await page.getByTestId('task-bar').getByRole('link', { name: 'Main', exact: true }).click();
      const seedTask = page.getByTestId('task-bar').getByRole('link', { name: /^Plant a seed/ });
      await expect(seedTask).toContainText('Working');
      await page.evaluate(() => window.dispatchEvent(new Event('crux:mock-continue')));
      await expect.poll(() => storedFingerprint(page, task, 'garden/seed.json')).toBeTruthy();
      await expect(seedTask).not.toContainText('Working');
      await expect(page.getByText(/^Seed turn returned:/)).toHaveCount(0);
      const mainFrame = await preview(page);
      await mainFrame.getByRole('button', { name: 'Check my garden', exact: true }).click();
      await expect(mainFrame.getByRole('status').first()).toContainText('Not in this preview yet');
      await page
        .getByTestId('task-bar')
        .getByRole('link', { name: /^Plant a seed/ })
        .click();
      await openPanel(page, 'collaboration', 'Toggle collaboration');
      await expect(page.getByText(/^Seed turn returned:/)).toBeVisible();
      await page.getByRole('button', { name: 'Review changes', exact: true }).click();
      const review = page.getByRole('dialog', { name: 'Review changes for Main' });
      await review.getByRole('button', { name: 'Check combined result' }).click();
      await expect(review.getByRole('checkbox')).toBeEnabled();
      await review.getByRole('checkbox').check();
      await review.getByRole('button', { name: 'Merge into Main', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', main);
      const merged = await preview(page);
      await merged.getByRole('checkbox').check();
      await merged.getByRole('button', { name: 'Check my garden', exact: true }).click();
      await expect(merged.getByRole('status').first()).toContainText('Files checked.');
      await expect(merged.locator('#garden-name')).toHaveText('Mosslight');
      await merged.getByRole('button', { name: 'Field journal', exact: true }).click();
      await merged
        .getByLabel('What happened? What would help?')
        .fill('Scripted test: Task was separate; merge brought the seed home.');
      await merged.getByRole('button', { name: 'Keep this observation' }).click();
      await expect(merged.getByRole('status').last()).toContainText('Observation saved');
      await merged.getByRole('button', { name: 'Close journal' }).click();
      await page.screenshot({ path: join(delivery, 'zen-first-seed.png') });
      // Invalid actual file content must revoke the file-based completion.
      writeFileSync(join(projectFolder, 'garden/seed.json'), '<html>not JSON</html>');
      await merged.getByRole('button', { name: 'Check my garden', exact: true }).click();
      await expect(merged.getByRole('status').first()).toContainText('not valid JSON');
      await expect(merged.getByRole('button', { name: 'Next stepping stone →' })).toBeHidden();
      expect(readFileSync(archive).subarray(0, 2).toString()).toBe('PK');
    } finally {
      await app.close();
    }
  });

  test('fresh archive imports with unplayed missions and preserved practice leaf', async () => {
    if (process.env.CRUX_ZEN_PROFILE && existsSync(process.env.CRUX_ZEN_PROFILE))
      throw new Error(
        'CRUX_ZEN_PROFILE must name a new isolated profile. Existing data is preserved.',
      );
    const { app, page } = await launchApp({
      ...(process.env.CRUX_ZEN_PROFILE ? { dir: process.env.CRUX_ZEN_PROFILE } : {}),
      ai: false,
    });
    try {
      await enterGarden(page);
      await importNativeCrux(page, archive);
      const frame = await preview(page);
      await expect(frame.locator('#completion')).toHaveText('0 / 6 milestones');
      await frame.getByRole('button', { name: 'Check my garden', exact: true }).click();
      await expect(frame.getByRole('status').first()).toContainText('garden/seed.json');
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      const { projectFolder } = await storedCrux(page, id);
      expect(readFileSync(join(projectFolder, 'garden/practice-leaf.txt'), 'utf8')).toContain(
        'Keep it',
      );
      writeFileSync(
        join(delivery, 'installed-game.json'),
        JSON.stringify(
          { id, profile: process.env.CRUX_ZEN_PROFILE ?? 'temporary test profile' },
          null,
          2,
        ),
      );
      await frame.locator('body').evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: join(delivery, 'zen-ready.png') });
    } finally {
      await app.close();
    }
  });
});
