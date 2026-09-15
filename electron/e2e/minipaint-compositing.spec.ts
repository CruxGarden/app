import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { outputs } from './game-cruxspace-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

test('miniPaint compositing preserves native pixels, editable Undo, hidden layers and portable continuation', async () => {
  test.setTimeout(600000);
  let instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const dir = instance.dir;
  const archive = join(dir, 'composite.crux');
  const evidence = resolve(__dirname, '../../docs/minipaint-compositing');
  mkdirSync(evidence, { recursive: true });
  let folder = '';
  const calls: any[] = [];
  const errors: string[] = [];
  const comparisons: Array<{ left: string; right: string; maxChannelDelta: number }> = [];
  const watch = () => instance.page.on('pageerror', (error) => errors.push(error.message));
  const frame = () => instance.page.frameLocator('iframe[data-crux-id]');
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const layer = (name: string) => doc().project.layers.find((item: any) => item.name === name);
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
    await hideChat();
    await frame().getByText('Edit', { exact: true }).first().click();
    await frame().getByText(name, { exact: true }).first().click();
    await save();
  };
  const output = (name: string) =>
    readFileSync(join(folder, outputs(folder).find((o) => o.label === name)!.path));
  const pixelsEqual = async (left: string, right: string) => {
    const delta = await instance.page.evaluate(
      async (images) => {
        const pixels = await Promise.all(
          images.map(async (base64) => {
            const image = new Image();
            image.src = 'data:image/png;base64,' + base64;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(image, 0, 0);
            return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          }),
        );
        if (pixels[0]!.length !== pixels[1]!.length) return Infinity;
        return pixels[0]!.reduce(
          (max, channel, index) => Math.max(max, Math.abs(channel - pixels[1]![index]!)),
          0,
        );
      },
      [output(left).toString('base64'), output(right).toString('base64')],
    );
    // A new PNG surface may round premultiplied edge colors by one channel level.
    comparisons.push({ left, right, maxChannelDelta: delta });
    expect(delta).toBeLessThanOrEqual(1);
  };
  const collaborate = async (scenario: string, count: number, refused = false) => {
    const page = instance.page;
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const previous = new Set((await storedCrux(page, id)).messages.map((m: any) => m.timestamp));
    const toggle = page.getByRole('button', { name: 'Toggle collaboration' });
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
    await page
      .getByPlaceholder('Send a message...')
      .fill('Continue the image [minipaint:composite-' + scenario + ']');
    await page.getByPlaceholder('Send a message...').press('Enter');
    const closing = 'Composite ' + scenario + ' complete.';
    await expect
      .poll(
        async () =>
          (await storedCrux(page, id)).messages.some(
            (m: any) => !previous.has(m.timestamp) && m.content === closing,
          ),
        { timeout: 150000 },
      )
      .toBe(true);
    const current = (await storedCrux(page, id)).messages
      .filter((m: any) => !previous.has(m.timestamp) && m.content === closing)
      .flatMap((m: any) => m.toolCalls ?? []);
    expect(current).toHaveLength(count);
    const failures = current.filter((call: any) => call.result?.startsWith('Error'));
    expect(failures).toHaveLength(refused ? 1 : 0);
    if (refused) expect(failures[0].result).toContain('blend backdrop');
    calls.push(...current);
    await ready();
  };
  try {
    watch();
    let page = instance.page;
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
    await collaborate('create', 9);
    const originalTitle = layer('Title');
    const hidden = layer('Hidden original');
    const plate = layer('Blue plate');
    expect(plate).toMatchObject({ composition: 'multiply', opacity: 70, rotate: 12 });
    expect(plate.filters[0]).toMatchObject({ name: 'contrast', params: { value: 15 } });
    await collaborate('plate', 3);
    expect(layer('Plate raster')).toMatchObject({
      type: 'image',
      is_vector: false,
      rotate: 0,
      opacity: 70,
      composition: 'multiply',
      filters: [],
      order: plate.order,
    });
    await pixelsEqual('Composite before', 'Rasterized plate');
    await history('Undo');
    expect(layer('Blue plate')).toEqual(plate);
    await collaborate('hidden', 3);
    expect(layer('Cat')).toMatchObject({
      type: 'image',
      is_vector: false,
      visible: false,
      order: hidden.order,
    });
    await pixelsEqual('Composite before', 'Rasterized hidden');
    await history('Undo');
    expect(layer('Hidden original')).toEqual(hidden);
    await collaborate('rasterize', 3);
    expect(layer('Title')).toBeUndefined();
    expect(layer('Title raster')).toMatchObject({
      type: 'image',
      x: 0,
      y: 0,
      width: 400,
      height: 240,
      rotate: 0,
      filters: [],
      order: originalTitle.order,
    });
    await pixelsEqual('Composite before', 'Rasterized rasterize');
    await history('Undo');
    expect(layer('Title')).toEqual(originalTitle);
    await history('Redo');
    expect(layer('Title raster').type).toBe('image');
    await collaborate('selected', 5);
    await pixelsEqual('Selected before', 'Selected after');
    expect(layer('Title raster')).toBeUndefined();
    expect(layer('Underline')).toBeUndefined();
    await history('Undo');
    expect(layer('Title raster').type).toBe('image');
    expect(layer('Underline').type).toBe('brush');
    await history('Redo');
    expect(layer('Lettering').type).toBe('image');
    const beforeRefusal = readFileSync(join(folder, 'data/project.json'), 'utf8');
    await collaborate('refuse', 2, true);
    expect(readFileSync(join(folder, 'data/project.json'), 'utf8')).toBe(beforeRefusal);
    await collaborate('visible', 3);
    await pixelsEqual('Visible before', 'Visible after');
    expect(layer('Hidden original')).toEqual(hidden);
    expect(layer('Working composite')).toMatchObject({
      type: 'image',
      composition: 'source-over',
      opacity: 100,
      filters: [],
    });
    // The native empty starter layer is deliberately retained too.
    expect(doc().project.layers.filter((l: any) => l.type)).toHaveLength(2);
    await history('Undo');
    expect(layer('Blue plate')).toEqual(plate);
    expect(layer('Lettering').type).toBe('image');
    await history('Redo');
    // The person can change the generated raster with the actual native control.
    await frame().locator('#detail_opacity').fill('80');
    await frame().locator('#detail_opacity').press('Tab');
    await save();
    expect(layer('Working composite').opacity).toBe(80);
    await history('Undo');
    expect(layer('Working composite').opacity).toBe(100);
    await history('Redo');
    expect(layer('Working composite').opacity).toBe(80);
    await frame().getByRole('button', { name: 'Fit', exact: true }).click();
    await save();
    await page.screenshot({ path: join(evidence, 'manual-composite.png'), animations: 'disabled' });
    await instance.app.close();
    instance = await launchApp({ dir });
    page = instance.page;
    watch();
    await page.getByRole('button', { name: /enter/i }).click();
    await ready();
    expect(layer('Working composite').opacity).toBe(80);
    await exportNativeCrux(page, archive, instance.app);
    await instance.app.close();
    renameSync(folder, folder + '.source-offline');
    instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    page = instance.page;
    watch();
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
    await collaborate('continue', 3);
    expect(layer('Hidden original')).toEqual(hidden);
    expect(layer('Working composite').opacity).toBe(80);
    const erased = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = 'data:image/png;base64,' + base64;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 240;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      return Array.from(ctx.getImageData(350, 200, 1, 1).data);
    }, output('Continued composite').toString('base64'));
    expect(erased).toEqual([0, 0, 0, 0]);
    copyFileSync(
      join(folder, outputs(folder).find((o) => o.label === 'Continued composite')!.path),
      join(evidence, 'output.png'),
    );
    await hideChat();
    await frame().getByRole('button', { name: 'Fit', exact: true }).click();
    await save();
    await page.screenshot({ path: join(evidence, 'portable-editing.png'), animations: 'disabled' });
    writeFileSync(join(evidence, 'calls.json'), JSON.stringify(calls, null, 2));
    writeFileSync(join(evidence, 'comparisons.json'), JSON.stringify(comparisons, null, 2));
    writeFileSync(join(evidence, 'before.png'), output('Composite before'));
    writeFileSync(join(evidence, 'merged.png'), output('Visible after'));
    expect(errors).toEqual([]);
  } finally {
    await instance.app.close().catch(() => {});
  }
});
