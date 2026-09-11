import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
test('Bitsy native editor, agent, playable export, conflict and restart', async () => {
  test.setTimeout(180000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  let folder = '';
  const evidence = resolve(__dirname, '../../docs/bitsy');
  mkdirSync(evidence, { recursive: true });
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const game = () => JSON.parse(doc().project.storage.game_data);
  try {
    const { page } = first;
    page.on('pageerror', (e) => console.log('Bitsy error', e.message));
    await page.setViewportSize({ width: 1700, height: 1100 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Bitsy/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 60000,
    });
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder;
    console.log('Bitsy folder', folder);
    await frame.locator('#titleFlexItem input').fill('A Hand Drawn Garden');
    await frame.locator('#titleFlexItem input').press('Tab');
    await expect.poll(game).toContain('A Hand Drawn Garden');
    // Native room canvas placement changes authored tiles.
    const before = game();
    await frame.locator('#roomPanel canvas').click({ position: { x: 100, y: 100 }, delay: 100 });
    await expect.poll(game).not.toBe(before);
    const chat = page.getByPlaceholder('Send a message...');
    await chat.fill('Title this game [bitsy:title]');
    await chat.press('Enter');
    await expect.poll(game, { timeout: 45000 }).toContain('The Midnight Garden');
    await frame.locator('label[for=playModeCheck]').click();
    await expect(frame.locator('#playModeText')).toHaveText(/stop/i);
    await frame.locator('label[for=playModeCheck]').click();
    const exportPath = join(first.dir, 'tiny-game.html');
    await first.app.evaluate(({ session }, path) => {
      (globalThis as any).__bitsyDownload = null;
      session.defaultSession.once('will-download', (_e, item) => {
        item.setSavePath(path);
        item.once('done', (_e, state) => {
          (globalThis as any).__bitsyDownload = state;
        });
      });
    }, exportPath);
    if (!(await frame.locator('#gamePanel').isVisible()))
      await frame.locator('label[for=gameCheck]').click();
    await frame.locator('button[title="save game as .html file"]').click();
    await expect
      .poll(() => first.app.evaluate(() => (globalThis as any).__bitsyDownload))
      .toBe('completed');
    expect(readFileSync(exportPath, 'utf8')).toContain('The Midnight Garden');
    const playable = await first.app.evaluate(async ({ BrowserWindow }, path) => {
      const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
      try {
        await win.loadFile(path);
        return await win.webContents.executeJavaScript(
          'new Promise((resolve,reject)=>setTimeout(()=>{try{resolve({title:getTitle(),canvas:!!document.querySelector("canvas"),engine:typeof loadGame})}catch(e){reject(e)}},150))',
        );
      } finally {
        win.destroy();
      }
    }, exportPath);
    expect(playable).toEqual({ title: 'The Midnight Garden', canvas: true, engine: 'function' });
    const external = doc();
    external.project.storage.game_data = JSON.stringify(
      game().replace('The Midnight Garden', 'External garden'),
    );
    writeFileSync(join(folder, 'data/project.json'), JSON.stringify(external));
    await frame.locator('#titleFlexItem input').fill('Unsaved draft');
    await frame.locator('#titleFlexItem input').press('Tab');
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toContainText('changed elsewhere');
    expect(game()).toContain('External garden');
    page.once('dialog', (d) => d.accept());
    await frame.getByRole('button', { name: 'Reload saved project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden');
    await expect(frame.locator('#titleFlexItem input')).toHaveValue('External garden');
    await frame.locator('#editorWindow').evaluate((e) => {
      e.scrollLeft = 0;
    });
    await expect(frame.locator('#topbar')).toBeInViewport();
    await page.screenshot({ path: join(evidence, 'bitsy-workshop.png') });
  } finally {
    await first.app.close();
  }
  const second = await launchApp({ dir: first.dir, env: { CRUX_AI_MOCK: '1' } });
  try {
    await second.page.setViewportSize({ width: 1700, height: 1100 });
    await second.page.getByRole('button', { name: /enter/i }).click();
    const frame = second.page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 60000,
    });
    await expect(frame.locator('#titleFlexItem input')).toHaveValue('External garden');
    expect(
      await frame.locator('body').evaluate(() => (window as any).serializeWorld(true)),
    ).toContain('External garden');
    await frame.locator('#editorWindow').evaluate((e) => {
      e.scrollLeft = 0;
    });
    await expect(frame.locator('#topbar')).toBeInViewport();
    await second.page.screenshot({ path: join(evidence, 'bitsy-reopened.png') });
  } finally {
    await second.app.close();
  }
  const resources = join(folder, 'editor/script/generated/resources.js');
  const originalResources = readFileSync(resources, 'utf8');
  execFileSync(process.execPath, [join(folder, 'dev/resource_packager.cjs')]);
  expect(readFileSync(resources, 'utf8')).toBe(originalResources);
});
