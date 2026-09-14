import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';
import { outputs } from './game-cruxspace-helpers';

/**
 * The shader tool (the actual glslEditor, one page, rings of light to start)
 * as a Crux Tool: the editor compiles the shader live and the empty project
 * saves; a person names it, edits the source in the editor and saves a frame
 * from the bar; the scripted collaborator names it, replaces the source and
 * saves a frame; Share selected content publishes the page as it is; the
 * shader survives a restart; a complete Crux archive imports into a clean
 * Garden with the folder gone.
 */
const frameOf = (page: Page) => page.frameLocator('iframe[data-crux-id]');
const status = (page: Page) => frameOf(page).locator('#garden-project [role=status]');
async function ready(page: Page) {
  await expect(status(page)).toHaveText('Saved to Garden', { timeout: 120000 });
  await expect(frameOf(page).locator('#glsl_editor canvas')).toBeVisible();
  await expect(frameOf(page).locator('.CodeMirror')).toBeVisible();
}

test('Shader: rings of light compile, a person edits and saves a frame, the collaborator rewrites it, publish, restart and clean import', async () => {
  test.setTimeout(10 * 60_000);
  const api = await startMockApi();
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1', CRUX_API_URL: api.url } });
  const evidence = resolve(__dirname, '../../docs/glsl');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'shader.crux');
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

    await test.step('create from the picker; the shader compiles and the starter saves', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Shader\b/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      await ready(page);
      await expect.poll(() => doc().project?.name ?? '').toBe('Shader');
      expect(doc().project.source).toContain('void main()');
      await expect(frameOf(page).locator('#shader-info')).not.toContainText('does not compile');
      await page.screenshot({ path: join(evidence, 'glsl-initial.png') });
    });

    await test.step('a person names the shader, edits the source in the editor and saves a frame', async () => {
      await frameOf(page).locator('#shader-name').fill('Rings');
      const cm = frameOf(page).locator('.CodeMirror');
      await cm.click();
      await frameOf(page)
        .locator('.CodeMirror')
        .evaluate((el) => {
          const editor = (
            el as unknown as { CodeMirror: { setValue(v: string): void; getValue(): string } }
          ).CodeMirror;
          editor.setValue(
            editor.getValue().replace('vec3(0.37, 0.83, 0.70)', 'vec3(0.90, 0.40, 0.55)'),
          );
        });
      await ready(page);
      await expect.poll(() => doc().project?.source ?? '').toContain('vec3(0.90, 0.40, 0.55)');
      expect(doc().project.name).toBe('Rings');
      await frameOf(page).locator('#output-name').fill('Pink rings');
      await frameOf(page).locator('#save-frame').click();
      await expect(status(page)).toContainText('Saved Pink rings as an image output', {
        timeout: 60000,
      });
      await expect.poll(() => outputs(folder).length).toBe(1);
      expect(
        readFileSync(join(folder, outputs(folder)[0]!.path))
          .subarray(1, 4)
          .toString(),
      ).toBe('PNG');
      await page.screenshot({ path: join(evidence, 'glsl-edited.png') });
    });

    await test.step('the scripted collaborator names the shader, replaces its source and saves a frame', async () => {
      const collab = page.getByRole('button', { name: 'Toggle collaboration' });
      if ((await collab.getAttribute('aria-pressed')) !== 'true') await collab.click();
      const box = page.getByPlaceholder('Send a message...');
      await box.fill('Make it warmer [shader:tweak]');
      await box.press('Enter');
      await expect(
        page.getByText(
          'Named the shader Warm rings, replaced its source with warmer rings and saved a frame.',
          { exact: true },
        ),
      ).toBeVisible({ timeout: 240000 });
      await ready(page);
      expect(doc().project.name).toBe('Warm rings');
      expect(doc().project.source).toContain('vec3(1.0, 0.6, 0.2)');
      await expect(frameOf(page).locator('#shader-info')).not.toContainText('does not compile');
      expect(
        outputs(folder)
          .map((o) => o.label)
          .sort(),
      ).toEqual(['Pink rings', 'Warm rings']);
      await collab.click();
      await page.screenshot({ path: join(evidence, 'glsl-agent.png') });
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
          'style.css',
          'runtime/glslEditor.min.js',
          'runtime/glslEditor.css',
          'garden/bridge.js',
          'data/project.json',
        ]),
      );
      await page.screenshot({ path: join(evidence, 'glsl-published.png') });
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
    await test.step('restart: the shader comes back with its name, source and outputs', async () => {
      await ready(page);
      await expect(frameOf(page).locator('#shader-name')).toHaveValue('Warm rings');
      await expect(frameOf(page).locator('.CodeMirror')).toContainText('1.0, 0.6, 0.2');
      expect(outputs(folder).length).toBe(2);
      await page.screenshot({ path: join(evidence, 'glsl-reopened.png') });
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
    await test.step('clean Garden: the complete Crux imports and the shader compiles', async () => {
      await importNativeCrux(page, archive);
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      const importedId = (await page
        .locator('[data-workspace-id]')
        .getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, importedId)).projectFolder;
      await ready(page);
      await expect(frameOf(page).locator('#shader-name')).toHaveValue('Warm rings');
      await expect(frameOf(page).locator('#shader-info')).not.toContainText('does not compile');
      expect(outputs(folder).length).toBe(2);
      await page.screenshot({ path: join(evidence, 'glsl-imported.png') });
    });
  } finally {
    await third.app.close();
    await api.close();
  }
});
