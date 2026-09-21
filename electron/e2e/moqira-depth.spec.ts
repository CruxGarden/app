import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux, setAutoCheck } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';
import { outputs } from './game-cruxspace-helpers';

test('Moqira subtitles remain directly editable after saving and reopening the app', async () => {
  test.setTimeout(120000);
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    await page.getByRole('button', { name: /^Mockups/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const frame = page.frameLocator('iframe[data-crux-id]');
    const status = frame.locator('#garden-project [role=status]');
    await expect(status).toHaveText('Saved', { timeout: 90000 });
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const folder = (await storedCrux(page, id)).projectFolder;
    await frame.locator('.library-item').getByText('Text Subtitle', { exact: true }).click();
    await frame.locator('.canvas-node').dblclick();
    const editor = frame.locator('.floating-text-editor textarea');
    await editor.fill('Fix it together. Keep it longer.');
    await editor.press('Meta+Enter');
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(status).toHaveText('Saved');
    const subtitle = () =>
      JSON.parse(readFileSync(join(folder, 'mockups/project.json'), 'utf8')).wireframes[0].nodes[0];
    expect(subtitle()).toMatchObject({
      kind: 'textSubtitle',
      text: 'Fix it together. Keep it longer.',
    });
    await page
      .getByTestId('workshop-view')
      .getByRole('button', { name: 'Advanced', exact: true })
      .click();
    await page
      .getByTestId('workshop-view')
      .getByRole('button', { name: 'Use app', exact: true })
      .click();
    await expect(status).toHaveText('Saved', { timeout: 90000 });
    await frame.locator('.canvas-node').dblclick();
    await expect(editor).toHaveValue('Fix it together. Keep it longer.');
    await editor.fill('A second direct revision');
    await editor.press('Meta+Enter');
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(status).toHaveText('Saved');
    expect(subtitle().text).toBe('A second direct revision');
  } finally {
    await app.close();
  }
});

test('Moqira tools create editable screens, preserve manual work, use native history and survive a complete import', async () => {
  test.setTimeout(360000);
  let instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const dir = instance.dir,
    archive = join(dir, 'wireframes.crux');
  const evidence = resolve(__dirname, '../../docs/moqira-depth');
  mkdirSync(evidence, { recursive: true });
  let folder = '',
    id = '';
  const frame = () => instance.page.frameLocator('iframe[data-crux-id]');
  const doc = () => JSON.parse(readFileSync(join(folder, 'mockups/project.json'), 'utf8'));
  const ready = () =>
    expect(frame().locator('#garden-project [role=status]')).toHaveText('Saved', {
      timeout: 90000,
    });
  const save = async () => {
    await frame().getByRole('button', { name: 'Save project', exact: true }).click();
    await ready();
  };
  const run = async (action: string) => {
    const page = instance.page,
      toggle = page.getByRole('button', { name: 'Toggle collaboration' });
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
    const done = 'Moqira depth ' + action + ' complete.';
    const count = async () =>
      (await storedCrux(page, id)).messages.filter(
        (m: any) => m.role === 'assistant' && m.content === done,
      ).length;
    const previous = await count();
    const box = page.getByPlaceholder('Send a message...');
    await box.fill('Use Mockups [moqira:depth-' + action + ']');
    await box.press('Enter');
    console.log('Moqira depth:', action);
    await expect.poll(count, { timeout: 60000 }).toBe(previous + 1);
    expect(
      (await storedCrux(page, id)).messages
        .flatMap((m: any) => m.toolCalls ?? [])
        .filter((c: any) => c.result?.startsWith('Error')),
    ).toEqual([]);
    await ready();
  };
  const manualTitle = async (text: string) => {
    await frame()
      .locator('.canvas-node')
      .filter({ hasText: /Bloom & Ink|Handmade stationery/ })
      .first()
      .dblclick();
    const editor = frame().locator('.floating-text-editor textarea');
    await editor.fill(text);
    await editor.press('Meta+Enter');
    await save();
  };
  try {
    await instance.page.setViewportSize({ width: 2000, height: 1200 });
    await enterGarden(instance.page);
    await instance.page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    await instance.page.getByRole('button', { name: /^Mockups/ }).click();
    await instance.page.getByRole('button', { name: 'Create', exact: true }).click();
    await ready();
    id = (await instance.page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(instance.page, id)).projectFolder;
    await setAutoCheck(instance.page, false);
    // The Artifact is a real PNG generated in Chromium, then ingested normally.
    const image = await instance.page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 80;
      canvas.height = 80;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#7d416c';
      context.fillRect(0, 0, 80, 80);
      context.fillStyle = '#f7e9ce';
      context.font = 'bold 40px serif';
      context.fillText('B', 25, 55);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    writeFileSync(join(folder, 'brand.png'), Buffer.from(image, 'base64'));
    await expect
      .poll(
        () =>
          instance.page.evaluate(async () =>
            window.electronAPI!.sqlite.get(
              "SELECT id FROM artifacts WHERE path = 'brand.png' LIMIT 1",
            ),
          ),
        { timeout: 60000 },
      )
      .toBeTruthy();
    await ready();
    await run('catalogue');
    await run('create');
    expect(doc().wireframes[0].nodes).toHaveLength(3);
    await expect(frame().locator('.canvas-node')).toHaveCount(3);
    await manualTitle('Handmade stationery');
    const heroId = doc().wireframes[0].nodes[0].id;
    await run('revise');
    expect(doc().wireframes[0].nodes[0]).toMatchObject({
      id: heroId,
      text: 'Handmade stationery',
      x: 70,
      width: 540,
    });
    await run('screen');
    await run('link');
    await run('home');
    await run('duplicate');
    expect(doc().wireframes[0].nodes).toHaveLength(4);
    await run('undo');
    expect(doc().wireframes[0].nodes).toHaveLength(3);
    await run('redo');
    expect(doc().wireframes[0].nodes).toHaveLength(4);
    await run('undo');
    await run('image');
    const embeddedImage = doc().wireframes[0].nodes.find(
      (n: any) => n.kind === 'image',
    ).imageDataUrl;
    expect(embeddedImage).toBe('data:image/png;base64,' + image);
    // Exercise the frame protocol while keeping focus in a native unfinished draft.
    await frame().locator('.canvas-node').filter({ hasText: 'Handmade stationery' }).dblclick();
    await frame().locator('.floating-text-editor textarea').fill('Unfinished manual draft');
    const rejected = await instance.page.evaluate(
      () =>
        new Promise<string>((resolve, reject) => {
          const frame = document.querySelector<HTMLIFrameElement>('iframe[data-crux-id]')!;
          const id = crypto.randomUUID();
          const timeout = setTimeout(() => reject(Error('Missing tool response')), 10000);
          const listener = (event: MessageEvent) => {
            if (event.source !== frame.contentWindow || event.data?.commandId !== id) return;
            clearTimeout(timeout);
            window.removeEventListener('message', listener);
            resolve(event.data.error ?? '');
          };
          window.addEventListener('message', listener);
          frame.contentWindow!.postMessage(
            { type: 'crux:app:command', id, command: { op: 'inspect' } },
            '*',
          );
        }),
    );
    expect(rejected).toContain('Finish or cancel');
    await expect(frame().locator('.floating-text-editor textarea')).toHaveValue(
      'Unfinished manual draft',
    );
    expect(doc().wireframes[0].nodes[0].text).toBe('Handmade stationery');
    await frame().locator('.floating-text-editor textarea').press('Escape');
    await run('play');
    await frame()
      .locator('.canvas-node')
      .getByText('Explore the collection', { exact: true })
      .click();
    await expect(frame().locator('.wireframe-row.is-active')).toContainText('Collection');
    await run('home');
    await run('export');
    const output = outputs(folder).find((o) => o.mimeType === 'application/x-moqira+json')!;
    expect(output).toBeDefined();
    const exported = JSON.parse(readFileSync(join(folder, output.path), 'utf8'));
    expect(exported.wireframes[0].nodes[0].text).toBe('Handmade stationery');
    expect(exported.wireframes[0].nodes.find((n: any) => n.kind === 'image').imageDataUrl).toBe(
      embeddedImage,
    );
    await instance.page.screenshot({ path: join(evidence, 'native-design.png') });
    await instance.app.close();
    instance = await launchApp({ dir });
    await instance.page.setViewportSize({ width: 2000, height: 1200 });
    await instance.page.getByRole('button', { name: /enter/i }).click();
    await ready();
    await expect(
      frame().locator('.canvas-node').getByText('Handmade stationery', { exact: true }),
    ).toBeVisible();
    await exportNativeCrux(instance.page, archive, instance.app);
    await instance.app.close();
    const originalFolder = folder;
    renameSync(folder, folder + '-unavailable');
    instance = await launchApp();
    await instance.page.setViewportSize({ width: 2000, height: 1200 });
    await enterGarden(instance.page);
    await importNativeCrux(instance.page, archive);
    await ready();
    id = (await instance.page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(instance.page, id)).projectFolder;
    expect(folder).not.toBe(originalFolder);
    expect(doc().wireframes[0].nodes.find((n: any) => n.kind === 'image').imageDataUrl).toBe(
      embeddedImage,
    );
    expect(JSON.parse(readFileSync(join(folder, output.path), 'utf8'))).toEqual(exported);
    await manualTitle('Paper goods, made with care');
    expect(doc().wireframes[0].nodes[0].text).toBe('Paper goods, made with care');
    expect(
      doc().wireframes[0].nodes.find((n: any) => n.kind === 'button').links.whole.wireframeId,
    ).toBe(doc().wireframes[1].id);
    await instance.page.screenshot({ path: join(evidence, 'portable-design.png') });
  } finally {
    await instance.app.close().catch(() => {});
  }
});
