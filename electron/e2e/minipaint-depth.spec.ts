import { test, expect } from '@playwright/test';
import { copyFileSync, readFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { collaborator, outputs } from './game-cruxspace-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

test('miniPaint depth: native banner creation, person/agent revision, Undo, PNG, restart and portable editing', async () => {
  test.setTimeout(600000);
  let instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const dir = instance.dir;
  const archive = join(dir, 'banner.crux');
  const evidence = resolve(__dirname, '../../docs/minipaint-depth');
  mkdirSync(evidence, { recursive: true });
  let folder = '';
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
  const check = () => {
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
    await instance.app.close();

    instance = await launchApp({ dir });
    page = instance.page;
    await page.getByRole('button', { name: /enter/i }).click();
    await ready();
    check();
    await exportNativeCrux(page, archive, instance.app);
    await instance.app.close();
    renameSync(folder, folder + '.source-offline');
    instance = await launchApp();
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
    await page.screenshot({ path: join(evidence, 'portable-editing.png') });
  } finally {
    await instance.app.close().catch(() => {});
  }
});
