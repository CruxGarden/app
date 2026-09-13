import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

/**
 * AM-1 Arpeggio Machine (Daniel's instrument, as written) as a Crux Tool: a
 * tempo change on the real control and a patch saved with the real bank
 * reach data/project.json; an exported patch is kept as a binary Artifact
 * instead of downloaded; the scripted collaborator sets tempo and key; the
 * session survives a restart; a complete Crux archive imports into a clean
 * Garden with the folder gone.
 */
const frameOf = (page: Page) => page.frameLocator('iframe[data-crux-id]');
const status = (page: Page) => frameOf(page).locator('#garden-project [role=status]');
async function ready(page: Page) {
  await expect(status(page)).toHaveText('Saved to Garden', { timeout: 120000 });
  await expect(frameOf(page).locator('#tempo')).toBeVisible();
}
/** Move the real tempo slider the way a person's drag ends: a new value and the input event. */
const setTempo = (page: Page, tempo: number) =>
  frameOf(page)
    .locator('#tempo')
    .evaluate((el, value) => {
      const input = el as HTMLInputElement;
      input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, tempo);

test('AM-1: real tempo and patch edits, kept export, agent tools, restart and clean import', async () => {
  test.setTimeout(10 * 60_000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const evidence = resolve(__dirname, '../../docs/am-1');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'arp.crux');
  let folder = '';
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const errors: string[] = [];
  try {
    const { page } = first;
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1500, height: 1100 });
    await enterGarden(page);

    await test.step('create from the picker; the instrument greets with its first patch and the session saves', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^AM-1/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      console.log('AM-1 folder', folder);
      await ready(page);
      await expect(frameOf(page).locator('#patchName')).toHaveValue('Berlin, Bees');
      await expect.poll(() => doc().project?.active?.n ?? '').toBe('f:berlin_bees');
      expect(doc().project.active.p.tempo).toBe(120);
      await page.screenshot({ path: join(evidence, 'am-1-initial.png') });
    });

    await test.step('a person changes the tempo and saves a patch with the real controls', async () => {
      await setTempo(page, 140);
      await expect(frameOf(page).locator('#tempoOut')).toHaveText('140');
      await frameOf(page).locator('#patchName').fill('Garden bees');
      await frameOf(page).locator('#btnPSave').click();
      await expect(frameOf(page).locator('#patchList')).toHaveValue('s:Garden bees');
      await ready(page);
      await expect
        .poll(() => doc().project.patches['Garden bees']?.tempo, { timeout: 30000 })
        .toBe(140);
      // The instrument's own 3-second persist carries the live values.
      await expect.poll(() => doc().project.active?.p?.tempo, { timeout: 30000 }).toBe(140);
      await expect.poll(() => doc().project.active?.n).toBe('s:Garden bees');
      await page.screenshot({ path: join(evidence, 'am-1-edited.png') });
    });

    await test.step('an exported patch is kept in the Crux instead of downloaded', async () => {
      await frameOf(page).locator('#btnPExport').click();
      await expect.poll(() => doc().project.files.length, { timeout: 30000 }).toBe(1);
      await ready(page);
      const kept = doc().project.files[0];
      expect(kept.name).toBe('AM1_Garden_bees.json');
      const path = join(folder, 'data', kept.file.__cruxBinary.path);
      expect(existsSync(path)).toBe(true);
      expect(JSON.parse(readFileSync(path, 'utf8')).tempo).toBe(140);
      expect(existsSync(join(first.dir, kept.name))).toBe(false);
    });

    await test.step('the scripted collaborator sets the tempo and the key', async () => {
      const collab = page.getByRole('button', { name: 'Toggle collaboration' });
      if ((await collab.getAttribute('aria-pressed')) !== 'true') await collab.click();
      const box = page.getByPlaceholder('Send a message...');
      await box.fill('Slow it down and move it to D dorian [am1:edit]');
      await box.press('Enter');
      await expect(
        page.getByText('Set the tempo to 96 and the key to D dorian.', { exact: true }),
      ).toBeVisible({
        timeout: 150000,
      });
      await ready(page);
      expect(doc().project.active.p).toMatchObject({ tempo: 96, key: 2, scale: 'dorian' });
      await expect(frameOf(page).locator('#tempoOut')).toHaveText('96');
      await expect(frameOf(page).locator('#key')).toHaveValue('2');
      await collab.click();
      await page.screenshot({ path: join(evidence, 'am-1-agent.png') });
    });
    expect(errors).toEqual([]);
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ dir: first.dir });
  try {
    const { page } = second;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1500, height: 1100 });
    await test.step('restart: the session and the saved patch come back', async () => {
      await page.getByRole('button', { name: /enter/i }).click();
      await ready(page);
      await expect(frameOf(page).locator('#tempoOut')).toHaveText('96');
      await expect(frameOf(page).locator('#patchList option[value="s:Garden bees"]')).toHaveCount(
        1,
      );
      await page.screenshot({ path: join(evidence, 'am-1-reopened.png') });
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
    await page.setViewportSize({ width: 1500, height: 1100 });
    await test.step('clean Garden: the complete Crux imports and playing on continues', async () => {
      await enterGarden(page);
      await importNativeCrux(page, archive);
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      await ready(page);
      await expect(frameOf(page).locator('#tempoOut')).toHaveText('96');
      await expect(frameOf(page).locator('#patchList option[value="s:Garden bees"]')).toHaveCount(
        1,
      );
      expect(existsSync(join(folder, 'data', doc().project.files[0].file.__cruxBinary.path))).toBe(
        true,
      );
      await setTempo(page, 72);
      await expect.poll(() => doc().project.active?.p?.tempo, { timeout: 30000 }).toBe(72);
      await ready(page);
      await page.screenshot({ path: join(evidence, 'am-1-imported.png') });
    });
  } finally {
    await third.app.close();
  }
});
