import { panelPressed, togglePanel } from './panel-helpers';
import { test, expect, type Page, type ElectronApplication } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, reenterWorkspace, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';
import { outputs } from './game-cruxspace-helpers';

/**
 * Requires the full-catalogue dev profile (CRUX_DEV_SERVER) or a build with
 * CRUX_BUNDLE_TOOLS=all. The production starter build does not bundle Record.
 *
 * The actual Record inside a Crux: camera-only controls use Chromium's fake
 * camera and the Garden's Document Picture-in-Picture stand-in. A canvas
 * MediaRecorder supplies a WebM to the app's download bridge as a video output,
 * listed in data/project.json; the collaborator names the Crux; the recording
 * survives a restart and a complete-Crux import into a clean Garden.
 */
// These instances use Chromium's fake devices; consent never touches real hardware.
async function consentToFakeCamera(app: ElectronApplication) {
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async (_window: unknown, options: { message: string }) => {
      if (!/wants access to your (camera|microphone)/.test(options.message))
        throw new Error(`Unexpected dialog in fake-camera journey: ${options.message}`);
      return { response: 1, checkboxChecked: false };
    }) as typeof dialog.showMessageBox;
  });
}

const frameOf = (page: Page) => page.frameLocator('iframe[data-crux-id]');
const status = (page: Page) => frameOf(page).locator('#garden-project [role=status]');
async function ready(page: Page) {
  await expect(status(page)).toHaveText('Saved to Garden', { timeout: 180000 });
  await expect(frameOf(page).getByRole('button', { name: 'Camera only' })).toBeVisible();
}

test('Record: a camera recording saved into the Crux, agent naming, restart and clean import', async () => {
  test.setTimeout(12 * 60_000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1', CRUX_FAKE_MEDIA: '1' } });
  await consentToFakeCamera(first.app);
  const evidence = test.info().outputDir;
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'recordings.crux');
  let folder = '';
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const errors: string[] = [];
  try {
    const { page } = first;
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);

    await test.step('create from the picker; the app opens with its layouts and the empty record saves', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Record\b/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      console.log('Record folder', folder);
      await ready(page);
      await expect.poll(() => doc().project?.recordings ?? null).toEqual([]);
      await page.screenshot({ path: join(evidence, 'recorder-initial.png') });
    });

    await test.step('the picture-in-picture stand-in opens for the app’s controls; a recording saved the app’s way lands in the Crux', async () => {
      await frameOf(page).locator('#output-name').fill('Hello take');
      await frameOf(page).getByRole('button', { name: 'Camera only' }).click();
      // Record asks for its picture-in-picture window; the Garden's stand-in panel appears with the app's controls in it.
      await frameOf(page).locator('button.MuiIconButton-root').last().click();
      const panel = frameOf(page).frameLocator('#garden-pip iframe');
      await expect(panel.locator('button').first()).toBeVisible({ timeout: 30000 });
      await page.screenshot({ path: join(evidence, 'recorder-pip.png') });
      // Exercise the download-to-output bridge with a deterministic canvas recording.
      // This verifies persistence; it does not verify hardware recording or OS dialogs.
      await frameOf(page)
        .locator('body')
        .evaluate(async () => {
          const canvas = document.createElement('canvas');
          canvas.width = 320;
          canvas.height = 240;
          const ctx = canvas.getContext('2d')!;
          let hue = 0;
          const paint = () => {
            ctx.fillStyle = `hsl(${(hue += 7) % 360}, 70%, 50%)`;
            ctx.fillRect(0, 0, 320, 240);
            ctx.fillStyle = '#fff';
            ctx.font = '48px sans-serif';
            ctx.fillText('take', 100, 140);
          };
          const timer = setInterval(paint, 40);
          const stream = canvas.captureStream(25);
          const chunks: Blob[] = [];
          const recorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
          recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
          const done = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
          recorder.start();
          await new Promise((r) => setTimeout(r, 1800));
          recorder.stop();
          await done;
          clearInterval(timer);
          const link = document.createElement('a');
          link.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
          link.download = 'recording.webm';
          link.click();
        });
      await expect(status(page)).toContainText('Saved Hello take', { timeout: 60000 });
      await expect.poll(() => outputs(folder).map((o) => o.label)).toEqual(['Hello take']);
      const out = outputs(folder)[0]!;
      expect(out.mimeType).toBe('video/webm');
      expect(readFileSync(join(folder, out.path)).length).toBeGreaterThan(2000);
      expect(doc().project.recordings).toHaveLength(1);
      expect(doc().project.recordings[0]).toMatchObject({
        label: 'Hello take',
        mimeType: 'video/webm',
      });
      await frameOf(page)
        .locator('#garden-pip iframe')
        .evaluate((el) =>
          ((el as HTMLIFrameElement).contentWindow as Window & { close(): void }).close(),
        );
      await expect(frameOf(page).locator('#garden-pip')).toHaveCount(0);
      await page.screenshot({ path: join(evidence, 'recorder-saved.png') });
    });

    await test.step('the scripted collaborator lists the recordings and names the Crux', async () => {
      if ((await panelPressed(page, 'Toggle collaboration')) !== 'true')
        await togglePanel(page, 'Toggle collaboration');
      const box = page.getByPlaceholder('Send a message...');
      await box.fill('What do we have here? [recorder:name]');
      await box.press('Enter');
      await expect(
        page.getByText('Listed the recordings and named the Crux Walkthrough takes.', {
          exact: true,
        }),
      ).toBeVisible({ timeout: 150000 });
      await expect.poll(() => doc().project.name).toBe('Walkthrough takes');
      await expect(frameOf(page).locator('#recorder-name')).toHaveValue('Walkthrough takes');
      await togglePanel(page, 'Toggle collaboration');
    });
    expect(errors.filter((e) => !/microphone did not answer/.test(e))).toEqual([]);
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ dir: first.dir, env: { CRUX_FAKE_MEDIA: '1' } });
  await consentToFakeCamera(second.app);
  try {
    const { page } = second;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await reenterWorkspace(page);
    await test.step('restart: the recording and the name come back', async () => {
      await ready(page);
      await expect(frameOf(page).locator('#recorder-name')).toHaveValue('Walkthrough takes');
      expect(outputs(folder).length).toBe(1);
      await page.screenshot({ path: join(evidence, 'recorder-reopened.png') });
      await exportNativeCrux(page, archive, second.app);
    });
  } finally {
    await second.app.close();
    renameSync(folder, `${folder}-unavailable`);
  }

  const third = await launchApp({ env: { CRUX_FAKE_MEDIA: '1' } });
  await consentToFakeCamera(third.app);
  try {
    const { page } = third;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);
    await test.step('clean Garden: the complete Crux imports with its recording', async () => {
      await importNativeCrux(page, archive);
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      const importedId = (await page
        .locator('[data-workspace-id]')
        .getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, importedId)).projectFolder;
      await ready(page);
      expect(outputs(folder).map((o) => o.label)).toEqual(['Hello take']);
      expect(readFileSync(join(folder, outputs(folder)[0]!.path)).length).toBeGreaterThan(2000);
      await frameOf(page).locator('#recorder-name').fill('Walkthrough takes 2');
      await expect(status(page)).toHaveText('Saved to Garden');
      await expect.poll(() => doc().project.name).toBe('Walkthrough takes 2');
      await page.screenshot({ path: join(evidence, 'recorder-imported.png') });
    });
  } finally {
    await third.app.close();
  }
});
