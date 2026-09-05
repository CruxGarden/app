import { test, expect, type Page } from '@playwright/test';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';

/**
 * Subagents on Growth branches (AI-COLLABORATION-V3 B5) with the scripted
 * model (CRUX_AI_MOCK=1, "in parallel" in ai/mock-model.ts): the model calls
 * `delegate` with three tasks — Alpha, Beta, Gamma — and each worker writes its
 * own file plus the shared notes.md. The card shows the three rows finish, the
 * two clean files merge automatically, notes.md needs a decision; choosing one
 * branch and pressing Merge puts that content on disk and records "Merged 3
 * subagents"; the timeline holds the three "Sub:" branches. Stop mid-run marks
 * the workers interrupted and leaves the main line untouched.
 */
test.describe('subagents (mock AI)', () => {
  test.setTimeout(180_000);

  const folderOf = (gardenRoot: string) => join(gardenRoot, readdirSync(gardenRoot)[0]!);
  const onDisk = (gardenRoot: string, file: string): string | null => {
    try {
      const p = join(folderOf(gardenRoot), file);
      return existsSync(p) ? readFileSync(p, 'utf8') : null;
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

  test('three workers run, two files merge, notes.md needs a decision, Merge records the snapshot', async () => {
    const { app, page, dir } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    const gardenRoot = join(dir, 'garden');
    try {
      const input = await newBlankCrux(page);
      await input.fill('Please caption these in parallel');
      await input.press('Enter');

      // The card shows the workers under the job while they run
      const card = page.getByTestId('turn-job');
      await expect(card).toBeVisible({ timeout: 30_000 });
      const rows = page.getByTestId('subagent');
      await expect(rows).toHaveCount(3, { timeout: 30_000 });
      await expect(rows.nth(0)).toContainText('Alpha');
      await expect(rows.nth(1)).toContainText('Beta');
      await expect(rows.nth(2)).toContainText('Gamma');
      for (let i = 0; i < 3; i++) {
        await expect(rows.nth(i)).toHaveAttribute('data-status', 'done', { timeout: 60_000 });
        await expect(rows.nth(i)).toContainText('2 files');
      }

      // The merge: two clean files applied, the shared one waits for the person
      const merge = page.getByTestId('merge');
      await expect(merge).toBeVisible({ timeout: 30_000 });
      await expect(merge).toHaveAttribute('data-status', 'pending');
      await expect(merge).toContainText('Needs a decision');
      await expect(page.getByTestId('merge-applied')).toContainText('alpha.md');
      await expect(page.getByTestId('merge-applied')).toContainText('beta.md');
      await expect(page.getByTestId('merge-applied')).toContainText('gamma.md');
      const conflict = page.getByTestId('merge-conflict');
      await expect(conflict).toHaveCount(1);
      await expect(conflict).toHaveAttribute('data-path', 'notes.md');

      // The main model closed the turn with the merge summary in hand
      await expect(page.getByText('Done — merged the parallel work.')).toBeVisible({
        timeout: 30_000,
      });
      await expect(card).toContainText('Needs a decision');
      // Merged files are on disk; the conflicted one is not (nothing applied for it)
      await expect.poll(() => onDisk(gardenRoot, 'alpha.md')).toBe('Alpha was here.\n');
      await expect.poll(() => onDisk(gardenRoot, 'beta.md')).toBe('Beta was here.\n');
      await expect.poll(() => onDisk(gardenRoot, 'gamma.md')).toBe('Gamma was here.\n');
      expect(onDisk(gardenRoot, 'notes.md')).toBeNull();
      // Each worker left one summary line in the Collaboration, in its own name
      await expect(page.getByText('subagent:Alpha', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('subagent:Beta', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('subagent:Gamma', { exact: true }).first()).toBeVisible();
      await page.screenshot({ path: 'e2e/.results/subagents-1-decision.png' });

      // Merge is disabled until the person chooses; choose Beta's version
      const mergeButton = merge.getByRole('button', { name: 'Merge' });
      await expect(mergeButton).toBeDisabled();
      await conflict.getByRole('combobox').selectOption({ label: 'Beta' });
      await expect(mergeButton).toBeEnabled();
      await mergeButton.click();

      await expect(merge).toHaveAttribute('data-status', 'merged', { timeout: 30_000 });
      await expect(merge).toContainText('from Beta');
      await expect(card).toContainText('Merged');
      await expect
        .poll(() => onDisk(gardenRoot, 'notes.md'), { timeout: 30_000 })
        .toBe('notes from Beta\n');
      await page.screenshot({ path: 'e2e/.results/subagents-2-merged.png' });

      // Growth: the base, the three branches, and the merge
      await page.getByRole('button', { name: 'Toggle history' }).click();
      await expect(page.getByText('Before parallel work', { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText('Sub: Alpha', { exact: true })).toBeVisible();
      await expect(page.getByText('Sub: Beta', { exact: true })).toBeVisible();
      await expect(page.getByText('Sub: Gamma', { exact: true })).toBeVisible();
      await expect(page.getByText('Merged 3 subagents', { exact: true })).toBeVisible();
      await page.screenshot({ path: 'e2e/.results/subagents-3-timeline.png' });
    } finally {
      await app.close();
    }
  });

  test('Stop during the run marks the workers interrupted and leaves the main line untouched', async () => {
    const { app, page, dir } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    const gardenRoot = join(dir, 'garden');
    try {
      const input = await newBlankCrux(page);
      await input.fill('Please caption these in parallel, slowly');
      await input.press('Enter');

      const card = page.getByTestId('turn-job');
      const rows = page.getByTestId('subagent');
      await expect(rows).toHaveCount(3, { timeout: 30_000 });
      await expect(card).toContainText('Working in parallel');
      await expect(rows.nth(0)).toHaveAttribute('data-status', 'running');
      await card.getByRole('button', { name: 'Stop' }).click();

      await expect(card).toHaveAttribute('data-status', 'interrupted', { timeout: 30_000 });
      for (let i = 0; i < 3; i++) {
        await expect(rows.nth(i)).toHaveAttribute('data-status', 'interrupted');
      }
      await expect(card).toContainText('Stopped');
      await expect(page.getByTestId('merge')).toHaveCount(0);
      await page.screenshot({ path: 'e2e/.results/subagents-4-stopped.png' });

      // Nothing reached the Project Folder
      await page.waitForTimeout(1500);
      expect(onDisk(gardenRoot, 'alpha.md')).toBeNull();
      expect(onDisk(gardenRoot, 'beta.md')).toBeNull();
      expect(onDisk(gardenRoot, 'gamma.md')).toBeNull();
      expect(onDisk(gardenRoot, 'notes.md')).toBeNull();
      // The branches stay in Growth, restorable
      await page.getByRole('button', { name: 'Toggle history' }).click();
      await expect(page.getByText('Sub: Alpha', { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('Merged 3 subagents', { exact: true })).toHaveCount(0);
    } finally {
      await app.close();
    }
  });
});
