import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { collaborator, outputs } from './game-cruxspace-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

test('sprite depth: draw and animate, preserve manual pixels, native Undo, sheet and portable editing', async () => {
  test.setTimeout(360000);
  let instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const dir = instance.dir;
  const archive = join(dir, 'seedling.crux');
  const evidence = resolve(__dirname, '../../docs/piskel-depth');
  mkdirSync(evidence, { recursive: true });
  let folder = '';
  const frame = () => instance.page.frameLocator('iframe[data-crux-id]');
  const sprite = () =>
    JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8')).project.piskel;
  const ready = () =>
    expect(frame().locator('#garden-project [role=status]')).toHaveText(
      /Saved to Garden|Sheet saved to Cruxspace/,
      { timeout: 60000 },
    );
  const save = async () => {
    await frame().getByRole('button', { name: 'Save project', exact: true }).click();
    await ready();
  };
  const pixels = () =>
    frame()
      .locator('body')
      .evaluate(() => {
        const p = (window as any).pskl.app.piskelController;
        return p
          .getLayerAt(0)
          .getFrames()
          .map((f: any) => Array.from(f.getPixels())) as number[][];
      });
  const check = async (expected: number[][]) => {
    expect(sprite().layers[0].frameCount).toBe(2);
    expect(sprite().fps).toBe(6);
    expect(await pixels()).toEqual(expected);
  };
  const focusEditor = async () => {
    await frame().locator('[data-tool-id=tool-pen]').click();
  };
  async function history(direction: 'undo' | 'redo') {
    await focusEditor();
    await expect
      .poll(() =>
        frame()
          .locator('body')
          .evaluate(() => {
            const p = (window as any).pskl;
            return (
              Date.now() - p.app.historyService.lastLoadState >
              p.service.HistoryService.LOAD_STATE_INTERVAL
            );
          }),
      )
      .toBe(true);
    await instance.page.keyboard.press(direction === 'undo' ? 'Meta+z' : 'Meta+Shift+z');
  }
  const toggleChat = async () => {
    const toggle = instance.page.getByRole('button', { name: 'Toggle collaboration' });
    if ((await toggle.getAttribute('aria-pressed')) === 'true') await toggle.click();
  };
  async function manualStroke() {
    await toggleChat();
    await frame().locator('#preview-list .preview-tile').nth(1).click();
    await focusEditor();
    const before = await pixels();
    await frame()
      .locator('#drawing-canvas-container')
      .click({ position: { x: 180, y: 400 }, delay: 100 });
    await expect.poll(pixels).not.toEqual(before);
    await save();
    return pixels();
  }
  try {
    let page = instance.page;
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => console.log('Sprite page error:', e.message));
    await page.setViewportSize({ width: 1900, height: 1100 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Piskel/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await ready();
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder;
    await collaborator(
      page,
      'Draw an animated seedling [piskel:depth-create]',
      'Created an editable two-frame seedling animation and saved its sheet.',
    );
    await save();
    const calls = (await storedCrux(page, id)).messages.flatMap((m: any) => m.toolCalls ?? []);
    expect(calls.filter((c: any) => c.result?.startsWith('Error'))).toEqual([]);
    expect(sprite().layers[0].frameCount).toBe(2);
    const initial = await pixels();
    expect(initial[0][20 * 32 + 16]).toBe(0xff466cb7);
    expect(initial[1][8 * 32 + 22]).toBe(0xff7cd7a9);
    expect(initial[0][8 * 32 + 22]).not.toBe(initial[1][8 * 32 + 22]);
    // Last structural command removed the spare frame. Native Undo restores it once.
    await toggleChat();
    await focusEditor();
    await history('undo');
    await expect(frame().locator('#preview-list .preview-tile')).toHaveCount(3);
    await history('redo');
    await expect(frame().locator('#preview-list .preview-tile')).toHaveCount(2);
    await save();
    // Native history can also restore its recorded speed; use the person's speed control below if needed.
    // Hidden-frame metadata survives native history without string indices or loss.
    await frame().locator('#preview-list .tile-count').nth(1).click();
    await save();
    expect(sprite().hiddenFrames).toEqual([1]);
    await focusEditor();
    await history('undo');
    await expect.poll(() => sprite().hiddenFrames).toEqual([]);
    await history('redo');
    await expect.poll(() => sprite().hiddenFrames).toEqual([1]);
    await frame().locator('#preview-list .tile-count').nth(1).click();
    await save();
    expect(sprite().hiddenFrames).toEqual([]);
    const manual = await manualStroke();
    expect(manual[0]).toEqual(initial[0]);
    await collaborator(
      page,
      'Add a small highlight [piskel:depth-revise]',
      'Added a pot highlight while preserving your drawing.',
    );
    await save();
    const revised = await pixels();
    expect(revised[0]).toEqual(manual[0]);
    for (let i = 0; i < 1024; i++)
      expect(revised[1][i]).toBe(
        [20 * 32 + 16, 20 * 32 + 17].includes(i) ? 0xff90e0ff : manual[1][i],
      );
    await toggleChat();
    await focusEditor();
    await history('undo');
    await expect.poll(pixels).toEqual(manual);
    await history('redo');
    await expect.poll(pixels).toEqual(revised);
    // Confirm the person's native speed control and save after history navigation.
    const speed = frame().locator('#preview-fps');
    const bounds = (await speed.boundingBox())!;
    await speed.click({ position: { x: 8 + (bounds.width - 16) / 4, y: bounds.height / 2 } });
    await expect.poll(() => sprite().fps).toBe(6);
    await save();
    const sheet = outputs(folder).find((o) => o.label === 'Revised seedling')!;
    const png = readFileSync(join(folder, sheet.path));
    expect(png.readUInt32BE(16)).toBe(32);
    expect(png.readUInt32BE(20)).toBe(64);
    const rendered = await frame()
      .locator('body')
      .evaluate(async (_, base64) => {
        const image = new Image();
        image.src = 'data:image/png;base64,' + base64;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        return Array.from(
          new Uint32Array(ctx.getImageData(0, 0, image.width, image.height).data.buffer),
        );
      }, png.toString('base64'));
    expect(rendered).toEqual(revised.flat());
    copyFileSync(join(folder, sheet.path), join(evidence, 'seedling-sheet.png'));
    await page.screenshot({ path: join(evidence, 'native-animation.png') });
    await check(revised);
    await instance.app.close();
    instance = await launchApp({ dir, env: { CRUX_AI_MOCK: '1' } });
    page = instance.page;
    await page.getByRole('button', { name: /enter/i }).click();
    await ready();
    await check(revised);
    await exportNativeCrux(page, archive, instance.app);
    await instance.app.close();
    renameSync(folder, folder + '.source-offline');
    instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    page = instance.page;
    await page.setViewportSize({ width: 1900, height: 1100 });
    await enterGarden(page);
    await importNativeCrux(page, archive);
    folder = (
      await storedCrux(
        page,
        (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!,
      )
    ).projectFolder;
    await ready();
    await check(revised);
    expect(
      readFileSync(join(folder, outputs(folder).find((o) => o.label === 'Revised seedling')!.path)),
    ).toEqual(png);
    // A distinct manual stroke after clean import is still editable and undoable.
    await toggleChat();
    await focusEditor();
    await frame()
      .locator('#drawing-canvas-container')
      .click({ position: { x: 220, y: 450 }, delay: 100 });
    await expect.poll(pixels).not.toEqual(revised);
    await history('undo');
    await expect.poll(pixels).toEqual(revised);
    await save();
    await page.screenshot({ path: join(evidence, 'portable-animation.png') });
  } finally {
    await instance.app.close().catch(() => {});
  }
});
