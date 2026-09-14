import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

/**
 * Wick Editor (the actual editor with its engine) as a Crux Tool: a rectangle
 * drawn with the real tool saves the project as its own .wick file (a binary
 * Artifact referenced from data/project.json); the scripted collaborator names
 * the project and sets its frame rate; the project survives a restart; a
 * complete Crux archive imports into a clean Garden with the folder gone.
 */
const frameOf = (page: Page) => page.frameLocator('iframe[data-crux-id]');
const status = (page: Page) => frameOf(page).locator('#garden-project [role=status]');
async function ready(page: Page) {
  await expect(status(page)).toHaveText('Saved to Garden', { timeout: 180000 });
  // Upstream's welcome message opens on every fresh load; a person dismisses it the same way.
  const welcome = frameOf(page).getByText('Try it', { exact: true });
  if (await welcome.count()) await welcome.first().click();
  await expect(
    frameOf(page)
      .locator('#action-button-tooltip-tool-button-rectangle')
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
}
const projectOf = (page: Page) =>
  frameOf(page)
    .locator('body')
    .evaluate(() => {
      const p = (window as any).gardenEditor.project;
      return {
        name: String(p.name || ''),
        framerate: p.framerate as number,
        paths: p.activeFrame ? (p.activeFrame.paths.length as number) : -1,
      };
    });
/** Draw a rectangle on the real canvas with the real tool. */
async function drawRectangle(page: Page) {
  const frame = frameOf(page);
  await frame
    .locator('#action-button-tooltip-tool-button-rectangle')
    .filter({ visible: true })
    .first()
    .click(); // the desktop toolbar; a mobile one shares the id
  const canvas = frame.locator('#canvas-container-wrapper canvas').first();
  const box = (await canvas.boundingBox())!;
  const x = box.x + box.width * 0.4;
  const y = box.y + box.height * 0.4;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 120, y + 80, { steps: 8 });
  await page.mouse.up();
}

test('Wick Editor: a drawn rectangle saves the .wick file, agent tools, restart and clean import', async () => {
  test.setTimeout(15 * 60_000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const evidence = resolve(__dirname, '../../docs/wick-editor');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'anim.crux');
  let folder = '';
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const errors: string[] = [];
  let firstFile = '';
  try {
    const { page } = first;
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1800, height: 1100 });
    await enterGarden(page);

    await test.step('create from the picker; the editor and engine boot and the fresh project saves as a .wick file', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Wick Editor/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      console.log('Wick folder', folder);
      await ready(page);
      await expect
        .poll(() => doc().project?.file?.__cruxBinary?.path ?? '')
        .toMatch(/^assets\/[a-f0-9]{64}\.bin$/);
      firstFile = doc().project.file.__cruxBinary.path;
      expect(existsSync(join(folder, 'data', firstFile))).toBe(true);
      expect(
        readFileSync(join(folder, 'data', firstFile))
          .subarray(0, 2)
          .toString('latin1'),
      ).toBe('PK'); // a zip: the .wick file
      await page.screenshot({ path: join(evidence, 'wick-initial.png') });
    });

    await test.step('a person draws a rectangle with the real tool; a new .wick file is saved', async () => {
      await drawRectangle(page);
      await expect.poll(() => projectOf(page).then((p) => p.paths)).toBeGreaterThan(0);
      await expect
        .poll(() => doc().project.file.__cruxBinary.path, { timeout: 60000 })
        .not.toBe(firstFile);
      await ready(page);
      await page.screenshot({ path: join(evidence, 'wick-drawn.png') });
    });

    await test.step('the scripted collaborator names the project and sets the frame rate', async () => {
      const collab = page.getByRole('button', { name: 'Toggle collaboration' });
      if ((await collab.getAttribute('aria-pressed')) !== 'true') await collab.click();
      const box = page.getByPlaceholder('Send a message...');
      await box.fill('Name the project and set the frame rate [wick:edit]');
      await box.press('Enter');
      await expect(
        page.getByText('Named the project Garden anim and set 24 frames per second.', {
          exact: true,
        }),
      ).toBeVisible({ timeout: 150000 });
      await ready(page);
      expect(doc().project).toMatchObject({ name: 'Garden anim', framerate: 24 });
      expect(await projectOf(page)).toMatchObject({ name: 'Garden anim', framerate: 24 });
      await collab.click();
      await page.screenshot({ path: join(evidence, 'wick-agent.png') });
    });
    expect(errors).toEqual([]);
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ dir: first.dir });
  try {
    const { page } = second;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1800, height: 1100 });
    await test.step('restart: the project reopens from its .wick file with the drawing, name and frame rate', async () => {
      await page.getByRole('button', { name: /enter/i }).click();
      await ready(page);
      await expect
        .poll(() => projectOf(page))
        .toMatchObject({ name: 'Garden anim', framerate: 24 });
      expect((await projectOf(page)).paths).toBeGreaterThan(0);
      await page.screenshot({ path: join(evidence, 'wick-reopened.png') });
      await exportNativeCrux(page, archive, second.app);
    });
  } finally {
    await second.app.close();
  }

  renameSync(folder, `${folder}-unavailable`);
  const third = await launchApp();
  try {
    const { page } = third;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1800, height: 1100 });
    await test.step('clean Garden: the complete Crux imports and drawing continues', async () => {
      await enterGarden(page);
      await importNativeCrux(page, archive);
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      await ready(page);
      await expect
        .poll(() => projectOf(page))
        .toMatchObject({ name: 'Garden anim', framerate: 24 });
      const before = doc().project.file.__cruxBinary.path;
      await drawRectangle(page);
      await expect
        .poll(() => doc().project.file.__cruxBinary.path, { timeout: 60000 })
        .not.toBe(before);
      await ready(page);
      await page.screenshot({ path: join(evidence, 'wick-imported.png') });
    });
  } finally {
    await third.app.close();
  }
});
