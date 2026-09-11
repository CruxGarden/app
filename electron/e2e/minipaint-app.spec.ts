import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';

test('miniPaint: native import, layer edit, agent, export, conflict and restart', async () => {
  test.setTimeout(180000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  let folder = '';
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const evidence = resolve(__dirname, '../../docs/minipaint');
  mkdirSync(evidence, { recursive: true });
  try {
    const { page } = first;
    page.on('pageerror', (e) => console.log('miniPaint error:', e.message));
    await page.setViewportSize({ width: 1700, height: 1100 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^miniPaint/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 60000,
    });
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder;
    console.log('miniPaint folder', folder);
    await frame.getByText('File', { exact: true }).first().click();
    await frame.getByText('Open', { exact: true }).first().click();
    await frame.getByText('Open File', { exact: false }).first().click();
    await frame
      .locator('#file_open')
      .setInputFiles(resolve(__dirname, '../../tool-cruxes/openmosh/assets/demo.png'));
    await expect.poll(() => doc().project?.layers.some((l: any) => l.type === 'image')).toBe(true);
    await frame.locator('.layer_name').filter({ hasText: /demo/ }).dblclick();
    await page.screenshot({ path: join(evidence, 'minipaint-edit.png') });
    // Native layer rename dialog.
    await frame.locator('.popup input[type=text]').fill('Hand edited artwork');
    await frame.getByRole('button', { name: 'Ok', exact: true }).click();
    await expect
      .poll(() => doc().project.layers.some((l: any) => l.name === 'Hand edited artwork'))
      .toBe(true);
    const chat = page.getByPlaceholder('Send a message...');
    await chat.fill('Rename the image and set opacity [minipaint:layer]');
    await chat.press('Enter');
    await expect(page.getByText('Saved the native miniPaint layer.', { exact: true })).toBeVisible({
      timeout: 45000,
    });
    await expect
      .poll(() => doc().project.layers.find((l: any) => l.type === 'image').opacity)
      .toBe(65);
    const native = await frame
      .locator('body')
      .evaluate(() => JSON.parse((window as any).FileSave.export_as_json()));
    expect(native.layers.find((l: any) => l.type === 'image').name).toBe('Garden artwork');
    expect(native.data[0].data).toMatch(/^data:image\/png;base64,/);
    async function nativeDownload(menu: RegExp, name: string) {
      const path = join(first.dir, name);
      await first.app.evaluate(({ session }, path) => {
        (globalThis as any).__miniPaintDownload = null;
        session.defaultSession.once('will-download', (_event, item) => {
          item.setSavePath(path);
          item.once('done', (_event, state) => {
            (globalThis as any).__miniPaintDownload = state;
          });
        });
      }, path);
      await frame.getByText('File', { exact: true }).first().click();
      await frame.getByText(menu).first().click();
      await frame.getByRole('button', { name: 'Ok', exact: true }).click();
      await expect
        .poll(() => first.app.evaluate(() => (globalThis as any).__miniPaintDownload))
        .toBe('completed');
      return readFileSync(path);
    }
    const exported = JSON.parse((await nativeDownload(/^Save As/, 'layers.json')).toString());
    expect(exported.layers.find((l: any) => l.type === 'image').opacity).toBe(65);
    expect(exported.data[0].data).toMatch(/^data:image\/png;base64,/);
    expect((await nativeDownload(/^Export/, 'image.png')).subarray(1, 4).toString()).toBe('PNG');
    const raster = doc().project.data[0].data.__cruxBinary.path;
    expect(
      readFileSync(join(folder, 'data', raster))
        .subarray(1, 4)
        .toString(),
    ).toBe('PNG');
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden');
    const external = doc();
    external.project.layers.find((l: any) => l.type === 'image').name = 'External edit';
    writeFileSync(join(folder, 'data/project.json'), JSON.stringify(external));
    // Exercise the native undo path, preserving the external saved version.
    await frame.locator('body').press('Control+z');
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toContainText('changed elsewhere');
    expect(doc().project.layers.find((l: any) => l.type === 'image').name).toBe('External edit');
    page.once('dialog', (d) => d.accept());
    await frame.getByRole('button', { name: 'Reload saved project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden');
    await expect(frame.locator('.layer_name').filter({ hasText: 'External edit' })).toBeVisible();
    await frame.getByRole('button', { name: 'Fit', exact: true }).click();
    await expect(frame.locator('#mouse_info_size')).toHaveText('960 x 640');
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden');
    await page.screenshot({ path: join(evidence, 'minipaint-workshop.png') });
  } finally {
    await first.app.close();
  }
  const second = await launchApp({ dir: first.dir, env: { CRUX_AI_MOCK: '1' } });
  try {
    await second.page.setViewportSize({ width: 1700, height: 1100 });
    await second.page.getByRole('button', { name: /enter/i }).click();
    const frame = second.page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 60000,
    });
    await expect(frame.locator('.layer_name').filter({ hasText: 'External edit' })).toBeVisible();
    await frame.getByRole('button', { name: 'Fit', exact: true }).click();
    await expect(frame.locator('#mouse_info_size')).toHaveText('960 x 640');
    expect(
      await frame.locator('body').evaluate(() => {
        const p = JSON.parse((window as any).FileSave.export_as_json());
        return p.info.width * p.info.height;
      }),
    ).toBe(960 * 640);
    await second.page.screenshot({ path: join(evidence, 'minipaint-reopened.png') });
  } finally {
    await second.app.close();
  }
});
