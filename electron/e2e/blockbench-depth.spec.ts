import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { collaborator, outputs } from './game-cruxspace-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

test('model depth: native prop creation, manual texture and name, scoped geometry, Undo, outputs and portable editing', async () => {
  test.setTimeout(420000);
  let instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const dir = instance.dir;
  const archive = join(dir, 'stand.crux');
  const evidence = resolve(__dirname, '../../docs/blockbench-depth');
  mkdirSync(evidence, { recursive: true });
  let folder = '',
    modelId = '';
  const frame = () => instance.page.frameLocator('iframe[data-crux-id]');
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const state = (key: string) => {
    const ref = doc().project?.[key]?.__cruxBinary;
    return ref ? JSON.parse(readFileSync(join(folder, 'data', ref.path), 'utf8')) : null;
  };
  const model = () => state('model-' + modelId);
  const media = () =>
    Object.fromEntries(Object.entries(doc().project).filter(([key]) => key.startsWith('asset-')));
  const ready = () =>
    expect(frame().locator('#garden-project [role=status]')).toHaveText(
      /Saved to Garden|Output saved to Cruxspace/,
      { timeout: 90000 },
    );
  const save = async () => {
    await frame().getByRole('button', { name: 'Save project', exact: true }).click();
    await ready();
  };
  const history = async (op: 'undo' | 'redo') => {
    await frame().locator('#menu_bar').getByText('Edit', { exact: true }).click();
    await frame().locator(`[menu_item="${op}"]`).click();
    await save();
  };
  const toggleChat = async () => {
    const toggle = instance.page.getByRole('button', { name: 'Toggle collaboration' });
    if ((await toggle.getAttribute('aria-pressed')) === 'true') await toggle.click();
  };
  let expectedMedia: Record<string, unknown> = {};
  const check = () => {
    expect(model().name).toBe('Seedling stand');
    expect(model().elements).toHaveLength(3);
    expect(model().elements.find((e: any) => e.name === 'Shelf - hand painted').to).toEqual([
      10, 14, 5,
    ]);
    expect(media()).toEqual(expectedMedia);
    expect(model().textures).toHaveLength(1);
    expect(model().outliner[0].children).toHaveLength(3);
  };
  try {
    let page = instance.page;
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => console.log('Model page error:', e.message));
    await page.setViewportSize({ width: 2000, height: 1200 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Blockbench/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await ready();
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder;
    console.log('Model depth folder', folder);
    await collaborator(
      page,
      'Build a small plant stand [blockbench:depth-create]',
      'Built an editable three-part stand.',
    );
    await save();
    const calls = (await storedCrux(page, id)).messages.flatMap((m: any) => m.toolCalls ?? []);
    expect(calls.filter((c: any) => c.result?.startsWith('Error'))).toEqual([]);
    modelId = state('index').active;
    expect(model().elements).toHaveLength(3);
    expect(model().groups.find((g: any) => g.uuid === model().outliner[0].uuid).name).toBe('Stand');
    await toggleChat();
    await history('undo');
    await expect.poll(() => model().elements.length).toBe(4);
    await history('redo');
    await expect.poll(() => model().elements.length).toBe(3);
    const shelfId = model().elements.find((e: any) => e.name === 'Shelf').uuid;
    await frame().locator(`[id="${shelfId}"] > .outliner_object`).click();
    await page.keyboard.press('F2');
    const name = frame().locator(`[id="${shelfId}"] input.cube_name`);
    await expect(name).toBeEnabled();
    await name.fill('Shelf - hand painted');
    await name.press('Enter');
    await save();
    await frame().locator('[toolbar_item="create_texture"]').first().click();
    await frame()
      .locator('#add_bitmap')
      .getByRole('button', { name: 'Confirm', exact: true })
      .click();
    await save();
    const beforePaint = media();
    await frame().locator('#mode_selector li').filter({ hasText: 'Paint' }).click();
    await frame()
      .locator('#uv_frame')
      .click({ position: { x: 12, y: 12 } });
    await save();
    expectedMedia = media();
    expect(expectedMedia).not.toEqual(beforePaint);
    const manualElements = model().elements;
    await frame().locator('#mode_selector li').filter({ hasText: 'Edit' }).click();
    await collaborator(
      page,
      'Widen only the shelf [blockbench:depth-revise]',
      'Widened the shelf while preserving your name and painted texture.',
    );
    await save();
    expect(
      (await storedCrux(page, id)).messages
        .flatMap((m: any) => m.toolCalls ?? [])
        .filter((c: any) => c.result?.startsWith('Error')),
    ).toEqual([]);
    check();
    expect(model().elements).toEqual(
      manualElements.map((e: any) => (e.uuid === shelfId ? { ...e, to: [10, 14, 5] } : e)),
    );
    await toggleChat();
    await history('undo');
    await expect
      .poll(() => model().elements.find((e: any) => e.uuid === shelfId).to)
      .toEqual([8, 14, 5]);
    expect(media()).toEqual(expectedMedia);
    await history('redo');
    await expect
      .poll(() => model().elements.find((e: any) => e.uuid === shelfId).to)
      .toEqual([10, 14, 5]);
    check();
    const nativeOutput = outputs(folder).find((o) => o.label === 'Revised editable stand')!;
    const native = JSON.parse(readFileSync(join(folder, nativeOutput.path), 'utf8'));
    expect(native.elements).toHaveLength(3);
    expect(native.elements.find((e: any) => e.uuid === shelfId).to).toEqual([10, 14, 5]);
    expect(native.textures[0].source).toMatch(/^data:image\/png;base64,/);
    const sceneOutput = outputs(folder).find((o) => o.label === 'Revised stand scene')!;
    const sceneBytes = readFileSync(join(folder, sceneOutput.path));
    const scene = JSON.parse(sceneBytes.toString());
    expect(scene.asset.version).toBe('2.0');
    expect(scene.meshes).toHaveLength(3);
    const shelfMesh =
      scene.meshes[scene.nodes.find((n: any) => n.name === 'Shelf - hand painted').mesh];
    const positions = scene.accessors[shelfMesh.primitives[0].attributes.POSITION];
    // Native default export scale is 16 model units per scene unit.
    expect(positions.min).toEqual([-8 / 16, 12 / 16, -5 / 16]);
    expect(positions.max).toEqual([10 / 16, 14 / 16, 5 / 16]);
    expect(scene.images.length).toBeGreaterThan(0);
    expect(
      [...scene.images, ...scene.buffers].every((a: any) => !a.uri || a.uri.startsWith('data:')),
    ).toBe(true);
    copyFileSync(join(folder, nativeOutput.path), join(evidence, 'stand.bbmodel'));
    copyFileSync(join(folder, sceneOutput.path), join(evidence, 'stand.gltf'));
    await page.screenshot({ path: join(evidence, 'native-stand.png') });
    await instance.app.close();
    instance = await launchApp({ dir, env: { CRUX_AI_MOCK: '1' } });
    page = instance.page;
    await page.getByRole('button', { name: /enter/i }).click();
    await ready();
    check();
    await exportNativeCrux(page, archive, instance.app);
    await instance.app.close();
    renameSync(folder, folder + '.source-offline');
    instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    page = instance.page;
    await page.setViewportSize({ width: 2000, height: 1200 });
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
    expect(
      readFileSync(
        join(folder, outputs(folder).find((o) => o.label === 'Revised stand scene')!.path),
      ),
    ).toEqual(sceneBytes);
    await toggleChat();
    await frame().locator(`[id="${shelfId}"] > .outliner_object`).click();
    const size = frame().locator('[toolbar_item="slider_size_y"] .nslide');
    await size.click();
    await size.fill('3');
    await size.press('Enter');
    await save();
    await expect.poll(() => model().elements.find((e: any) => e.uuid === shelfId).to[1]).toBe(15);
    await history('undo');
    await expect.poll(() => model().elements.find((e: any) => e.uuid === shelfId).to[1]).toBe(14);
    check();
    await page.screenshot({ path: join(evidence, 'portable-stand.png') });
  } finally {
    await instance.app.close().catch(() => {});
  }
});
