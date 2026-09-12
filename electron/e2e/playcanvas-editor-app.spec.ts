import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';
declare const editor: any;
declare const pc: any;

test('PlayCanvas native editing, source, agent, launch and independent complete Crux import', async () => {
  test.setTimeout(420000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const evidence = resolve(__dirname, '../../docs/playcanvas-editor');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'scene.crux');
  let folder = '';
  const document = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const state = (key: string) =>
    JSON.parse(
      readFileSync(join(folder, 'data', document().project[key].__cruxBinary.path), 'utf8'),
    );
  const ready = async (page: Page) => {
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 90000,
    });
    return frame;
  };
  const runScene = async (page: Page) => {
    const frame = await ready(page);
    await frame.getByRole('button', { name: 'Launch scene', exact: true }).click();
    const running = frame.frameLocator('iframe[title="Running scene"]');
    await expect(running.locator('[role=status]')).toHaveText('Running scene');
    expect(
      await running.locator('canvas').evaluate(() => {
        const cube = pc.Application.getApplication().root.findByName('Agent cube');
        return { scale: cube.getLocalScale().toArray(), script: !!cube.script.spin };
      }),
    ).toEqual({ scale: [3, 3, 3], script: true });
    await page.screenshot({ path: join(evidence, 'playcanvas-running.png') });
    await frame.getByRole('button', { name: 'Close preview' }).click();
  };
  try {
    const { page } = first;
    await page.setViewportSize({ width: 1800, height: 1200 });
    page.on('console', (message) => {
      if (message.type() === 'error') console.log('APP:', message.text(), message.location());
    });
    page.on('requestfailed', (request) => console.log('FAILED:', request.url(), request.failure()));
    page.on('pageerror', (error) => console.log('PAGE:', error.message));
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    await page.getByRole('button', { name: /^PlayCanvas Editor/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 45000 });
    const frame = await ready(page);
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder;
    await frame.getByText('Cube', { exact: true }).click();
    const name = frame
      .getByText('Name', { exact: true })
      .locator('..')
      .locator('input:not([readonly])');
    await name.fill('Garden Cube');
    await name.press('Enter');
    const position = frame
      .getByText('Position', { exact: true })
      .locator('..')
      .locator('input')
      .first();
    await position.fill('2');
    await position.press('Enter');
    await frame.locator('[data-toolbar-id="undo"]').click();
    await expect(position).toHaveValue('0');
    await frame.locator('[data-toolbar-id="redo"]').click();
    await expect(position).toHaveValue('2');
    const chooser = page.waitForEvent('filechooser');
    await frame.locator('body').evaluate(() => editor.call('assets:upload:picker'));
    await (
      await chooser
    ).setFiles(resolve(__dirname, '../../playcanvas-editor-crux/test-suite/images/playwright.png'));
    await frame.getByTitle('playwright.png', { exact: true }).waitFor();
    await frame.locator('body').evaluate(async () => {
      const asset = await editor.assets.createScript({ filename: 'spin.js' });
      editor.call('picker:codeeditor', asset.observer);
    });
    const code = frame.getByRole('dialog', { name: 'Edit asset code' });
    const input = code.locator('textarea').first();
    await input.focus();
    await input.press('ControlOrMeta+A');
    await page.keyboard.insertText(
      "var Spin = pc.createScript('spin');\nSpin.prototype.initialize = function() { this.entity.setLocalScale(3,3,3); };\nSpin.prototype.update = function(dt) { this.entity.rotateLocal(0,30*dt,0); };",
    );
    await code.getByRole('button', { name: 'Save code', exact: true }).click();
    await expect(code.getByRole('status')).toHaveText('Saved code');
    await code.getByRole('button', { name: 'Close code editor' }).click();
    await expect(code).not.toBeVisible();
    await frame.locator('body').evaluate(() =>
      editor.entities.get('44444444-4444-4444-8444-444444444444').set('components.script', {
        enabled: true,
        order: ['spin'],
        scripts: { spin: { enabled: true, attributes: {} } },
      }),
    );
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect
      .poll(() => state('scene').entities['44444444-4444-4444-8444-444444444444'].position)
      .toEqual([2, 0.5, 0]);
    const chat = page.getByPlaceholder('Send a message...');
    await chat.fill('Name this scene [playcanvas:rename]');
    await chat.press('Enter');
    await expect.poll(() => state('name'), { timeout: 45000 }).toBe('Garden scene');
    await expect
      .poll(() => state('scene').entities['44444444-4444-4444-8444-444444444444'].name)
      .toBe('Agent cube');
    await runScene(page);
    await page.screenshot({ path: join(evidence, 'playcanvas-workshop.png') });
    await exportNativeCrux(page, archive, first.app);
  } finally {
    await first.app.close();
  }
  const originalFolder = folder;
  renameSync(originalFolder, originalFolder + '-unavailable');
  const second = await launchApp();
  try {
    await enterGarden(second.page);
    await importNativeCrux(second.page, archive);
    const frame = await ready(second.page);
    const id = (await second.page
      .locator('[data-workspace-id]')
      .getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(second.page, id)).projectFolder;
    expect(folder).not.toBe(originalFolder);
    console.log('PlayCanvas imported Project Folder:', folder);
    const imageAsset = (Object.values(state('assets')) as any[]).find(
      (asset) => asset.name === 'playwright.png',
    );
    const imageRef = document().project['file-' + imageAsset.id].__cruxBinary;
    expect(readFileSync(join(folder, 'data', imageRef.path))).toEqual(
      readFileSync(
        resolve(__dirname, '../../playcanvas-editor-crux/test-suite/images/playwright.png'),
      ),
    );

    await runScene(second.page);
    await frame.getByText('Agent cube', { exact: true }).click();
    const position = frame
      .getByText('Position', { exact: true })
      .locator('..')
      .locator('input')
      .first();
    await position.fill('1');
    await position.press('Enter');
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect
      .poll(() => state('scene').entities['44444444-4444-4444-8444-444444444444'].position)
      .toEqual([1, 0.5, 0]);
    await second.page.screenshot({ path: join(evidence, 'playcanvas-imported.png') });
  } finally {
    await second.app.close();
    renameSync(originalFolder + '-unavailable', originalFolder);
  }
});
