import { test, expect, chromium, type Page, type FrameLocator } from '@playwright/test';
import { unzipSync, zipSync } from 'fflate';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

test('GDevelop native game editing, local preview, agent changes and portable reopening', async () => {
  test.setTimeout(600000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  let folder = '',
    mediaKey = '';
  let mediaRef: unknown;
  const evidence = resolve(__dirname, '../../docs/gdevelop');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'game.crux');
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const state = (key: string) => {
    const ref = doc().project?.[key]?.__cruxBinary;
    return ref ? JSON.parse(readFileSync(join(folder, 'data', ref.path), 'utf8')) : null;
  };
  const game = () => state('document');
  const ready = async (page: Page) => {
    const f = page.frameLocator('iframe[data-crux-id]');
    await expect(f.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 180000,
    });
    return f;
  };
  const save = async (f: FrameLocator) => {
    await f
      .locator('#garden-project')
      .getByRole('button', { name: 'Save project', exact: true })
      .click();
    await expect(f.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 30000,
    });
  };
  const localOnly = async (page: Page) => {
    await page
      .context()
      .route(/^https?:\/\//, (route) =>
        ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
          ? route.continue()
          : route.abort(),
      );
  };
  const addInstance = async (f: FrameLocator) => {
    await f.getByText('NewSprite', { exact: true }).click({ button: 'right' });
    await f.getByText('Add instance to the scene', { exact: true }).click();
  };
  try {
    const { page } = first;
    await page.setViewportSize({ width: 2000, height: 1200 });
    await localOnly(page);
    page.on('pageerror', (error) => console.log('GDevelop page error', error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') console.log('GDevelop console error', message.text());
    });
    page.on('requestfailed', (request) =>
      console.log('GDevelop request failed', request.url(), request.failure()?.errorText),
    );
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^GDevelop/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const f = await ready(page);
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder;
    console.log('GDevelop folder', folder);
    await f.getByRole('button', { name: 'Add object', exact: true }).click();
    await f.getByText('Sprite', { exact: true }).click();
    await f.getByRole('button', { name: 'Add an animation', exact: true }).click();
    await f.getByRole('button', { name: 'Add a sprite', exact: true }).click();
    await f.getByLabel('Import game assets').setInputFiles({
      name: 'sprite.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="tomato"/></svg>',
      ),
    });
    await f.getByText('Behaviors', { exact: true }).last().click();
    await f.getByRole('button', { name: 'Add a behavior', exact: true }).click();
    await f.getByText('Top-down movement (4 or 8 directions)', { exact: true }).click();
    await f.getByRole('button', { name: 'Apply', exact: true }).click();
    await addInstance(f);
    await save(f);
    expect(game().layouts[0].instances).toHaveLength(1);
    expect(game().layouts[0].objects[0].animations[0].directions[0].sprites).toHaveLength(1);
    mediaKey = Object.keys(doc().project).find((key) => key.startsWith('media-'))!;
    mediaRef = doc().project[mediaKey];
    expect(Buffer.from(state(mediaKey).bytes, 'base64').toString()).toContain('tomato');
    expect(game().resources.resources[0].file).toMatch(/^garden:media-/);
    await f.locator('#toolbar-preview-button').click();
    await expect(f.frameLocator('#garden-game-preview iframe').locator('canvas')).toBeVisible({
      timeout: 30000,
    });
    const running = page.frames().find((frame) => frame.url().includes('/preview/index.html'))!;
    await running.evaluate(() =>
      (window as any).gdjs.registerRuntimeScenePreEventsCallback((scene: any) => {
        (window as any).__observedScene = scene;
      }),
    );
    await running.waitForFunction(() => (window as any).__observedScene);
    const beforeX = await running.evaluate(() =>
      (window as any).__observedScene.getObjects('NewSprite')[0].getX(),
    );
    await running.locator('canvas').click();
    await page.keyboard.down('ArrowRight');
    await expect
      .poll(() =>
        running.evaluate(() => (window as any).__observedScene.getObjects('NewSprite')[0].getX()),
      )
      .toBeGreaterThan(beforeX + 20);
    await page.keyboard.up('ArrowRight');
    await f.getByRole('button', { name: 'Close game preview', exact: true }).click();
    const chat = page.getByPlaceholder('Send a message...');
    await chat.fill('Name the game and set its scene background [gdevelop:edit]');
    await chat.press('Enter');
    await expect.poll(() => game()?.properties.name, { timeout: 45000 }).toBe('Garden game');
    expect([game().layouts[0].r, game().layouts[0].v, game().layouts[0].b]).toEqual([32, 48, 64]);
    expect(doc().project[mediaKey]).toEqual(mediaRef);
    await first.app.evaluate(({ session }, dir) => {
      (globalThis as any).__gdDownloads = [];
      session.defaultSession.on('will-download', (_event, item) => {
        const name = item.getFilename();
        item.setSavePath(dir + '/' + name);
        item.once('done', (_event, state) =>
          (globalThis as any).__gdDownloads.push({ name, state }),
        );
      });
    }, first.dir);
    await f.getByRole('button', { name: 'Export web game', exact: true }).click();
    await f.getByRole('button', { name: 'Download web game', exact: true }).click();
    await expect
      .poll(
        () =>
          first.app.evaluate(() =>
            (globalThis as any).__gdDownloads.some(
              (d: any) => d.name === 'game.zip' && d.state === 'completed',
            ),
          ),
        { timeout: 60000 },
      )
      .toBe(true);
    await page.keyboard.press('Escape');
    await f.getByRole('button', { name: 'Export editable project', exact: true }).click();
    await expect
      .poll(
        () =>
          first.app.evaluate(() =>
            (globalThis as any).__gdDownloads.some(
              (d: any) => d.name === 'project.zip' && d.state === 'completed',
            ),
          ),
        { timeout: 30000 },
      )
      .toBe(true);
    // Reopen the native editable ZIP through the upstream file-open workflow.
    const editableFiles = unzipSync(readFileSync(join(first.dir, 'project.zip')));
    const editableGame = JSON.parse(Buffer.from(editableFiles['game.json']).toString());
    editableGame.properties.name = 'Reimported game';
    editableFiles['game.json'] = Buffer.from(JSON.stringify(editableGame));
    const reimportPath = join(first.dir, 'roundtrip.zip');
    writeFileSync(reimportPath, zipSync(editableFiles));
    await f.locator('#garden-project').click();
    await page.keyboard.press('ControlOrMeta+o');
    const [projectChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      f.getByRole('button', { name: 'Crux Garden', exact: true }).click(),
    ]);
    await projectChooser.setFiles(reimportPath);
    await expect.poll(() => game()?.properties.name, { timeout: 30000 }).toBe('Reimported game');
    await ready(page);
    await save(f);
    expect(game().layouts[0].instances).toHaveLength(1);
    expect(doc().project[mediaKey]).toEqual(mediaRef);
    const external = doc();
    const bytes = Buffer.from(
      JSON.stringify({ ...game(), properties: { ...game().properties, name: 'External game' } }),
    );
    const hash = createHash('sha256').update(bytes).digest('hex');
    writeFileSync(join(folder, 'data/assets', hash + '.bin'), bytes);
    external.project.document = {
      __cruxBinary: {
        path: `assets/${hash}.bin`,
        kind: 'buffer',
        type: 'application/json',
        size: bytes.length,
      },
    };
    writeFileSync(join(folder, 'data/project.json'), JSON.stringify(external));
    await addInstance(f);
    await f
      .locator('#garden-project')
      .getByRole('button', { name: 'Save project', exact: true })
      .click();
    await expect(f.locator('#garden-project [role=status]')).toContainText('changed elsewhere');
    expect(game().properties.name).toBe('External game');
    page.once('dialog', (dialog) => dialog.accept());
    await f.getByRole('button', { name: 'Reload saved project', exact: true }).click();
    await ready(page);
    await page.screenshot({
      path: join(evidence, 'gdevelop-workshop.png'),
      animations: 'disabled',
    });
  } finally {
    await first.app.close();
  }
  await checkExportedGame(join(first.dir, 'game.zip'));
  const second = await launchApp({ dir: first.dir });
  try {
    await second.page.setViewportSize({ width: 2000, height: 1200 });
    await localOnly(second.page);
    await second.page.getByRole('button', { name: /enter/i }).click();
    const f = await ready(second.page);
    expect(game().properties.name).toBe('External game');
    expect(game().layouts[0].instances).toHaveLength(1);
    expect(doc().project[mediaKey]).toEqual(mediaRef);
    await f.locator('#toolbar-preview-button').click();
    await expect(f.frameLocator('#garden-game-preview iframe').locator('canvas')).toBeVisible({
      timeout: 30000,
    });
    await second.page.screenshot({
      path: join(evidence, 'gdevelop-reopened.png'),
      animations: 'disabled',
    });
    await f.getByRole('button', { name: 'Close game preview', exact: true }).click();
    await exportNativeCrux(second.page, archive, second.app);
  } finally {
    await second.app.close();
  }
  const oldFolder = folder;
  renameSync(oldFolder, oldFolder + '-unavailable');
  const third = await launchApp();
  try {
    await third.page.setViewportSize({ width: 2000, height: 1200 });
    await localOnly(third.page);
    await enterGarden(third.page);
    await importNativeCrux(third.page, archive);
    const f = await ready(third.page);
    const id = (await third.page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(third.page, id)).projectFolder;
    expect(folder).not.toBe(oldFolder);
    expect(doc().project[mediaKey]).toEqual(mediaRef);
    await addInstance(f);
    await save(f);
    expect(game().layouts[0].instances).toHaveLength(2);
    await f.locator('#toolbar-preview-button').click();
    await expect(f.frameLocator('#garden-game-preview iframe').locator('canvas')).toBeVisible({
      timeout: 30000,
    });
    await third.page.screenshot({
      path: join(evidence, 'gdevelop-imported.png'),
      animations: 'disabled',
    });
    await f.getByRole('button', { name: 'Close game preview', exact: true }).click();
    await f.locator('#add-new-object-button').click();
    await f.getByText('3D Box', { exact: true }).click();
    await f.getByRole('button', { name: 'Apply', exact: true }).click();
    await f.getByText('New3DBox', { exact: true }).click({ button: 'right' });
    await f.getByText('Add instance to the scene', { exact: true }).click();
    await save(f);
    await f.getByRole('button', { name: '3D', exact: true }).click();
    await f.locator('#toolbar-preview-button').click();
    await expect(f.frameLocator('#garden-game-preview iframe').locator('canvas')).toBeVisible();
    const gameFrame = third.page
      .frames()
      .find((frame) => frame.url().includes('/preview/index.html'))!;
    await gameFrame.evaluate(() =>
      (window as any).gdjs.registerRuntimeScenePreEventsCallback((scene: any) => {
        (window as any).__observedScene = scene;
      }),
    );
    await expect
      .poll(() =>
        gameFrame.evaluate(
          () =>
            (window as any).__observedScene?.getObjects('New3DBox')[0]?.get3DRendererObject()?.type,
        ),
      )
      .toBe('Mesh');
    await third.page.screenshot({
      path: join(evidence, 'gdevelop-3d.png'),
      animations: 'disabled',
    });
  } finally {
    await third.app.close();
    renameSync(oldFolder + '-unavailable', oldFolder);
  }
});

async function checkExportedGame(path: string) {
  const files = unzipSync(readFileSync(path));
  const server = createServer((request, response) => {
    const name =
      decodeURIComponent(new URL(request.url!, 'http://localhost').pathname).slice(1) ||
      'index.html';
    const bytes = files[name];
    if (!bytes) {
      response.writeHead(404);
      response.end();
      return;
    }
    const extension = name.split('.').pop()!;
    response.setHeader(
      'Content-Type',
      (
        {
          html: 'text/html',
          js: 'text/javascript',
          json: 'application/json',
          svg: 'image/svg+xml',
          wasm: 'application/wasm',
        } as Record<string, string>
      )[extension] || 'application/octet-stream',
    );
    response.end(Buffer.from(bytes));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    await page.route('**/*', (route) =>
      route
        .request()
        .url()
        .startsWith(origin + '/') || /^(data|blob):/.test(route.request().url())
        ? route.continue()
        : route.abort(),
    );
    await page.goto(origin);
    await expect(page.locator('canvas')).toBeVisible();
    await page.evaluate(() =>
      (window as any).gdjs.registerRuntimeScenePreEventsCallback((scene: any) => {
        (window as any).__observedScene = scene;
      }),
    );
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as any).__observedScene?.getObjects('NewSprite')[0]?.getWidth(),
        ),
      )
      .toBe(64);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
