import { test, expect, type Page, type FrameLocator } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

test('SVG-Edit native drawing, images, agent styling, exports and portable editing', async () => {
  test.setTimeout(240000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  let folder = '';
  const evidence = resolve(__dirname, '../../docs/svgedit');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'drawing.crux');
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const state = (key: string) => {
    const ref = doc().project?.[key]?.__cruxBinary;
    return ref ? JSON.parse(readFileSync(join(folder, 'data', ref.path), 'utf8')) : null;
  };
  const ready = async (page: Page) => {
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 90000,
    });
    return frame;
  };
  const draw = async (page: Page, frame: FrameLocator, tool: string, dx = 0) => {
    // Wait for Workshop's pane transition before dragging native SVG coordinates.
    await frame.locator('#svgcontent').evaluate(async (el) => {
      let previous = '', stableSince = performance.now();
      const deadline = stableSince + 5000;
      while (performance.now() < deadline) {
        await new Promise(requestAnimationFrame);
        const r = el.getBoundingClientRect();
        const current = [r.x,r.y,r.width,r.height].join(',');
        if (current !== previous) { previous=current; stableSince=performance.now(); }
        if (performance.now()-stableSince > 300) return;
      }
      throw new Error('Workshop drawing coordinates did not settle.');
    });
    await frame.locator(tool).click();
    const box = (await frame.locator('#svgcontent').boundingBox())!;
    await page.mouse.move(box.x + 60 + dx, box.y + 60);
    await page.mouse.down();
    await page.mouse.move(box.x + 230 + dx, box.y + 165, { steps: 10 });
    await page.mouse.up();
  };
  let imageKey = '';
  let imageRef: unknown;
  try {
    const { page } = first;
    await page.setViewportSize({ width: 2000, height: 1200 });
    await page
      .context()
      .route(/^https?:\/\//, (route) =>
        ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
          ? route.continue()
          : route.abort(),
      );
    page.on('pageerror', (e) => console.log('SVG-Edit error', e.message));
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^SVG-Edit/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const frame = await ready(page);
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder;
    console.log('SVG-Edit folder', folder);
    await draw(page, frame, '#tools_rect .menu-button');
    await expect(frame.locator('#svgcontent rect')).toHaveCount(1);
    await expect(frame.locator('#svgcontent rect')).toHaveAttribute('width','170');
    await expect(frame.locator('#svgcontent rect')).toHaveAttribute('height','105');
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect.poll(() => state('svg')).toContain('<rect');
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=',
      'base64',
    );
    await frame.locator('#main_button').click();
    const chooser = page.waitForEvent('filechooser');
    await frame.locator('#tool_import').click();
    await (await chooser).setFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: png });
    await expect(frame.locator('#svgcontent image')).toHaveCount(1);
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect
      .poll(() => Object.keys(doc().project).filter((k) => k.startsWith('image-')).length)
      .toBe(1);
    imageKey = Object.keys(doc().project).find((k) => k.startsWith('image-'))!;
    imageRef = doc().project[imageKey];
    expect(state('svg')).toContain('crux-image:');
    expect(state(imageKey)).toBe('data:image/png;base64,' + png.toString('base64'));
    const chat = page.getByPlaceholder('Send a message...');
    await chat.fill('Make a blue badge [svgedit:fill]');
    await chat.press('Enter');
    await expect.poll(() => state('svg'), { timeout: 45000 }).toContain('Lantern badge');
    await expect(frame.locator('#svgcontent rect')).toHaveAttribute('fill', '#3b82f6');
    expect(doc().project[imageKey]).toEqual(imageRef);
    const download = async (name: string, click: () => Promise<void>) => {
      const path = join(first.dir, name);
      await first.app.evaluate(({ session }, path) => {
        (globalThis as any).__svgDownload = null;
        session.defaultSession.once('will-download', (_e, item) => {
          item.setSavePath(path);
          item.once('done', (_e, state) => {
            (globalThis as any).__svgDownload = state;
          });
        });
      }, path);
      await click();
      await expect
        .poll(() => first.app.evaluate(() => (globalThis as any).__svgDownload), { timeout: 30000 })
        .toBe('completed');
      return readFileSync(path);
    };
    const svg = await download('badge.svg', async () => {
      await frame.locator('#main_button').click();
      await frame.locator('#tool_save').click();
    });
    expect(svg.toString()).toContain('Lantern badge');
    expect(svg.toString()).toContain('data:image/png');
    expect(svg.toString()).not.toContain('crux-image:');
    const raster = await download('badge.png', async () => {
      if (!(await frame.locator('#tool_export').isVisible()))
        await frame.locator('#main_button').click();
      await frame.locator('#tool_export').click();
      await frame.locator('#se-export-dialog #export_ok').click();
    });
    expect(raster.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(raster.readUInt32BE(16)).toBe(640);
    expect(raster.readUInt32BE(20)).toBe(480);
    const external = doc();
    const bytes = Buffer.from(
      JSON.stringify(state('svg').replace('Lantern badge', 'External drawing')),
    );
    const hash = createHash('sha256').update(bytes).digest('hex');
    writeFileSync(join(folder, 'data/assets', hash + '.bin'), bytes);
    external.project.svg = {
      __cruxBinary: {
        path: `assets/${hash}.bin`,
        kind: 'buffer',
        type: 'application/json',
        size: bytes.length,
      },
    };
    writeFileSync(join(folder, 'data/project.json'), JSON.stringify(external));
    await draw(page, frame, '#tools_ellipse .menu-button', 260);
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toContainText('changed elsewhere');
    expect(state('svg')).toContain('External drawing');
    page.once('dialog', (d) => d.accept());
    await frame.getByRole('button', { name: 'Reload saved project', exact: true }).click();
    await ready(page);
    await expect(frame.locator('#svgcontent ellipse')).toHaveCount(0);
    await expect(frame.locator('#svgcontent image')).toHaveCount(1);
    await page.screenshot({ path: join(evidence, 'svgedit-workshop.png'), animations: 'disabled' });
  } finally {
    await first.app.close();
  }
  const second = await launchApp({ dir: first.dir });
  try {
    await second.page.setViewportSize({ width: 2000, height: 1200 });
    await second.page.getByRole('button', { name: /enter/i }).click();
    const frame = await ready(second.page);
    await expect(frame.locator('#svgcontent rect')).toHaveAttribute('fill', '#3b82f6');
    await expect(frame.locator('#svgcontent image')).toHaveCount(1);
    expect(doc().project[imageKey]).toEqual(imageRef);
    await expect(frame.locator('#svgcontent rect')).toHaveAttribute('width','170');
    await expect(frame.locator('#svgcontent rect')).toHaveAttribute('height','105');
    await expect(frame.locator('#svgcontent rect')).toHaveAttribute('x','60');
    await second.page.screenshot({
      path: join(evidence, 'svgedit-reopened.png'),
      animations: 'disabled',
    });
    await exportNativeCrux(second.page, archive);
  } finally {
    await second.app.close();
  }
  const oldFolder = folder;
  renameSync(oldFolder, oldFolder + '-unavailable');
  const third = await launchApp();
  try {
    await third.page.setViewportSize({ width: 2000, height: 1200 });
    await enterGarden(third.page);
    await importNativeCrux(third.page, archive);
    const frame = await ready(third.page);
    const id = (await third.page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(third.page, id)).projectFolder;
    expect(folder).not.toBe(oldFolder);
    await expect(frame.locator('#svgcontent image')).toHaveCount(1);
    expect(doc().project[imageKey]).toEqual(imageRef);
    await draw(third.page, frame, '#tools_ellipse .menu-button', 260);
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect.poll(() => state('svg')).toContain('<ellipse');
    await ready(third.page);
    await third.page.screenshot({
      path: join(evidence, 'svgedit-imported.png'),
      animations: 'disabled',
    });
  } finally {
    await third.app.close();
    renameSync(oldFolder + '-unavailable', oldFolder);
  }
});
