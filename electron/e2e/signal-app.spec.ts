import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';
import { outputs } from './game-cruxspace-helpers';

/**
 * The Song tool (the actual Signal sequencer) as a Crux Tool: a new song saves
 * its MIDI file to Garden as a binary asset; a person adds a track in the app
 * and saves the MIDI from the bar; the scripted collaborator names the song,
 * writes a waltz melody and renders a WAV; the song comes back after a
 * restart; a complete Crux archive imports into a clean Garden.
 */
const frameOf = (page: Page) => page.frameLocator('iframe[data-crux-id]');
const status = (page: Page) => frameOf(page).locator('#garden-project [role=status]');
const ready = (page: Page) =>
  expect(status(page)).toHaveText('Saved to Garden', { timeout: 180000 });

test('Song: a new song saves, a person adds a track and saves MIDI, the collaborator writes a waltz and renders a WAV, restart and clean import', async () => {
  test.setTimeout(15 * 60_000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const evidence = resolve(__dirname, '../../docs/signal');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'song.crux');
  let folder = '';
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const errors: string[] = [];
  try {
    const { page } = first;
    page.setDefaultTimeout(60000);
    page.on('console', (message) => {
      if (message.type() === 'error' || message.text().includes('[garden]'))
        console.log(`[renderer ${message.type()}] ${message.text().slice(0, 500)} ${message.location().url}`);
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1700, height: 1050 });
    await enterGarden(page);

    await test.step('create from the picker; the empty song saves its MIDI to Garden', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Song\b/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      await ready(page);
      await expect.poll(() => doc().project?.midi?.__cruxBinary?.size ?? 0).toBeGreaterThan(14);
      expect(existsSync(join(folder, 'data', doc().project.midi.__cruxBinary.path))).toBe(true);
      expect(readFileSync(join(folder, 'data', doc().project.midi.__cruxBinary.path)).subarray(0, 4).toString()).toBe('MThd');
      await expect(frameOf(page).getByText('Acoustic Grand Piano').first()).toBeVisible();
      await page.screenshot({ path: join(evidence, 'signal-initial.png') });
    });

    await test.step('a person adds a track in the app and saves the MIDI from the bar', async () => {
      const frame = frameOf(page);
      const before = doc().project.midi.__cruxBinary.path;
      // The track list is collapsed by default: the arrow at the left of the toolbar opens it
      await frame.locator('button', { has: frame.locator('svg') }).first().dispatchEvent('mousedown');
      await frame.getByText('Add Track').click();
      await expect(status(page)).toHaveText(/Unsaved changes|Saving song…|Saved to Garden/);
      await expect.poll(() => doc().project.midi.__cruxBinary.path, { timeout: 60000 }).not.toBe(before);
      await ready(page);
      await frame.locator('#output-name').fill('Sketch, MIDI');
      await frame.locator('#save-output').click();
      await expect(status(page)).toContainText('Saved Sketch, MIDI as a MIDI output', { timeout: 60000 });
      await expect.poll(() => outputs(folder).length).toBe(1);
      const [midi] = outputs(folder);
      expect(midi!.mimeType).toBe('audio/midi');
      expect(midi!.path).toMatch(/\.mid$/);
      expect(readFileSync(join(folder, midi!.path)).subarray(0, 4).toString()).toBe('MThd');
      await page.screenshot({ path: join(evidence, 'signal-edited.png') });
    });

    await test.step('the scripted collaborator names the song, writes a waltz and renders a WAV', async () => {
      const collab = page.getByRole('button', { name: 'Toggle collaboration' });
      if ((await collab.getAttribute('aria-pressed')) !== 'true') await collab.click();
      const box = page.getByPlaceholder('Send a message...');
      await box.fill('Write me a waltz [song:tune]');
      await box.press('Enter');
      await expect(
        page.getByText('Named the song Moss Waltz, wrote a waltz melody in G on track 1 and saved a WAV of it.', {
          exact: true,
        }),
      ).toBeVisible({ timeout: 8 * 60_000 });
      await ready(page);
      expect(doc().project.name).toBe('Moss Waltz');
      await expect.poll(() => outputs(folder).length).toBe(2);
      const wav = outputs(folder).find((o) => o.label === 'Moss Waltz')!;
      expect(wav.mimeType).toBe('audio/wav');
      expect(readFileSync(join(folder, wav.path)).subarray(0, 4).toString()).toBe('RIFF');
      expect(wav.size).toBeGreaterThan(100000);
      await collab.click();
      await page.screenshot({ path: join(evidence, 'signal-agent.png') });
    });
    expect(errors).toEqual([]);
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ dir: first.dir });
  try {
    const { page } = second;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1700, height: 1050 });
    await page.getByRole('button', { name: /enter/i }).click();
    await test.step('restart: the song comes back with its name, tracks and outputs', async () => {
      await ready(page);
      await expect(frameOf(page).getByText('Melody')).toBeVisible({ timeout: 60000 });
      expect(doc().project.name).toBe('Moss Waltz');
      expect(outputs(folder).length).toBe(2);
      await page.screenshot({ path: join(evidence, 'signal-reopened.png') });
      await exportNativeCrux(page, archive, second.app);
    });
  } finally {
    await second.app.close();
    renameSync(folder, `${folder}-unavailable`);
  }

  const third = await launchApp({});
  try {
    const { page } = third;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1700, height: 1050 });
    await enterGarden(page);
    await test.step('clean Garden: the complete Crux imports and the song opens', async () => {
      await importNativeCrux(page, archive);
      const importedId = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, importedId)).projectFolder;
      await ready(page);
      await expect(frameOf(page).getByText('Melody')).toBeVisible({ timeout: 60000 });
      expect(doc().project.name).toBe('Moss Waltz');
      expect(outputs(folder).length).toBe(2);
      await page.screenshot({ path: join(evidence, 'signal-imported.png') });
    });
  } finally {
    await third.app.close();
  }
});
