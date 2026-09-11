import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
test('Piskel native drawing, frames, agent, PNG/GIF/project export and restart', async () => {
  test.setTimeout(180000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  let folder = '';
  const evidence = resolve(__dirname, '../../docs/piskel');
  mkdirSync(evidence, { recursive: true });
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const sprite = () => doc().project.piskel;
  let expectedAsset = '';
  try {
    const { page } = first;
    page.on('pageerror', (e) => console.log('Piskel error', e.message));
    await page.setViewportSize({ width: 1900, height: 1100 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Piskel/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 60000,
    });
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder;
    console.log('Piskel folder', folder);
    await expect(frame.locator('[data-tool-id=tool-pen]')).toHaveCSS(
      'background-image',
      /\/dest\/prod\/img\/icons/,
    );
    const initial = sprite().layers[0].chunks[0].base64PNG.__cruxBinary.path;
    await frame
      .locator('#drawing-canvas-container')
      .click({ position: { x: 180, y: 400 }, delay: 100 });
    await expect
      .poll(() => sprite().layers[0].chunks[0].base64PNG.__cruxBinary.path)
      .not.toBe(initial);
    await frame.locator('#add-frame-action').click();
    await expect.poll(() => sprite().layers[0].frameCount).toBe(2);
    await frame
      .locator('#drawing-canvas-container')
      .click({ position: { x: 220, y: 450 }, delay: 100 });
    const chat = page.getByPlaceholder('Send a message...');
    await chat.fill('Set a slower animation [piskel:speed]');
    await chat.press('Enter');
    await expect.poll(() => sprite().fps, { timeout: 45000 }).toBe(8);
    async function download(selector: string, extension: string) {
      const path = join(first.dir, 'sprite.' + extension);
      await first.app.evaluate(({ session }, path) => {
        (globalThis as any).__piskelDownload = null;
        session.defaultSession.once('will-download', (_e, item) => {
          item.setSavePath(path);
          item.once('done', (_e, state) => {
            (globalThis as any).__piskelDownload = state;
          });
        });
      }, path);
      await frame.locator(selector).click();
      await expect
        .poll(() => first.app.evaluate(() => (globalThis as any).__piskelDownload))
        .toBe('completed');
      return path;
    }
    await frame.locator('[data-setting=save]').click();
    await frame.locator('#save-name').fill('Garden sprite');
    const nativeFile = await download('#save-file-download-button', 'piskel');
    const native = JSON.parse(readFileSync(nativeFile, 'utf8'));
    expect(native.piskel.fps).toBe(8);
    expect(JSON.parse(native.piskel.layers[0]).frameCount).toBe(2);
    await expect.poll(() => sprite().name).toBe('Garden sprite');
    await frame.locator('[data-setting=export]').click();
    await frame.locator('[data-tab-id=png]').click();
    const png = readFileSync(await download('.png-download-button', 'png'));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    await frame.locator('[data-tab-id=gif]').click();
    const gif = readFileSync(await download('.gif-download-button', 'gif'));
    expect(gif.subarray(0, 3).toString()).toBe('GIF');
    await frame.locator('[data-setting=import]').click();
    native.piskel.name = 'Imported sprite';
    writeFileSync(nativeFile, JSON.stringify(native));
    await frame.locator('input[name=open-piskel-input]').setInputFiles(nativeFile);
    page.once('dialog', (d) => d.accept());
    await frame.getByRole('button', { name: 'Replace', exact: true }).click();
    await expect.poll(() => sprite().name).toBe('Imported sprite');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden');
    const external = doc();
    external.project.piskel.name = 'External sprite';
    writeFileSync(join(folder, 'data/project.json'), JSON.stringify(external));
    await frame.locator('#add-frame-action').click();
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toContainText('changed elsewhere');
    expect(sprite().name).toBe('External sprite');
    page.once('dialog', (d) => d.accept());
    await frame.getByRole('button', { name: 'Reload saved project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden');
    await expect(frame.locator('#preview-list .tile-count')).toHaveCount(2);
    expectedAsset = sprite().layers[0].chunks[0].base64PNG.__cruxBinary.path;
    await expect(frame.locator('#loading-mask')).toHaveCount(0);
    await page.screenshot({ path: join(evidence, 'piskel-workshop.png') });
  } finally {
    await first.app.close();
  }
  const second = await launchApp({ dir: first.dir, env: { CRUX_AI_MOCK: '1' } });
  try {
    await second.page.setViewportSize({ width: 1900, height: 1100 });
    await second.page.getByRole('button', { name: /enter/i }).click();
    const frame = second.page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 60000,
    });
    await expect(frame.locator('#preview-list .tile-count')).toHaveCount(2);
    expect(sprite().fps).toBe(8);
    expect(sprite().name).toBe('External sprite');
    expect(sprite().layers[0].chunks[0].base64PNG.__cruxBinary.path).toBe(expectedAsset);
    await frame.locator('[data-setting=save]').click();
    await expect(frame.locator('#save-name')).toHaveValue('External sprite');
    await frame.locator('[data-setting=save]').click();
    await expect(frame.locator('#save-name')).not.toBeInViewport();
    await second.page.screenshot({ path: join(evidence, 'piskel-reopened.png') });
  } finally {
    await second.app.close();
  }
});
