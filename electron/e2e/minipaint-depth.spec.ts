import { test, expect, type Page } from '@playwright/test';
import { copyFileSync, readFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { outputs } from './game-cruxspace-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

test('miniPaint depth: native banner creation, person/agent revision, Undo, PNG, restart and portable editing', async () => {
  test.setTimeout(600000);
  let instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const dir = instance.dir;
  const archive = join(dir, 'banner.crux');
  const evidence = resolve(__dirname, '../../docs/minipaint-depth');
  mkdirSync(evidence, { recursive: true });
  let folder = '';
  let painted = false;
  const evidenceCalls: any[] = [];
  const collaborator = async (
    page: Page,
    message: string,
    closing: string,
    missingFilter = false,
  ) => {
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const previous = new Set((await storedCrux(page, id)).messages.map((m: any) => m.timestamp));
    const toggle = page.getByRole('button', { name: 'Toggle collaboration' });
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
    const box = page.getByPlaceholder('Send a message...');
    await box.fill(message);
    await box.press('Enter');
    // An imported archive already contains earlier closing text. Wait for this turn,
    // and collect its calls before manual edits move its messages into Growth.
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
    expect(calls.length).toBeGreaterThan(0);
    const errors = calls.filter((call: any) => call.result?.startsWith('Error'));
    if (missingFilter) {
      expect(errors).toHaveLength(1);
      expect(errors[0].result).toContain('Filter no longer exists');
    } else expect(errors).toEqual([]);
    evidenceCalls.push(...calls);
    return calls;
  };
  const frame = () => instance.page.frameLocator('iframe[data-crux-id]');
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const layer = (name: string) => doc().project.layers.find((item: any) => item.name === name);
  const text = (name: string) =>
    layer(name)
      .data.map((line: any[]) => line.map((span) => span.text).join(''))
      .join('\n');
  const ready = () =>
    expect(frame().locator('#garden-project [role=status]')).toHaveText(
      /^(Saved to Garden|Image saved to Cruxspace)$/,
      {
        timeout: 60000,
      },
    );
  const save = async () => {
    await frame().getByRole('button', { name: 'Save project', exact: true }).click();
    await ready();
  };
  const hideChat = async () => {
    const toggle = instance.page.getByRole('button', { name: 'Toggle collaboration' });
    if ((await toggle.getAttribute('aria-pressed')) === 'true') await toggle.click();
  };
  const history = async (action: 'Undo' | 'Redo') => {
    await frame().getByText('Edit', { exact: true }).first().click();
    await frame().getByText(action, { exact: true }).first().click();
  };
  const appendDetails = async (note: string) => {
    await hideChat();
    await frame().getByRole('button', { name: 'Fit', exact: true }).click();
    await frame()
      .locator('.layer_name')
      .filter({ hasText: /^Details$/ })
      .click();
    await frame().locator('#text').click();
    const detail = layer('Details');
    // Read the native canvas transform; actual editing uses its pointer/keyboard UI.
    const position = await frame()
      .locator('body')
      .evaluate(
        (_, point) => {
          const layers = (window as any).Layers;
          const origin = layers.get_world_coords(0, 0);
          const scale = layers.get_world_coords(100, 100);
          return {
            x: ((point.x - origin.x) * 100) / (scale.x - origin.x),
            y: ((point.y - origin.y) * 100) / (scale.y - origin.y),
          };
        },
        { x: detail.x + 12, y: detail.y + 12 },
      );
    await frame().locator('#canvas_minipaint').click({ position });
    await expect(frame().locator('#text_tool_keyboard_input')).toBeFocused();
    await instance.page.keyboard.press('End');
    await instance.page.keyboard.type(note);
    await save();
    expect(text('Details')).toContain(note.trim());
  };
  const photoCheck = () => {
    expect(doc().project.layers).toHaveLength(6);
    expect(doc().project.info.width).toBe(920);
    expect(doc().project.info.height).toBe(440);
    expect(text('Details')).toContain('Bring envelopes. Hand-lettered by me.');
    expect(layer('Seed illustration').visible).toBe(false);
    expect(layer('Edited image').filters).toEqual([
      { id: 1, name: 'brightness', params: { value: -25 } },
    ]);
    expect(layer('Painted underline').type).toBe('brush');
    expect(layer('Painted underline').x).toBe(300);
    expect(layer('Painted underline').data[0]).toEqual([
      [0, 0, 12],
      [140, 4, 12],
      [300, 0, 12],
      [500, 3, 12],
    ]);
    const imageIds = ['Seed illustration', 'Edited image'].map((name) => layer(name).id);
    const rasters = imageIds.map(
      (id) => doc().project.data.find((item: any) => item.id === id).data,
    );
    expect(rasters[0]).toEqual(rasters[1]); // live filters leave original raster pixels untouched
    const png = readFileSync(
      join(folder, outputs(folder).find((item) => item.label === 'Painted banner')!.path),
    );
    expect(png.readUInt32BE(16)).toBe(920);
    expect(png.readUInt32BE(20)).toBe(440);
  };
  const check = () => {
    if (painted) return photoCheck();
    expect(doc().project.layers).toHaveLength(4);
    expect(doc().project.info.width).toBe(960);
    expect(doc().project.info.height).toBe(480);
    expect(text('Headline')).toBe('Seed library event');
    expect(text('Details')).toContain('Saturday at 10. Bring spare seeds. Bring envelopes.');
    expect(layer('Details').x).toBe(320);
    expect(layer('Details').data[0][0].meta.size).toBeCloseTo(25.6);
    expect(layer('Backdrop').params.fill_color).toBe('#f2eadb');
    const output = outputs(folder).find((item) => item.label === 'Saturday banner')!;
    expect(output.mimeType).toBe('image/png');
    const png = readFileSync(join(folder, output.path));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(960);
    expect(png.readUInt32BE(20)).toBe(480);
    const raster = doc().project.data[0].data.__cruxBinary.path;
    expect(
      readFileSync(join(folder, 'data', raster))
        .subarray(1, 4)
        .toString(),
    ).toBe('PNG');
  };
  try {
    let page = instance.page;
    page.on('pageerror', (error) => console.log('miniPaint page error:', error.message));
    page.setDefaultTimeout(60000);
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
    mkdirSync(join(folder, 'assets'), { recursive: true });
    copyFileSync(
      resolve(__dirname, 'fixtures/glow-garden/seed.png'),
      join(folder, 'assets/seed.png'),
    );
    // Let the external Project Folder write finish ingestion before starting a turn.
    await expect
      .poll(() =>
        page.evaluate(async () =>
          window.electronAPI!.sqlite.get(
            "SELECT id FROM artifacts WHERE path = 'assets/seed.png' LIMIT 1",
          ),
        ),
      )
      .toBeTruthy();
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await ready();
    await collaborator(
      page,
      'Create an editable banner [minipaint:depth-create]',
      'Built an editable seed library banner.',
    );
    await save();
    const metadata = await storedCrux(
      page,
      (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!,
    );
    const calls = metadata.messages.flatMap((message: any) => message.toolCalls ?? []);
    expect(calls.filter((call: any) => call.result?.startsWith('Error'))).toEqual([]);
    expect(doc().project.layers).toHaveLength(4);
    const originalRaster = doc().project.data;
    await appendDetails(' Bring envelopes.');
    await collaborator(
      page,
      'Move the event to Saturday and resize [minipaint:depth-revise]',
      'Revised the banner, preserved your note and exported PNG.',
    );
    const revisedMetadata = await storedCrux(
      page,
      (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!,
    );
    expect(
      revisedMetadata.messages
        .flatMap((message: any) => message.toolCalls ?? [])
        .filter((call: any) => call.result?.startsWith('Error')),
    ).toEqual([]);
    await save();
    check();
    const banner = readFileSync(
      join(folder, outputs(folder).find((item) => item.label === 'Saturday banner')!.path),
    );
    const background = await frame()
      .locator('body')
      .evaluate(async (_, base64) => {
        const image = new Image();
        image.src = 'data:image/png;base64,' + base64;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 10, 10, 1, 1, 0, 0, 1, 1);
        return Array.from(context.getImageData(0, 0, 1, 1).data);
      }, banner.toString('base64'));
    expect(background).toEqual([242, 234, 219, 255]);
    expect(doc().project.data).toEqual(originalRaster);
    await hideChat();
    await history('Undo');
    await expect.poll(() => doc().project.info.width).toBe(1200);
    expect(layer('Details').x).toBe(400);
    expect(layer('Details').data[0][0].meta.size).toBe(32);
    expect(text('Details')).toContain('Saturday');
    expect(text('Details')).toContain('Bring envelopes.');
    await history('Redo');
    await expect.poll(() => doc().project.info.width).toBe(960);
    await save();
    check();
    await frame().getByRole('button', { name: 'Fit', exact: true }).click();
    await page.screenshot({ path: join(evidence, 'native-editing.png') });
    copyFileSync(
      join(folder, outputs(folder).find((item) => item.label === 'Saturday banner')!.path),
      join(evidence, 'banner.png'),
    );
    await collaborator(
      page,
      'Add paint and photo adjustments [minipaint:photo-create]',
      'Added editable paint, live photo adjustments and a reversible crop.',
    );
    await save();
    const createdPhotoMetadata = await storedCrux(
      page,
      (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!,
    );
    expect(
      createdPhotoMetadata.messages
        .flatMap((message: any) => message.toolCalls ?? [])
        .filter((call: any) => call.result?.startsWith('Error')),
    ).toEqual([]);
    expect(layer('Edited image').filters.map((filter: any) => filter.params.value)).toEqual([
      30, 15,
    ]);
    await appendDetails(' Hand-lettered by me.');
    await collaborator(
      page,
      'Revise the photo effects [minipaint:photo-revise]',
      'Revised live filters and saved the painted banner, preserving your text.',
    );
    await save();
    painted = true;
    photoCheck();
    // Native Undo must restore the removed filter, then restore the prior updated value.
    await hideChat();
    await history('Undo');
    await expect.poll(() => layer('Edited image').filters.length).toBe(2);
    await history('Undo');
    await expect.poll(() => layer('Edited image').filters[0].params.value).toBe(30);
    expect(layer('Edited image').filters[1].params.value).toBe(15);
    await history('Redo');
    await expect.poll(() => layer('Edited image').filters[0].params.value).toBe(-25);
    await history('Redo');
    await expect.poll(() => layer('Edited image').filters.length).toBe(1);
    await save();
    photoCheck();
    const paintedOutput = readFileSync(
      join(folder, outputs(folder).find((item) => item.label === 'Painted banner')!.path),
    );
    const originalOutput = readFileSync(
      join(folder, outputs(folder).find((item) => item.label === 'Saturday banner')!.path),
    );
    // Compare the same photo region after accounting for the crop; assert actual rendered changes.
    const pixels = await frame()
      .locator('body')
      .evaluate(
        async (_, sources) => {
          const read = async (base64: string, x: number, y: number) => {
            const image = new Image();
            image.src = 'data:image/png;base64,' + base64;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 100;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(image, x, y, 100, 100, 0, 0, 100, 100);
            return Array.from(ctx.getImageData(0, 0, 100, 100).data);
          };
          return {
            before: await read(sources.before, 90, 170),
            after: await read(sources.after, 70, 150),
            stroke: (await read(sources.after, 370, 188)).slice(0, 4),
          };
        },
        { before: originalOutput.toString('base64'), after: paintedOutput.toString('base64') },
      );
    expect(pixels.after).not.toEqual(pixels.before);
    expect(pixels.stroke).toEqual([198, 90, 54, 255]);
    expect(evidenceCalls).toHaveLength(27);
    writeFileSync(join(evidence, 'painting-calls.json'), JSON.stringify(evidenceCalls, null, 2));
    copyFileSync(
      join(folder, outputs(folder).find((item) => item.label === 'Painted banner')!.path),
      join(evidence, 'painted-banner.png'),
    );
    await frame().getByRole('button', { name: 'Fit', exact: true }).click();
    await page.screenshot({ path: join(evidence, 'native-painting.png') });
    await instance.app.close();

    instance = await launchApp({ dir });
    page = instance.page;
    await page.getByRole('button', { name: /enter/i }).click();
    await ready();
    check();
    await exportNativeCrux(page, archive, instance.app);
    await instance.app.close();
    renameSync(folder, folder + '.source-offline');
    instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    page = instance.page;
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
    check();
    await appendDetails(' Welcome!');
    await history('Undo');
    await expect.poll(() => text('Details')).not.toContain('Welcome!');
    await history('Redo');
    await expect.poll(() => text('Details')).toContain('Welcome!');
    await save();
    const importedCalls = await collaborator(
      page,
      'Check imported filters [minipaint:photo-revise]',
      'Revised live filters and saved the painted banner, preserving your text.',
      true,
    );
    // Imported project has no contrast filter: this deliberately tests a scoped refusal.
    expect(importedCalls).toHaveLength(6);
    writeFileSync(
      join(evidence, 'portable-painting-calls.json'),
      JSON.stringify(importedCalls, null, 2),
    );
    await save();
    photoCheck();
    await hideChat();
    await page.screenshot({ path: join(evidence, 'portable-editing.png') });
  } finally {
    await instance.app.close().catch(() => {});
  }
});
