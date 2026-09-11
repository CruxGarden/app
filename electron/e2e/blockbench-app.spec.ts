import { test, expect, type Page, type FrameLocator } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';
test('Blockbench models, textures, animation, agent edits and complete portable editing', async () => {
  test.setTimeout(300000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  let folder = '',
    modelId = '',
    textureKey = '';
  let textureRef: unknown;
  const evidence = resolve(__dirname, '../../docs/blockbench');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'models.crux');
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const state = (key: string) => {
    const ref = doc().project?.[key]?.__cruxBinary;
    return ref ? JSON.parse(readFileSync(join(folder, 'data', ref.path), 'utf8')) : null;
  };
  const model = () => state('model-' + modelId);
  const ready = async (page: Page) => {
    const f = page.frameLocator('iframe[data-crux-id]');
    await expect(f.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 90000,
    });
    return f;
  };
  const save = async (f: FrameLocator) => {
    await f.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(f.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 20000,
    });
  };
  const addCube = async (f: FrameLocator) => {
    await f.locator('[toolbar_item="add_element"] .action_more_options').click();
    await f.locator('[menu_item="add_cube"]').click();
  };
  const createModel = async (f: FrameLocator, name: string) => {
    await f.getByText('Generic Model', { exact: true }).click();
    await f.getByText('Create New Model', { exact: false }).click();
    await f.locator('#project input[type=text]').first().fill(name);
    await f.locator('#project').getByRole('button', { name: 'Confirm', exact: true }).click();
  };
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
    page.on('pageerror', (e) => console.log('Blockbench error', e.message));
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Blockbench/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const f = await ready(page);
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder;
    console.log('Blockbench folder', folder);
    await createModel(f, 'Lantern');
    await f.locator('[toolbar_item="add_group"]').click();
    await addCube(f);
    for (const [axis, value] of [
      ['x', '6'],
      ['y', '10'],
      ['z', '6'],
    ]) {
      const size = f.locator(`[toolbar_item="slider_size_${axis}"] .nslide`);
      await size.click();
      await size.fill(value!);
      await size.press('Enter');
    }
    await f.locator('[toolbar_item="create_texture"]').first().click();
    await f.locator('#add_bitmap').getByRole('button', { name: 'Confirm', exact: true }).click();
    await save(f);
    modelId = state('index').active;
    expect(model().elements).toHaveLength(1);
    expect(model().textures).toHaveLength(1);
    textureKey = Object.keys(doc().project).find((k) => k.startsWith('asset-'))!;
    expect(state(textureKey)).toMatch(/^data:image\/png/);
    const beforePaint = state(textureKey);
    await f.locator('#mode_selector li').filter({ hasText: 'Paint' }).click();
    await f.locator('#uv_frame').click({ position: { x: 12, y: 12 } });
    await save(f);
    textureKey = Object.keys(doc().project).find((k) => k.startsWith('asset-'))!;
    expect(state(textureKey)).not.toBe(beforePaint);
    await f.locator('#mode_selector li').filter({ hasText: 'Animate' }).click();
    await f.locator('[toolbar_item="add_animation"]').first().click();
    await f.locator('#animation_properties input[type=text]').first().fill('Sway');
    await f
      .locator('#animation_properties')
      .getByRole('button', { name: 'Confirm', exact: true })
      .click();
    await f.locator('.outliner_object[element_type=group]').click({ position: { x: 30, y: 12 } });
    await page.keyboard.press('q');
    await f.locator('#timeline_time').click({ position: { x: 150, y: 8 } });
    await page.keyboard.press('q');
    await f.locator('#keyframe_bar_x pre[contenteditable]').click();
    await f.locator('#keyframe_bar_x pre[contenteditable]').press('ControlOrMeta+A');
    await f.locator('#keyframe_bar_x pre[contenteditable]').pressSequentially('3');
    await f.locator('#keyframe_bar_x pre[contenteditable]').press('Tab');
    await save(f);
    expect(model().animations).toHaveLength(1);
    expect(model().animations[0].name).toBe('Sway');
    const frames = (Object.values(model().animations[0].animators) as any[]).flatMap(
      (a) => a.keyframes || [],
    );
    expect(frames.length).toBeGreaterThanOrEqual(2);
    expect(frames.some((k) => k.time > 0 && Number(k.data_points[0].x) === 3)).toBe(true);
    expect(
      model().elements[0].to.map((v: number, i: number) => v - model().elements[0].from[i]),
    ).toEqual([6, 10, 6]);
    textureRef = doc().project[textureKey];
    const chat = page.getByPlaceholder('Send a message...');
    await chat.fill('Name this lantern [blockbench:rename]');
    await chat.press('Enter');
    await expect.poll(() => model()?.name, { timeout: 45000 }).toBe('Garden lantern');
    expect(model().elements[0].name).toBe('Lantern body');
    expect(doc().project[textureKey]).toEqual(textureRef);
    await f.locator('#mode_selector li').filter({ hasText: 'Edit' }).click();
    await first.app.evaluate(({ session }, dir) => {
      (globalThis as any).__bbDownloads = [];
      session.defaultSession.on('will-download', (_e, item) => {
        const name = item.getFilename();
        item.setSavePath(dir + '/' + name);
        item.once('done', (_e, state) => {
          (globalThis as any).__bbDownloads.push({ name, state });
        });
      });
    }, first.dir);
    await f.locator('#menu_bar').getByText('File', { exact: true }).click();
    await f.locator('[menu_item="save_project"]').click();
    await expect
      .poll(() =>
        first.app.evaluate(() =>
          (globalThis as any).__bbDownloads.some(
            (d: any) => d.name.endsWith('.bbmodel') && d.state === 'completed',
          ),
        ),
      )
      .toBe(true);
    const exported = (await first.app.evaluate(() => (globalThis as any).__bbDownloads)) as {
      name: string;
      state: string;
    }[];
    const native = JSON.parse(
      readFileSync(
        join(first.dir, exported.find((d) => d.name.endsWith('.bbmodel'))!.name),
        'utf8',
      ),
    );
    expect(native.elements[0].name).toBe('Lantern body');
    expect(native.textures[0].source).toMatch(/^data:image\/png/);
    expect(native.animations[0].name).toBe('Sway');
    await f.locator('#menu_bar').getByText('File', { exact: true }).click();
    await f.locator('[menu_item="export"]').hover();
    await f.locator('[menu_item="export_gltf"]').click();
    console.log(
      'GLTF DIALOG',
      await f
        .locator('dialog:visible')
        .innerText()
        .catch(() => ''),
    );
    if (
      await f
        .locator('dialog:visible')
        .getByRole('button', { name: 'Confirm', exact: true })
        .isVisible()
    )
      await f
        .locator('dialog:visible')
        .getByRole('button', { name: 'Confirm', exact: true })
        .click();
    await expect
      .poll(
        () =>
          first.app.evaluate(() =>
            (globalThis as any).__bbDownloads.some(
              (d: any) => /\.(gltf|glb)$/.test(d.name) && d.state === 'completed',
            ),
          ),
        { timeout: 30000 },
      )
      .toBe(true);
    const gltfName = await first.app.evaluate(
      () => (globalThis as any).__bbDownloads.find((d: any) => d.name.endsWith('.gltf')).name,
    );
    const gltf = JSON.parse(readFileSync(join(first.dir, gltfName), 'utf8'));
    expect(gltf.meshes.length).toBeGreaterThan(0);
    expect(gltf.animations.length).toBeGreaterThan(0);
    expect(gltf.buffers.every((b: any) => b.uri.startsWith('data:'))).toBe(true);
    expect(
      gltf.images.every(
        (image: any) => image.uri?.startsWith('data:') || Number.isInteger(image.bufferView),
      ),
    ).toBe(true);
    await f.locator('.project_tab .project_tab_close_button').first().click();
    await save(f);
    expect(state('index').models).toContain(modelId);
    expect(state('index').open).not.toContain(modelId);
    const chooser = page.waitForEvent('filechooser');
    await f.getByText('Open Model', { exact: true }).click();
    await (
      await chooser
    ).setFiles({
      name: 'Imported lantern.bbmodel',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(native)),
    });
    await save(f);
    expect(state('index').models).toHaveLength(2);
    await f.locator('#garden-model-library').selectOption(modelId);
    await save(f);
    expect(state('index').open).toHaveLength(2);
    expect(model().textures).toHaveLength(1);
    const external = doc(),
      bytes = Buffer.from(JSON.stringify({ ...model(), name: 'External lantern' })),
      hash = createHash('sha256').update(bytes).digest('hex');
    writeFileSync(join(folder, 'data/assets', hash + '.bin'), bytes);
    external.project['model-' + modelId] = {
      __cruxBinary: {
        path: `assets/${hash}.bin`,
        kind: 'buffer',
        type: 'application/json',
        size: bytes.length,
      },
    };
    writeFileSync(join(folder, 'data/project.json'), JSON.stringify(external));
    await addCube(f);
    await f.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(f.locator('#garden-project [role=status]')).toContainText('changed elsewhere');
    expect(model().name).toBe('External lantern');
    page.once('dialog', (d) => d.accept());
    await f.getByRole('button', { name: 'Reload saved project', exact: true }).click();
    await ready(page);
    await page.screenshot({
      path: join(evidence, 'blockbench-workshop.png'),
      animations: 'disabled',
    });
  } finally {
    await first.app.close();
  }
  const second = await launchApp({ dir: first.dir });
  try {
    await second.page.setViewportSize({ width: 2000, height: 1200 });
    await second.page.getByRole('button', { name: /enter/i }).click();
    const f = await ready(second.page);
    expect(model().name).toBe('External lantern');
    expect(model().elements).toHaveLength(1);
    expect(model().animations[0].name).toBe('Sway');
    expect(doc().project[textureKey]).toEqual(textureRef);
    expect(state('index').open).toHaveLength(2);
    await expect(f.locator('#garden-model-library option')).toHaveCount(3);
    await second.page.screenshot({
      path: join(evidence, 'blockbench-reopened.png'),
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
    const f = await ready(third.page);
    const id = (await third.page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(third.page, id)).projectFolder;
    expect(folder).not.toBe(oldFolder);
    expect(doc().project[textureKey]).toEqual(textureRef);
    await f.locator('#mode_selector li').filter({ hasText: 'Edit' }).click();
    await addCube(f);
    await save(f);
    expect(model().elements).toHaveLength(2);
    expect(model().animations[0].name).toBe('Sway');
    await third.page.screenshot({
      path: join(evidence, 'blockbench-imported.png'),
      animations: 'disabled',
    });
  } finally {
    await third.app.close();
    renameSync(oldFolder + '-unavailable', oldFolder);
  }
});
