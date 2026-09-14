import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

/**
 * web-synth (the full upstream app) as a Crux Tool: the actual UI adds modules,
 * the composition web-synth keeps in its own storage is saved as data/project.json,
 * the scripted collaborator edits it through App Tools, it survives a restart, and
 * a complete Crux archive imports into a clean Garden with the source folder gone.
 */
const frameOf = (page: Page) => page.frameLocator('iframe[data-crux-id]');
const status = (page: Page) => frameOf(page).locator('#garden-project [role=status]');
async function ready(page: Page) {
  await expect(status(page)).toHaveText('Saved to Garden', { timeout: 180000 });
  return frameOf(page);
}
async function addModule(page: Page, displayName: string) {
  const frame = frameOf(page);
  await frame.locator('[title="Add Module"]').click();
  const picker = frame.locator('.add-module-picker-container');
  await picker.locator('select').selectOption(displayName);
  await picker.getByRole('button', { name: 'add', exact: true }).click();
  await expect(picker).toHaveCount(0);
}
const tabs = (page: Page) => frameOf(page).locator('.vc-switcher-tab-title');

test('web-synth: native modules, saved composition, agent tools, restart and clean import', async () => {
  test.setTimeout(20 * 60_000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const evidence = resolve(__dirname, '../../docs/web-synth');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'synth.crux');
  let folder = '';
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const stateKeys = () => Object.keys(doc().project?.state ?? {});
  // A module's kind lives in its own vc_<id> entry; vcmState only lists ids.
  const hasModule = (kind: string) =>
    Object.values(doc().project?.state ?? {}).some((v) => (v as string).includes(`"${kind}"`));
  const errors: string[] = [];
  try {
    const { page } = first;
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1800, height: 1100 });
    await enterGarden(page);

    await test.step('create from the picker; the real app boots and the empty composition saves', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^web-synth/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      console.log('web-synth folder', folder);
      await ready(page);
      await expect.poll(() => stateKeys().includes('vcmState')).toBe(true);
      // Shared memory reaches the worklets: the transport's beat counter needs it.
      expect(
        await frameOf(page)
          .locator('body')
          .evaluate(() => typeof SharedArrayBuffer !== 'undefined'),
      ).toBe(true);
      await page.screenshot({ path: join(evidence, 'web-synth-initial.png') });
    });

    await test.step('a person adds a Synth Designer through the actual module picker', async () => {
      const before = await tabs(page).count();
      await addModule(page, 'Synth Designer');
      await expect(tabs(page)).toHaveCount(before + 1);
      await expect(tabs(page).last()).toHaveAttribute('data-vc-name', 'synth_designer');
      await ready(page);
      await expect.poll(() => hasModule('synth_designer')).toBe(true);
      await page.screenshot({ path: join(evidence, 'web-synth-synth-designer.png') });
    });

    await test.step('sound: a key on the MIDI keyboard produces signal at the master output', async () => {
      const frame = frameOf(page);
      await frame.locator('.vc-switcher-tab-title', { hasText: 'MIDI Keyboard' }).click();
      await frame.locator('body').click({ position: { x: 5, y: 5 } });
      const rms = await frame.locator('body').evaluate(async () => {
        const ctx = (window as any).globalContext ?? (window as any).audioContext;
        const ctx2 = ctx ?? new AudioContext();
        await ctx2.resume();
        const analyser = ctx2.createAnalyser();
        analyser.fftSize = 2048;
        (ctx2.globalVolume ?? ctx2.destination).connect?.(analyser);
        const down = new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', bubbles: true });
        document.dispatchEvent(down);
        await new Promise((r) => setTimeout(r, 600));
        const data = new Float32Array(analyser.fftSize);
        let best = 0;
        for (let i = 0; i < 5; i++) {
          analyser.getFloatTimeDomainData(data);
          const rms = Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length);
          best = Math.max(best, rms);
          await new Promise((r) => setTimeout(r, 100));
        }
        document.dispatchEvent(
          new KeyboardEvent('keyup', { key: 'a', code: 'KeyA', bubbles: true }),
        );
        return best;
      });
      console.log('web-synth output RMS', rms);
      expect(rms).toBeGreaterThan(0.0005);
    });

    await test.step('the scripted collaborator sets the tempo and adds a MIDI editor', async () => {
      const collab = page.getByRole('button', { name: 'Toggle collaboration' });
      if ((await collab.getAttribute('aria-pressed')) !== 'true') await collab.click();
      const box = page.getByPlaceholder('Send a message...');
      await box.fill('Set the tempo and add a MIDI editor [synth:edit]');
      await box.press('Enter');
      await expect(
        page.getByText('Set the tempo to 128 and added a MIDI editor named Agent melody.', {
          exact: true,
        }),
      ).toBeVisible({ timeout: 150000 });
      await expect(tabs(page).filter({ hasText: 'Agent melody' })).toHaveCount(1);
      await ready(page);
      await expect.poll(() => hasModule('midi_editor')).toBe(true);
      await collab.click();
      await page.screenshot({ path: join(evidence, 'web-synth-agent.png') });
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
    await test.step('restart: the composition reopens with both modules', async () => {
      await page.getByRole('button', { name: /enter/i }).click();
      await ready(page);
      await expect(tabs(page).filter({ hasText: 'Agent melody' })).toHaveCount(1);
      // The default composition ships one Synth Designer; the person added a second.
      await expect(tabs(page).filter({ hasText: 'Synth Designer' })).toHaveCount(2);
      await page.screenshot({ path: join(evidence, 'web-synth-reopened.png') });
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
    await test.step('clean Garden: the complete Crux imports and editing continues', async () => {
      await enterGarden(page);
      await importNativeCrux(page, archive);
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      await ready(page);
      await expect(tabs(page).filter({ hasText: 'Agent melody' })).toHaveCount(1);
      await addModule(page, 'Sequencer');
      await ready(page);
      await expect.poll(() => hasModule('sequencer')).toBe(true);
      await page.screenshot({ path: join(evidence, 'web-synth-imported.png') });
    });
  } finally {
    await third.app.close();
  }
});
