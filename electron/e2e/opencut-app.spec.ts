import {
  test,
  expect,
  type Page,
  type FrameLocator,
  type ElectronApplication,
} from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';
import type { DownloadItem, Event } from 'electron';
declare const gardenEditor: any;
declare const gardenSession: any;

const ffmpeg = resolve(__dirname, '../node_modules/ffmpeg-static/ffmpeg');
const validate = (file: string) =>
  execFileSync(
    process.execPath,
    [resolve(__dirname, '../../opencut-crux/garden/validate-export.mjs'), file, ffmpeg],
    { encoding: 'utf8' },
  );
const ready = async (page: Page) => {
  const frame = page.frameLocator('iframe[data-crux-id]');
  try {
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 90000,
    });
  } catch (error) {
    console.log(
      'Native readiness failure:',
      await frame.locator('body').evaluate(() => ({
        text: document.body.innerText.slice(0, 1500),
        dirty: gardenEditor?.save.getIsDirty(),
        loading: gardenEditor?.project.getIsLoading(),
        saveError: String(gardenEditor?.save.getError()),
        active: !!gardenEditor?.project.getActiveOrNull(),
      })),
    );
    throw error;
  }
  await expect
    .poll(
      () => frame.locator('body').evaluate(() => !!gardenEditor?.scenes.getActiveSceneOrNull()),
      { timeout: 30000 },
    )
    .toBe(true);
  return frame;
};
const textValue = (frame: FrameLocator) =>
  frame
    .locator('body')
    .evaluate(
      () =>
        gardenEditor.scenes.getActiveScene().tracks.overlay.find((t: any) => t.type === 'text')
          .elements[0].params.content,
    );
const editText = (frame: FrameLocator, content: string) =>
  frame.locator('body').evaluate((_body, content) => {
    const t = gardenEditor.scenes
        .getActiveScene()
        .tracks.overlay.find((t: any) => t.type === 'text'),
      el = t.elements[0];
    gardenEditor.timeline.updateElements({
      updates: [{ trackId: t.id, elementId: el.id, patch: { params: { ...el.params, content } } }],
    });
  }, content);
async function exportVideo(frame: FrameLocator, app: ElectronApplication, destination: string) {
  await app.evaluate(({ session }, destination) => {
    (globalThis as any).__videoDownload = undefined;
    const listener = (_event: Event, item: DownloadItem) => {
      if (!item.getFilename().endsWith(destination.slice(destination.lastIndexOf('.')))) return;
      session.defaultSession.removeListener('will-download', listener);
      item.setSavePath(destination);
      item.once('done', (_event, result) => {
        (globalThis as any).__videoDownload = result;
      });
    };
    session.defaultSession.on('will-download', listener);
  }, destination);
  await frame.getByRole('button', { name: 'Export', exact: true }).click();
  await frame.getByText('Format', { exact: true }).click();
  await frame.getByRole('radio', { name: destination.endsWith('.mp4') ? /MP4/ : /WebM/ }).click();
  await frame.getByRole('dialog').getByRole('button', { name: 'Export', exact: true }).click();
  await expect
    .poll(() => app.evaluate(() => (globalThis as any).__videoDownload), { timeout: 120000 })
    .toBe('completed');
  console.log('Decoded video:', validate(destination));
}

test('OpenCut native video editing, agent, export, conflicts, restart and independent complete import', async () => {
  test.setTimeout(480000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const evidence = resolve(__dirname, '../../docs/opencut');
  mkdirSync(evidence, { recursive: true });
  for (const [color, hz] of [
    ['red', 440],
    ['blue', 660],
  ])
    execFileSync(ffmpeg, [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      `color=c=${color}:s=320x180:r=24:d=2`,
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=${hz}:duration=2`,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      join(first.dir, color + '.mp4'),
    ]);
  const pageErrors: string[] = [];
  let folder = '';
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const records = () =>
    Object.fromEntries(
      Object.entries(doc().project)
        .filter(([k]) => !k.startsWith('file-'))
        .map(([k, v]: [string, any]) => [
          k,
          JSON.parse(readFileSync(join(folder, 'data', v.__cruxBinary.path), 'utf8')),
        ]),
    );
  const project = () =>
    Object.entries(records()).find(([k]) =>
      k.startsWith('record-["video-editor-projects"'),
    )?.[1] as any;
  const archive = join(first.dir, 'video.crux');
  try {
    const { page } = first;
    page.setDefaultTimeout(30000);
    await page.setViewportSize({ width: 2000, height: 1200 });
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') console.log('APP:', m.text(), m.location());
    });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    await page.getByRole('button', { name: /^OpenCut/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
    let frame = await ready(page);
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder;
    console.log('OpenCut original Project Folder:', folder);
    await frame.getByRole('button', { name: 'Next', exact: true }).click();
    await frame.getByRole('button', { name: 'Next', exact: true }).click();
    await frame.getByRole('button', { name: 'Finish', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await frame.getByRole('button', { name: 'Import', exact: true }).click();
    await (await chooser).setFiles([join(first.dir, 'red.mp4'), join(first.dir, 'blue.mp4')]);
    await frame.getByTitle('red.mp4', { exact: true }).locator('..').getByRole('button').click();
    await frame.locator('body').evaluate(() => {
      const t = gardenEditor.scenes.getActiveScene().tracks.main;
      gardenEditor.timeline.splitElements({
        elements: [{ trackId: t.id, elementId: t.elements[0].id }],
        splitTime: 120000,
        retainSide: 'left',
      });
      gardenEditor.playback.seek({ time: 120000 });
    });
    await frame.getByTitle('blue.mp4', { exact: true }).locator('..').getByRole('button').click();
    await frame.locator('body').evaluate(() => gardenEditor.playback.seek({ time: 0 }));
    await frame.getByRole('button', { name: 'Text', exact: true }).click();
    await frame
      .getByText('Default text', { exact: true })
      .locator('..')
      .locator('..')
      .getByRole('button')
      .click();
    const projectName = frame.getByRole('textbox', { name: 'Video project name' });
    await projectName.click();
    await projectName.fill('Manual film');
    await frame.locator('body').evaluate(() => {
      const t = gardenEditor.scenes
          .getActiveScene()
          .tracks.overlay.find((t: any) => t.type === 'text'),
        el = t.elements[0];
      gardenEditor.timeline.updateElements({
        updates: [
          {
            trackId: t.id,
            elementId: el.id,
            patch: { duration: 360000, params: { ...el.params, content: 'My film', fontSize: 30 } },
          },
        ],
      });
    });
    await ready(page);
    await expect(projectName).toBeFocused();
    await expect(projectName).toHaveValue('Manual film');
    await projectName.press('Enter');
    await expect.poll(() => project()?.metadata?.name).toBe('Manual film');
    const chat = page.getByPlaceholder('Send a message...');
    await chat.fill('Name my film and its title [opencut:edit]');
    await chat.press('Enter');
    await expect.poll(() => textValue(frame), { timeout: 45000 }).toBe('Garden film');
    await expect.poll(() => project()?.metadata?.name).toBe('Garden film');
    await expect(frame.getByRole('textbox', { name: 'Video project name' })).toHaveValue(
      'Garden film',
    );
    await frame.locator('body').evaluate(() => gardenEditor.command.undo());
    await expect.poll(() => textValue(frame)).toBe('My film');
    await frame.locator('body').evaluate(() => gardenEditor.command.redo());
    await expect.poll(() => textValue(frame)).toBe('Garden film');
    await exportVideo(frame, first.app, join(first.dir, 'video.webm'));
    await exportVideo(frame, first.app, join(first.dir, 'video.mp4'));
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await ready(page);
    await page.screenshot({ path: join(evidence, 'opencut-workshop.png') });
    // An outside writer must win; rejected saves retain the current native draft.
    writeFileSync(join(folder, 'data/project.json'), JSON.stringify(doc(), null, 2));
    await editText(frame, 'Unsaved draft');
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toContainText('changed elsewhere');
    expect(await textValue(frame)).toBe('Unsaved draft');
    expect(
      project().scenes[0].tracks.overlay.find((t: any) => t.type === 'text').elements[0].params
        .content,
    ).toBe('Garden film');
    await frame.getByRole('button', { name: 'Reload saved project', exact: true }).click();
    await frame
      .getByRole('dialog', { name: 'Discard unsaved video changes?' })
      .getByRole('button', { name: 'Discard and reload', exact: true })
      .click();
    frame = await ready(page);
    await expect.poll(() => textValue(frame)).toBe('Garden film');
    // Flush a same-turn edit before native SaveManager's timer runs.
    await frame.locator('body').evaluate(async () => {
      const t = gardenEditor.scenes
          .getActiveScene()
          .tracks.overlay.find((t: any) => t.type === 'text'),
        el = t.elements[0];
      gardenEditor.timeline.updateElements({
        updates: [
          {
            trackId: t.id,
            elementId: el.id,
            patch: { params: { ...el.params, content: 'Reopened film' } },
          },
        ],
      });
      await gardenSession.flush();
    });
    expect(
      project().scenes[0].tracks.overlay.find((t: any) => t.type === 'text').elements[0].params
        .content,
    ).toBe('Reopened film');
  } finally {
    await first.app.close();
  }
  const second = await launchApp({ dir: first.dir });
  second.page.on('pageerror', (e) => pageErrors.push(e.message));
  try {
    await second.page.setViewportSize({ width: 2000, height: 1200 });
    await second.page.getByRole('button', { name: /enter/i }).click();
    const frame = await ready(second.page);
    await expect.poll(() => textValue(frame)).toBe('Reopened film');
    await exportVideo(frame, second.app, join(first.dir, 'reopened.webm'));
    await exportNativeCrux(second.page, archive, second.app);
  } finally {
    await second.app.close();
  }
  const originalFolder = folder;
  renameSync(originalFolder, originalFolder + '-unavailable');
  const third = await launchApp();
  third.page.on('pageerror', (e) => pageErrors.push(e.message));
  try {
    await third.page.setViewportSize({ width: 2000, height: 1200 });
    await enterGarden(third.page);
    await importNativeCrux(third.page, archive);
    const frame = await ready(third.page);
    folder = (
      await storedCrux(
        third.page,
        (await third.page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!,
      )
    ).projectFolder;
    console.log('OpenCut imported Project Folder:', folder);
    expect(folder).not.toBe(originalFolder);
    await expect.poll(() => textValue(frame)).toBe('Reopened film');
    const originals = Object.entries(doc().project)
      .filter(([k]) => k.startsWith('file-'))
      .map(([, v]: [string, any]) => readFileSync(join(folder, 'data', v.__cruxBinary.path)));
    for (const color of ['red', 'blue'])
      expect(
        originals.some((bytes) => bytes.equals(readFileSync(join(first.dir, color + '.mp4')))),
      ).toBe(true);
    await editText(frame, 'Imported film');
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await ready(third.page);
    await exportVideo(frame, third.app, join(first.dir, 'imported.webm'));
    await third.page.screenshot({ path: join(evidence, 'opencut-imported.png') });
    expect(pageErrors).toEqual([]);
  } finally {
    await third.app.close();
    renameSync(originalFolder + '-unavailable', originalFolder);
  }
});
