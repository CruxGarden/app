import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { outputs } from './game-cruxspace-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

test('miniPaint raster: native selection, original pixels, manual Delete/filter Undo and portable continuation', async () => {
  test.setTimeout(600000);
  let instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const dir = instance.dir;
  const archive = join(dir, 'regions.crux');
  const evidence = resolve(__dirname, '../../docs/minipaint-raster');
  mkdirSync(evidence, { recursive: true });
  let folder = '';
  const errors: string[] = [];
  const watch = (page: Page) => page.on('pageerror', (error) => errors.push(error.message));
  const frame = () => instance.page.frameLocator('iframe[data-crux-id]');
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const layer = () => doc().project.layers.find((item: any) => item.name === 'Region study');
  const raster = () =>
    readFileSync(
      join(
        folder,
        'data',
        doc().project.data.find((item: any) => item.id === layer().id).data.__cruxBinary.path,
      ),
    );
  const ready = () =>
    expect(frame().locator('#garden-project [role=status]')).toHaveText(
      /^(Saved to Garden|Image saved to Cruxspace)$/,
      { timeout: 60000 },
    );
  const save = async () => {
    await frame().getByRole('button', { name: 'Save project', exact: true }).click();
    await ready();
  };
  const hideChat = async () => {
    const toggle = instance.page.getByRole('button', { name: 'Toggle collaboration' });
    if ((await toggle.getAttribute('aria-pressed')) === 'true') await toggle.click();
  };
  const history = async (name: 'Undo' | 'Redo') => {
    await frame().getByText('Edit', { exact: true }).first().click();
    await frame().getByText(name, { exact: true }).first().click();
    await save();
  };
  const samples = async (bytes = raster()) =>
    frame()
      .locator('body')
      .evaluate(async (_, base64) => {
        const image = new Image();
        image.src = 'data:image/png;base64,' + base64;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        const pixel = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data);
        return {
          width: canvas.width,
          height: canvas.height,
          left: pixel(0, 0),
          right: pixel(19, 0),
          wall: pixel(9, 0),
          selected: pixel(1, 2),
          erased: pixel(3, 4),
          continuation: pixel(12, 2),
        };
      }, bytes.toString('base64'));
  const selection = () =>
    frame()
      .locator('body')
      .evaluate(() => {
        const settings = (window as any).Layers.Base_selection.find_settings();
        return { ...settings.data };
      });
  const collaborate = async (
    message: string,
    closing: string,
    refused = false,
    expectedCount = 9,
  ) => {
    const page = instance.page;
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const previous = new Set((await storedCrux(page, id)).messages.map((m: any) => m.timestamp));
    const toggle = page.getByRole('button', { name: 'Toggle collaboration' });
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
    await page.getByPlaceholder('Send a message...').fill(message);
    await page.getByPlaceholder('Send a message...').press('Enter');
    await expect
      .poll(
        async () =>
          (await storedCrux(page, id)).messages.some(
            (m: any) => !previous.has(m.timestamp) && m.content === closing,
          ),
        { timeout: 150000 },
      )
      .toBe(true);
    const calls = (await storedCrux(page, id)).messages
      .filter((m: any) => !previous.has(m.timestamp) && m.content === closing)
      .flatMap((m: any) => m.toolCalls ?? []);
    const failures = calls.filter((call: any) => call.result?.startsWith('Error'));
    expect(calls).toHaveLength(expectedCount);
    expect(failures).toHaveLength(refused ? 1 : 0);
    if (refused) expect(failures[0].result).toContain('Select a rectangular region');
    return calls;
  };
  try {
    let page = instance.page;
    watch(page);
    await page.setViewportSize({ width: 1800, height: 1100 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^miniPaint/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible();
    folder = (
      await storedCrux(
        page,
        (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!,
      )
    ).projectFolder;
    await ready();
    // A deliberately tiny pixel fixture makes exact regions testable under unequal X/Y scaling.
    const fixture = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 20;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 20, 20);
      ctx.fillStyle = '#000';
      ctx.fillRect(9, 0, 1, 20);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    mkdirSync(join(folder, 'assets'), { recursive: true });
    writeFileSync(join(folder, 'assets/regions.png'), Buffer.from(fixture, 'base64'));
    await expect
      .poll(() =>
        page.evaluate(async () =>
          window.electronAPI!.sqlite.get(
            "SELECT id FROM artifacts WHERE path = 'assets/regions.png' LIMIT 1",
          ),
        ),
      )
      .toBeTruthy();
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await ready();
    const calls = await collaborate(
      'Edit the pixels [minipaint:raster-create]',
      'Prepared editable image regions and reversible erasing.',
    );
    calls.push(
      ...(await collaborate(
        'Fill the two regions [minipaint:raster-fill]',
        'Filled separate image regions and erased a stroke; the native selection is ready for you.',
        false,
        4,
      )),
    );
    writeFileSync(join(evidence, 'calls.json'), JSON.stringify(calls, null, 2));
    await save();
    expect(await samples()).toEqual({
      width: 20,
      height: 20,
      left: [0, 0, 255, 255],
      right: [0, 255, 0, 255],
      wall: [0, 0, 0, 255],
      selected: [255, 0, 0, 255],
      erased: [0, 0, 0, 0],
      continuation: [0, 255, 0, 255],
    });
    expect(readFileSync(join(folder, 'assets/regions.png')).toString('base64')).toBe(fixture);
    const beforeDelete = raster();
    expect(await selection()).toMatchObject({ x: 60, y: 80, width: 80, height: 40 });
    await hideChat();
    await frame().getByRole('button', { name: 'Fit', exact: true }).click();
    await page.screenshot({ path: join(evidence, 'native-selection.png') });
    // Continue the agent-created native selection with the person's normal Delete key.
    await frame().getByRole('button', { name: 'Save project', exact: true }).focus();
    await page.keyboard.press('Delete');
    await save();
    expect((await samples()).selected).toEqual([0, 0, 0, 0]);
    const afterDelete = raster();
    await history('Undo');
    expect(raster()).toEqual(beforeDelete);
    expect(await selection()).toMatchObject({ x: 60, y: 80, width: 80, height: 40 });
    await history('Redo');
    expect(raster()).toEqual(afterDelete);

    // Edit the first of two filters using the real dialog, then native Undo/Redo.
    await frame().locator('[data-filter="brightness"]').click();
    const popup = frame().locator('#popups .popup:visible');
    await expect(popup).toBeVisible();
    const slider = popup.locator('input[type=range]');
    await slider.focus();
    await slider.press('End');
    for (let i = 0; i < 75; i++) await slider.press('ArrowLeft');
    await expect(slider).toHaveValue('25');
    await popup.getByRole('button', { name: 'Ok', exact: true }).click();
    await save();
    expect(layer().filters.map((f: any) => f.params.value)).toEqual([25, 10]);
    expect(layer().filters.map((f: any) => f.id)).toEqual([1, 2]);
    await history('Undo');
    expect(layer().filters.map((f: any) => f.params.value)).toEqual([5, 10]);
    await history('Redo');
    expect(layer().filters.map((f: any) => f.params.value)).toEqual([25, 10]);
    expect(raster()).toEqual(afterDelete);
    await page.screenshot({ path: join(evidence, 'manual-editing.png') });
    await instance.app.close();

    instance = await launchApp({ dir });
    page = instance.page;
    watch(page);
    await page.getByRole('button', { name: /enter/i }).click();
    await ready();
    expect(raster()).toEqual(afterDelete);
    expect(layer().filters.map((f: any) => f.params.value)).toEqual([25, 10]);
    await exportNativeCrux(page, archive, instance.app);
    await instance.app.close();
    renameSync(folder, folder + '.source-offline');
    instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    page = instance.page;
    watch(page);
    await page.setViewportSize({ width: 1800, height: 1100 });
    await enterGarden(page);
    await importNativeCrux(page, archive);
    folder = (
      await storedCrux(
        page,
        (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!,
      )
    ).projectFolder;
    await ready();
    expect(raster()).toEqual(afterDelete);
    const imported = await collaborate(
      'Continue the imported image [minipaint:raster-continue]',
      'Continued raster editing, preserving your manual change and refusing an absent selection.',
      true,
    );
    writeFileSync(join(evidence, 'imported-calls.json'), JSON.stringify(imported, null, 2));
    await save();
    expect((await samples()).selected).toEqual([0, 0, 0, 0]);
    const translucent = (await samples()).continuation;
    expect(translucent[3]).toBe(128);
    // Canvas stores premultiplied alpha: PNG/canvas round trips can change an
    // unpremultiplied RGB channel by one level at 50% opacity.
    for (const [index, channel] of [255, 170, 0].entries())
      expect(Math.abs(translucent[index]! - channel)).toBeLessThanOrEqual(1);
    expect(layer().filters.map((f: any) => f.params.value)).toEqual([25, 10]);
    expect(readFileSync(join(folder, 'assets/regions.png')).toString('base64')).toBe(fixture);
    copyFileSync(
      join(folder, outputs(folder).find((output) => output.label === 'Region continuation')!.path),
      join(evidence, 'output.png'),
    );
    await hideChat();
    await page.screenshot({ path: join(evidence, 'portable-editing.png') });
    expect(errors).toEqual([]);
  } finally {
    await instance.app.close().catch(() => {});
  }
});
