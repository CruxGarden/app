import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';
import { outputs } from './game-cruxspace-helpers';

/**
 * The Model tool (the actual JSCAD web application) as a Crux Tool: the starter
 * stone evaluates and its source saves; a person edits the code in JSCAD's
 * editor and saves an STL from the bar; the scripted collaborator names the
 * model, replaces the source and saves a 3MF; Share publishes the page with
 * the bundle and examples; the model survives a restart; a complete Crux
 * archive imports into a clean Garden.
 */
const frameOf = (page: Page) => page.frameLocator('iframe[data-crux-id]');
const status = (page: Page) => frameOf(page).locator('#garden-project [role=status]');
async function ready(page: Page) {
  await expect(status(page)).toHaveText('Saved to Garden', { timeout: 180000 });
  await expect(frameOf(page).locator('#jscad canvas').first()).toBeVisible();
  await expect(frameOf(page).locator('#errormessage')).toHaveCount(0);
}

test('Model: the stone evaluates and saves, a person edits and saves an STL, the collaborator models a coaster and a 3MF, share, restart, clean import', async () => {
  test.setTimeout(15 * 60_000);
  const api = await startMockApi();
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1', CRUX_API_URL: api.url } });
  const evidence = resolve(__dirname, '../../docs/jscad');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'model.crux');
  let folder = '';
  let id = '';
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const errors: string[] = [];
  try {
    const { page } = first;
    page.setDefaultTimeout(60000);
    page.on('console', (message) => {
      if (message.type() === 'error' || message.text().includes('[garden]'))
        console.log(
          `[renderer ${message.type()}] ${message.text().slice(0, 500)} ${message.location().url}`,
        );
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1700, height: 1050 });
    await enterGarden(page);

    await test.step('create from the picker; the stone evaluates and the starter saves', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Model\b/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      await ready(page);
      await expect.poll(() => doc().project?.name ?? '').toBe('Model');
      expect(doc().project.source).toContain('Moss Stone');
      await expect(frameOf(page).locator('.CodeMirror')).toBeVisible();
      await expect(frameOf(page).locator('#exportFormats option[value="stlb"]')).toHaveCount(1);
      await page.screenshot({ path: join(evidence, 'jscad-initial.png') });
    });

    await test.step('a person names the model, edits the code in JSCAD’s editor and saves an STL', async () => {
      const frame = frameOf(page);
      await frame.locator('#model-name').fill('Moss Stone');
      await frame.locator('.CodeMirror').click();
      await page.keyboard.press('Meta+ArrowUp');
      await page.keyboard.press('Home');
      await page.keyboard.type('// a stone for the garden path\n');
      await page.keyboard.press('Shift+Enter');
      await ready(page);
      await expect.poll(() => doc().project?.source ?? '').toContain('a stone for the garden path');
      expect(doc().project.name).toBe('Moss Stone');
      await frame.locator('#output-name').fill('Stone, print');
      await frame.locator('#save-model').click();
      await expect(status(page)).toContainText('Saved Stone, print as a STL output', {
        timeout: 120000,
      });
      await expect.poll(() => outputs(folder).length).toBe(1);
      const [stl] = outputs(folder);
      expect(stl!.mimeType).toBe('model/stl');
      expect(stl!.path).toMatch(/\.stl$/);
      expect(stl!.size).toBeGreaterThan(1000);
      await page.screenshot({ path: join(evidence, 'jscad-edited.png') });
    });

    await test.step('the scripted collaborator names it, models a coaster and saves a 3MF', async () => {
      const collab = page.getByRole('button', { name: 'Toggle collaboration' });
      if ((await collab.getAttribute('aria-pressed')) !== 'true') await collab.click();
      const box = page.getByPlaceholder('Send a message...');
      await box.fill('Model me a coaster [model:coaster]');
      await box.press('Enter');
      await expect(
        page.getByText(
          'Named the model Moss Coaster, wrote a hexagonal coaster with a leaf groove and saved a 3MF of it.',
          {
            exact: true,
          },
        ),
      ).toBeVisible({ timeout: 8 * 60_000 });
      await ready(page);
      expect(doc().project.name).toBe('Moss Coaster');
      expect(doc().project.source).toContain('hexagon');
      await expect.poll(() => outputs(folder).length).toBe(2);
      const threemf = outputs(folder).find((o) => o.label === 'Moss Coaster')!;
      expect(threemf.mimeType).toBe('model/3mf');
      expect(readFileSync(join(folder, threemf.path)).subarray(0, 2).toString()).toBe('PK');
      await collab.click();
      await page.screenshot({ path: join(evidence, 'jscad-agent.png') });
    });

    await test.step('Share publishes the page with the bundle and the examples', async () => {
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
          'model.js',
          'dist/jscad-web.min.js',
          'css/codemirror.css',
          'examples/examples.json',
          'garden/bridge.js',
          'data/project.json',
        ]),
      );
      await page.screenshot({ path: join(evidence, 'jscad-published.png') });
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
    await page.setViewportSize({ width: 1700, height: 1050 });
    await page.getByRole('button', { name: /enter/i }).click();
    await test.step('restart: the coaster comes back in the editor with its outputs', async () => {
      await ready(page);
      await expect(frameOf(page).locator('#model-name')).toHaveValue('Moss Coaster');
      await expect(frameOf(page).locator('.CodeMirror')).toContainText('hexagon');
      expect(outputs(folder).length).toBe(2);
      await page.screenshot({ path: join(evidence, 'jscad-reopened.png') });
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
    await page.setViewportSize({ width: 1700, height: 1050 });
    await enterGarden(page);
    await test.step('clean Garden: the complete Crux imports and the coaster evaluates', async () => {
      await importNativeCrux(page, archive);
      const importedId = (await page
        .locator('[data-workspace-id]')
        .getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, importedId)).projectFolder;
      await ready(page);
      await expect(frameOf(page).locator('#model-name')).toHaveValue('Moss Coaster');
      expect(outputs(folder).length).toBe(2);
      await page.screenshot({ path: join(evidence, 'jscad-imported.png') });
    });
  } finally {
    await third.app.close();
    await api.close();
  }
});
