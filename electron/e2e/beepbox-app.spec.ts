import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

/**
 * BeepBox (the actual editor) as a Crux Tool: a note placed on the real pattern
 * grid changes the song BeepBox keeps in its URL, which is saved as
 * data/project.json; the scripted collaborator edits it through App Tools; it
 * survives a restart; a complete Crux archive imports into a clean Garden with
 * the source folder gone and editing continues there.
 */
const frameOf = (page: Page) => page.frameLocator('iframe[data-crux-id]');
const status = (page: Page) => frameOf(page).locator('#garden-project [role=status]');
async function ready(page: Page) {
  await expect(status(page)).toHaveText('Saved to Garden', { timeout: 120000 });
  await expect(frameOf(page).locator('.beepboxEditor')).toBeVisible();
}
const songOf = (page: Page) =>
  frameOf(page)
    .locator('body')
    .evaluate(() => {
      const e = (window as any).gardenEditor;
      return { tempo: e.doc.song.tempo, key: (window as any).beepbox.Config.keys[e.doc.song.key].name, hash: location.hash.length };
    });
/** Place a note on the real pattern grid (the main pattern editor is the wide SVG). */
async function placeNote(page: Page) {
  const svg = frameOf(page).locator('.beepboxEditor svg').filter({ visible: true }).first();
  const box = (await svg.boundingBox())!;
  const x = box.x + box.width * 0.3;
  const y = box.y + box.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 30, y, { steps: 4 });
  await page.mouse.up();
}

test('BeepBox: notes on the real grid, saved song, agent tools, restart and clean import', async () => {
  test.setTimeout(10 * 60_000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const evidence = resolve(__dirname, '../../docs/beepbox');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'tune.crux');
  let folder = '';
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const errors: string[] = [];
  let songAfterNote = '';
  try {
    const { page } = first;
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);

    await test.step('create from the picker; the editor boots with a fresh song and saves it', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^BeepBox/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      console.log('BeepBox folder', folder);
      await ready(page);
      await expect.poll(() => typeof doc().project?.song).toBe('string');
      await page.screenshot({ path: join(evidence, 'beepbox-initial.png') });
    });

    await test.step('a person places a note; the song in the URL changes and saves', async () => {
      const before = doc().project.song;
      await placeNote(page);
      await expect.poll(() => doc().project.song, { timeout: 30000 }).not.toBe(before);
      await ready(page);
      songAfterNote = doc().project.song;
      expect((await songOf(page)).hash).toBe(songAfterNote.length + 1);
      await page.screenshot({ path: join(evidence, 'beepbox-note.png') });
    });

    await test.step('sound: Play runs the synth and the playhead advances', async () => {
      const frame = frameOf(page);
      await frame.locator('.beepboxEditor button.playButton').click();
      const progress = await frame.locator('body').evaluate(async () => {
        const synth = (window as any).gardenEditor.doc.synth;
        const start = synth.playhead;
        await new Promise((r) => setTimeout(r, 700));
        return { playing: synth.playing, moved: synth.playhead - start, sampleRate: synth.samplesPerSecond };
      });
      console.log('BeepBox playback', progress);
      expect(progress.playing).toBe(true);
      expect(progress.moved).toBeGreaterThan(0);
      await frame.locator('.beepboxEditor button.pauseButton').click(); // Play becomes Pause while running
      expect(await frame.locator('body').evaluate(() => (window as any).gardenEditor.doc.synth.playing)).toBe(false);
    });

    await test.step('the scripted collaborator sets the tempo and the key', async () => {
      const collab = page.getByRole('button', { name: 'Toggle collaboration' });
      if ((await collab.getAttribute('aria-pressed')) !== 'true') await collab.click();
      const box = page.getByPlaceholder('Send a message...');
      await box.fill('Set the tempo and name the song [beepbox:edit]');
      await box.press('Enter');
      await expect(
        page.getByText('Set the tempo to 140 and the key to D.', { exact: true }),
      ).toBeVisible({ timeout: 150000 });
      await ready(page);
      await expect.poll(() => songOf(page)).toMatchObject({ tempo: 140, key: 'D' });
      expect(doc().project.song).not.toBe(songAfterNote);
      await collab.click();
      await page.screenshot({ path: join(evidence, 'beepbox-agent.png') });
    });
    expect(errors).toEqual([]);
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ dir: first.dir });
  try {
    const { page } = second;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await test.step('restart: the song reopens at 140 BPM in D', async () => {
      await page.getByRole('button', { name: /enter/i }).click();
      await ready(page);
      expect(await songOf(page)).toMatchObject({ tempo: 140, key: 'D' });
      await page.screenshot({ path: join(evidence, 'beepbox-reopened.png') });
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
    await page.setViewportSize({ width: 1600, height: 1000 });
    await test.step('clean Garden: the complete Crux imports; the tempo stepper still edits the song', async () => {
      await enterGarden(page);
      await importNativeCrux(page, archive);
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      await ready(page);
      expect(await songOf(page)).toMatchObject({ tempo: 140, key: 'D' });
      const stepper = frameOf(page).locator('.beepboxEditor input[type="number"]').first();
      await stepper.fill('150');
      await stepper.press('Enter');
      await expect.poll(() => songOf(page).then((s) => s.tempo)).toBe(150);
      await ready(page);
      await expect.poll(() => doc().project.song.length).toBeGreaterThan(10);
      await page.screenshot({ path: join(evidence, 'beepbox-imported.png') });
    });
  } finally {
    await third.app.close();
  }
});
