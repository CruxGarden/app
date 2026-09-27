import { test, expect, type Page } from '@playwright/test';
import { launchApp } from '../launch';
import { enterGarden, createCrux, switchCrux } from '../multi-crux-helpers';
import { showPane, hidePane } from '../panel-helpers';
import { markVersion } from '../journeys/journey-helpers';

type AudioState = { playing: boolean; optIn: boolean; cuesPlayed: number; enabled: boolean };
const audio = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __cruxAudio: { state: () => AudioState } }).__cruxAudio.state(),
  );

/** Every event the Sound tab lists (services/cues.ts CUE_EVENTS). */
const EVENTS = [
  'Reply arrives',
  'Tool finished',
  'Snapshot taken',
  'Shared',
  'Something failed',
  'Alert arrives',
];

/**
 * V1-TESTING-GUIDE § 29 · Mood: Sound and cues — a cue for every listed
 * event, real events counted, an unassigned event silent; a cancelled
 * sampler that must not follow into another Crux. Whether anything is
 * audible is by ear (SOUND-01/02/07); track playback is cues.spec.
 */
test.describe('guide 29 · Sound and cues', () => {
  test('SOUND-03 — every listed event takes a cue and previews; real events play their cues; an unassigned event stays silent', async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp({ sound: true, env: { CRUX_AI_MOCK: '1' } });
    try {
      await enterGarden(page);
      await createCrux(page, 'Cued');
      const mood = await showPane(page, 'Mood');
      await mood.getByRole('button', { name: 'Sound', exact: true }).click();
      // The opt-in: press play once, so cues may sound at all.
      const synth = mood.getByRole('region', { name: 'Crux Synth', exact: true });
      await synth.getByRole('button', { name: 'Play synth' }).click();
      await expect.poll(async () => (await audio(page)).optIn).toBe(true);
      const tab = mood.getByTestId('sound-tab');
      for (const label of EVENTS) {
        const pick = tab.getByRole('combobox', { name: `Cue for ${label}` });
        const preview = tab.getByRole('button', { name: `Preview cue for ${label}` });
        await expect(pick).toBeVisible();
        await pick.selectOption('');
        await expect(preview).toBeDisabled();
        await pick.selectOption({ index: 1 });
        await expect(pick).not.toHaveValue('');
        await expect(preview).toBeEnabled();
        await preview.click();
      }
      await hidePane(page, 'Mood');
      // A collaborator turn with a tool: "Tool finished" and "Reply arrives".
      const before = (await audio(page)).cuesPlayed;
      const input = page.getByPlaceholder('Send a message...');
      await input.fill('Please write hello');
      await input.press('Enter');
      await expect(page.getByText('Done — I wrote that file for you.')).toBeVisible({
        timeout: 30_000,
      });
      await expect
        .poll(async () => (await audio(page)).cuesPlayed)
        .toBeGreaterThanOrEqual(before + 2);
      // A version marked by hand: "Snapshot taken".
      const afterTurn = (await audio(page)).cuesPlayed;
      await markVersion(page, 'Cued version');
      await expect.poll(async () => (await audio(page)).cuesPlayed).toBe(afterTurn + 1);
      // Unassigned: the same event makes no sound.
      const again = await showPane(page, 'Mood');
      await again.getByRole('button', { name: 'Sound', exact: true }).click();
      await again
        .getByTestId('sound-tab')
        .getByRole('combobox', { name: 'Cue for Snapshot taken' })
        .selectOption('');
      await expect(
        again
          .getByTestId('sound-tab')
          .getByRole('button', { name: 'Preview cue for Snapshot taken' }),
      ).toBeDisabled();
      await hidePane(page, 'Mood');
      const silentBefore = (await audio(page)).cuesPlayed;
      await markVersion(page, 'Quiet version');
      await page.waitForTimeout(1500);
      expect((await audio(page)).cuesPlayed).toBe(silentBefore);
    } finally {
      await app.close();
    }
  });

  test('SOUND-06 — a sampler stopped while its samples load stays silent after a switch to another Crux and back', async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    let release!: () => void;
    const loading = new Promise<void>((resolve) => (release = resolve));
    let requests = 0;
    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await enterGarden(page);
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Sample sequencer/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60_000 });
      const samplerId = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      const samplerTitle = await page.evaluate(
        async (id) =>
          (
            (await window.electronAPI!.sqlite.get('SELECT title FROM cruxes WHERE id = ?', [
              id,
            ])) as { title: string }
          ).title,
        samplerId,
      );
      const frame = page.frameLocator('iframe[data-crux-id]');
      await expect(frame.locator('#save-state')).toHaveText('Saved in this Crux', {
        timeout: 60_000,
      });
      await page.context().route(/\/samples\/[^/]+\.wav$/, async (route) => {
        requests++;
        await loading;
        await route.continue();
      });
      await frame.locator('#play').evaluate((button: HTMLButtonElement) => {
        const play = button.onclick!;
        const attempts: unknown[] = [];
        Object.assign(window, { pendingSamplerPlays: attempts });
        button.onclick = function (event) {
          const pending = play.call(this, event);
          attempts.push(pending);
          return pending;
        };
      });
      await frame.getByRole('button', { name: 'Play pattern', exact: true }).click();
      await expect.poll(() => requests).toBe(4);
      await frame.getByRole('button', { name: 'Stop', exact: true }).click();
      // Straight to another project while the samples are still on their way.
      await createCrux(page, 'Elsewhere');
      release();
      await page.waitForTimeout(1500);
      expect((await audio(page)).playing).toBe(false);
      // Back: the cancelled sound never started, and the instrument still works.
      await switchCrux(page, samplerTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      await expect(frame.locator('#save-state')).toHaveText('Saved in this Crux', {
        timeout: 60_000,
      });
      await page.waitForTimeout(1500);
      await expect(frame.locator('#playing')).toHaveText('Silent');
      await expect(frame.locator('#meter')).toHaveJSProperty('value', 0);
      await expect(frame.locator('#error')).toBeHidden();
      await frame.getByRole('button', { name: 'Play pattern', exact: true }).click();
      await expect(frame.locator('#playing')).toHaveText('Playing through smplr');
      await frame.getByRole('button', { name: 'Stop', exact: true }).click();
      await expect(frame.locator('#playing')).toHaveText('Silent');
    } finally {
      release();
      await app.close();
    }
  });
});
