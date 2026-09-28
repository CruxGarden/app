import { togglePanel } from './panel-helpers';
import { test, expect, type Page } from '@playwright/test';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';

/**
 * Background Turns (AI-COLLABORATION-V3 B3) with the scripted model
 * (CRUX_AI_MOCK=1, "three steps" in ai/mock-model.ts): the model opens with a
 * three-step ```plan, writes step-N.txt once per step and thinks ~5s before
 * step 2. The turn is a job the store tracks — the composer stays live, the
 * job card shows the steps advance, Stop leaves the last edit recovery available,
 * and a relaunch mid-job reports the job as interrupted rather than losing it.
 */
async function latestRecovery(page: Page): Promise<string> {
  const id = await page.locator('[data-workspace-id]').getAttribute('data-workspace-id');
  return page.evaluate(async (id) => {
    const row = (await window.electronAPI!.sqlite.get(
      'SELECT checkpoints FROM edit_history WHERE crux_id=?',
      [id],
    )) as { checkpoints: string };
    return JSON.parse(row.checkpoints).at(-1).id;
  }, id);
}
async function restoreRecovery(page: Page, id: string) {
  const history = page.getByTestId('pane-body-history');
  if (!(await history.isVisible())) await togglePanel(page, 'Toggle growth');
  await history.getByRole('button', { name: 'Edits', exact: true }).click();
  await history
    .locator(`[data-checkpoint-id="${id}"]`)
    .getByRole('button', { name: /Restore recovery/ })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Restore files', exact: true })
    .click();
  await expect(history.getByRole('status')).toContainText('Files restored');
}

test.describe('background turns (mock AI)', () => {
  test.setTimeout(150_000);

  const folderOf = (gardenRoot: string) => join(gardenRoot, readdirSync(gardenRoot)[0]!);
  const onDisk = (gardenRoot: string, file: string): string | null => {
    try {
      return readFileSync(join(folderOf(gardenRoot), file), 'utf8');
    } catch {
      return null;
    }
  };

  async function newBlankCrux(page: Page) {
    await page.getByRole('button', { name: /enter/i }).click();
    await page.getByText('Plant a new garden').click();
    await page.getByRole('button', { name: 'Welcome' }).click();
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Blank/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const input = page.getByPlaceholder('Send a message...');
    await expect(input).toBeVisible({ timeout: 30_000 });
    return input;
  }

  const step = (page: Page, n: number) => page.getByTestId('plan-step').nth(n - 1);

  test('the plan runs step by step while the composer stays live', async () => {
    const { app, page, dir } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    const gardenRoot = join(dir, 'garden');
    try {
      const input = await newBlankCrux(page);
      await input.fill('Please build it in three steps');
      await input.press('Enter');

      // The job card appears with the model's plan; step 1 completes first
      const card = page.getByTestId('turn-job');
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(card).toContainText('Working on…');
      await expect(page.getByTestId('plan-step')).toHaveCount(3);
      await expect(step(page, 1)).toContainText('Lay the foundation');
      await expect(step(page, 1)).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
      await expect(step(page, 2)).toHaveAttribute('data-status', 'running');
      await expect(card).toContainText('Step 2 of 3');
      await page.screenshot({ path: 'e2e/.results/background-1-running.png' });

      // The composer is live mid-job: type, and the draft survives the steps
      await expect(input).toBeEnabled();
      await input.fill('a thought for later');
      await expect(page.getByRole('button', { name: 'Queue' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Steer' })).toBeVisible();

      // Step 2 lands, step 3 takes over — the draft is untouched
      await expect(step(page, 2)).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
      await expect(step(page, 3)).toHaveAttribute('data-status', 'running');
      await expect(card).toContainText('Step 3 of 3');
      await expect(input).toHaveValue('a thought for later');

      // Done: the card folds away, the transcript keeps the record
      await expect(page.getByText('Done — all three steps are in.')).toBeVisible({
        timeout: 30_000,
      });
      await expect(card).toHaveCount(0);
      await expect(input).toHaveValue('a thought for later');
      await expect(page.getByTestId('turn-summary')).toHaveText('Ran 3 steps');
      for (const n of [1, 2, 3]) {
        await expect.poll(() => onDisk(gardenRoot, `step-${n}.txt`)).toBe(`step ${n}\n`);
      }

      await togglePanel(page, 'Toggle growth');
      const history = page.getByTestId('pane-body-history');
      await expect(history.getByText('No snapshots yet')).toBeVisible();
      await history.getByRole('button', { name: 'Edits', exact: true }).click();
      await expect(history.locator('[data-checkpoint-id]').first()).toBeVisible();
      await page.screenshot({ path: 'e2e/.results/background-2-done.png' });
    } finally {
      await app.close();
    }
  });

  test('Stop mid-step two leaves step one restorable', async () => {
    const { app, page, dir } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    const gardenRoot = join(dir, 'garden');
    try {
      const input = await newBlankCrux(page);
      await input.fill('Please build it in three steps');
      await input.press('Enter');

      // Step 1 done, model thinking about step 2 → Stop on the job card
      await expect(step(page, 1)).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
      await expect(step(page, 2)).toHaveAttribute('data-status', 'running');
      const card = page.getByTestId('turn-job');
      await card.getByRole('button', { name: 'Stop' }).click();

      await expect(card).toHaveAttribute('data-status', 'interrupted', { timeout: 30_000 });
      await expect(card).toContainText('Stopped');
      await expect(step(page, 2)).toHaveAttribute('data-status', 'interrupted');
      await expect(step(page, 3)).toHaveAttribute('data-status', 'pending');
      await expect(page.getByTestId('turn-summary')).toHaveText('Stopped after 1 of 3 steps');
      // The composer is back to plain Send
      await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
      await page.screenshot({ path: 'e2e/.results/background-3-stopped.png' });

      // Someone (an editor, another agent) changes the file after the stop —
      // Restore last recovery point brings back step-one state, folder included.
      expect(onDisk(gardenRoot, 'step-1.txt')).toBe('step 1\n');
      expect(onDisk(gardenRoot, 'step-2.txt')).toBeNull();
      const checkpoint = await latestRecovery(page);
      writeFileSync(join(folderOf(gardenRoot), 'step-1.txt'), 'edited after the stop\n');
      await expect.poll(() => onDisk(gardenRoot, 'step-1.txt')).toBe('edited after the stop\n');

      await restoreRecovery(page, checkpoint);

      await expect
        .poll(() => onDisk(gardenRoot, 'step-1.txt'), { timeout: 30_000 })
        .toBe('step 1\n');
      await expect(card).toHaveAttribute('data-status', 'interrupted');
    } finally {
      await app.close();
    }
  });

  test('a relaunch mid-job reports the job as interrupted with its last recovery point', async () => {
    const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    const { dir } = first;
    const gardenRoot = join(dir, 'garden');
    try {
      const input = await newBlankCrux(first.page);
      await input.fill('Please build it in three steps');
      await input.press('Enter');
      await expect(step(first.page, 1)).toHaveAttribute('data-status', 'done', {
        timeout: 30_000,
      });
      await expect(step(first.page, 2)).toHaveAttribute('data-status', 'running');
      // The app goes away under the running job
      await first.app.close();
    } catch (err) {
      await first.app.close().catch(() => {});
      throw err;
    }

    const again = await launchApp({ dir, env: { CRUX_AI_MOCK: '1' } });
    const { page } = again;
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByRole('button', { name: 'Open My Crux', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
        'My Crux',
      );

      const card = page.getByTestId('turn-job');
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(card).toHaveAttribute('data-status', 'interrupted');
      await expect(card).toContainText('Interrupted — the app closed while this was running');
      await expect(step(page, 1)).toHaveAttribute('data-status', 'done');
      await expect(step(page, 2)).toHaveAttribute('data-status', 'interrupted');
      // Nothing is running: the composer is plain Send again
      await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
      await page.screenshot({ path: 'e2e/.results/background-4-relaunched.png' });

      const checkpoint = await latestRecovery(page);
      writeFileSync(join(folderOf(gardenRoot), 'step-1.txt'), 'edited while closed\n');
      await restoreRecovery(page, checkpoint);
      await expect
        .poll(() => onDisk(gardenRoot, 'step-1.txt'), { timeout: 30_000 })
        .toBe('step 1\n');
      await expect(card).toHaveAttribute('data-status', 'interrupted');
    } finally {
      await again.app.close();
    }
  });
});
