import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';
import { outputs } from './game-cruxspace-helpers';

/**
 * The sketch tool (the actual p5.js, one page, a starter flow field) as a Crux
 * Tool: the sketch draws and its empty project saves; a person names it, sets
 * a seed and saves a frame from the bar; an edit to sketch.js restarts the
 * drawing; the scripted collaborator names it, sets the seed and saves a
 * frame; Share selected content publishes the page as it is; the sketch
 * survives a restart with its seed; a complete Crux archive imports into a
 * clean Garden with the folder gone.
 */
const frameOf = (page: Page) => page.frameLocator('iframe[data-crux-id]');
const status = (page: Page) => frameOf(page).locator('#garden-project [role=status]');
async function ready(page: Page) {
  await expect(status(page)).toHaveText('Saved to Garden', { timeout: 120000 });
  await expect(frameOf(page).locator('#stage canvas')).toBeVisible();
}
const framesOf = (page: Page) =>
  frameOf(page)
    .locator('#sketch-info')
    .evaluate((el) => Number(/(\d+) frames/.exec(el.textContent ?? '')?.[1] ?? 0));

test('Sketch: the flow field draws, a person seeds and saves a frame, an edit restarts it, the collaborator saves a frame, publish, restart and clean import', async () => {
  test.setTimeout(10 * 60_000);
  const api = await startMockApi();
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1', CRUX_API_URL: api.url } });
  const evidence = resolve(__dirname, '../../docs/p5');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'sketch.crux');
  let folder = '';
  let id = '';
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const errors: string[] = [];
  try {
    const { page } = first;
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);

    await test.step('create from the picker; the sketch draws and the empty project saves', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Sketch\b/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      await ready(page);
      await expect.poll(() => doc().project?.name ?? '').toBe('Sketch');
      await expect.poll(framesOf.bind(null, page), { timeout: 30000 }).toBeGreaterThan(30);
      await page.screenshot({ path: join(evidence, 'p5-initial.png') });
    });

    await test.step('a person names the sketch, sets a seed and saves a frame from the bar', async () => {
      await frameOf(page).locator('#sketch-name').fill('Flow field');
      await frameOf(page).locator('#sketch-seed').fill('42');
      await frameOf(page).locator('#sketch-seed').press('Enter');
      await ready(page);
      await expect.poll(() => doc().project?.seed).toBe(42);
      expect(doc().project.name).toBe('Flow field');
      await expect.poll(framesOf.bind(null, page), { timeout: 30000 }).toBeGreaterThan(30);
      await frameOf(page).locator('#output-name').fill('First frame');
      await frameOf(page).locator('#save-frame').click();
      await expect(status(page)).toContainText('Saved First frame as an image output', {
        timeout: 60000,
      });
      await expect.poll(() => outputs(folder).length).toBe(1);
      expect(outputs(folder)[0]!.mimeType).toBe('image/png');
      expect(
        readFileSync(join(folder, outputs(folder)[0]!.path))
          .subarray(1, 4)
          .toString(),
      ).toBe('PNG');
      await page.screenshot({ path: join(evidence, 'p5-seeded.png') });
    });

    await test.step('an edit to sketch.js on disk restarts the drawing with the new source', async () => {
      const source = readFileSync(join(folder, 'sketch.js'), 'utf8');
      writeFileSync(
        join(folder, 'sketch.js'),
        source.replace(
          'background(12, 10, 6);',
          'background(12, 10, 6);\n  document.title = "Edited sketch";',
        ),
      );
      await frameOf(page).getByRole('button', { name: 'Restart', exact: true }).click();
      await expect
        .poll(
          () =>
            frameOf(page)
              .locator('body')
              .evaluate(() => document.title),
          { timeout: 30000 },
        )
        .toBe('Edited sketch');
      await expect.poll(framesOf.bind(null, page), { timeout: 30000 }).toBeGreaterThan(10);
    });

    await test.step('the scripted collaborator names the sketch, sets the seed and saves a frame', async () => {
      const collab = page.getByRole('button', { name: 'Toggle collaboration' });
      if ((await collab.getAttribute('aria-pressed')) !== 'true') await collab.click();
      const box = page.getByPlaceholder('Send a message...');
      await box.fill('Make it windier [sketch:frame]');
      await box.press('Enter');
      await expect(
        page.getByText('Named the sketch Seven winds, set the seed to 7 and saved a frame.', {
          exact: true,
        }),
      ).toBeVisible({ timeout: 240000 });
      await ready(page);
      expect(doc().project.name).toBe('Seven winds');
      expect(doc().project.seed).toBe(7);
      await expect(frameOf(page).locator('#sketch-seed')).toHaveValue('7');
      const outs = outputs(folder);
      expect(outs.map((o) => o.label).sort()).toEqual(['First frame', 'Seven winds']);
      await collab.click();
      await page.screenshot({ path: join(evidence, 'p5-agent.png') });
    });

    await test.step('Share selected content publishes the page as it is', async () => {
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
          'sketch.js',
          'style.css',
          'runtime/p5.min.js',
          'garden/bridge.js',
        ]),
      );
      await page.screenshot({ path: join(evidence, 'p5-published.png') });
      await page.getByRole('button', { name: 'Toggle share' }).click();
    });
    expect(errors).toEqual([]);
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ dir: first.dir, env: { CRUX_API_URL: api.url } });
  try {
    const { page } = second;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.getByRole('button', { name: /enter/i }).click();
    await test.step('restart: the sketch comes back with its name, seed and outputs', async () => {
      await ready(page);
      await expect(frameOf(page).locator('#sketch-name')).toHaveValue('Seven winds');
      await expect(frameOf(page).locator('#sketch-seed')).toHaveValue('7');
      expect(outputs(folder).length).toBe(2);
      await page.screenshot({ path: join(evidence, 'p5-reopened.png') });
      await exportNativeCrux(page, archive, second.app);
    });
  } finally {
    await second.app.close();
    renameSync(folder, `${folder}-unavailable`);
  }

  const third = await launchApp({ env: { CRUX_API_URL: api.url } });
  try {
    const { page } = third;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);
    await test.step('clean Garden: the complete Crux imports and the sketch runs with its seed', async () => {
      await importNativeCrux(page, archive);
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      const importedId = (await page
        .locator('[data-workspace-id]')
        .getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, importedId)).projectFolder;
      await ready(page);
      await expect(frameOf(page).locator('#sketch-seed')).toHaveValue('7');
      await expect.poll(framesOf.bind(null, page), { timeout: 30000 }).toBeGreaterThan(10);
      expect(outputs(folder).length).toBe(2);
      await page.screenshot({ path: join(evidence, 'p5-imported.png') });
    });
  } finally {
    await third.app.close();
    await api.close();
  }
});
