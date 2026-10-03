import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { launchApp } from './launch';
import { enterGarden, createCrux, storedCrux, reenterWorkspace } from './multi-crux-helpers';
import { writeFirstFile } from './journeys/journey-helpers';
import { showPane, chooseSettingsSection } from './panel-helpers';

test('Settings reviews real recovery files, refuses unfinished cleanup and preserves live content through Trash and restart', async () => {
  test.setTimeout(120_000);
  let instance = await launchApp({ ai: false });
  const dir = instance.dir;
  try {
    const { page, app } = instance;
    await enterGarden(page);
    const id = await createCrux(page, 'Recovery review');
    await writeFirstFile(page, 'target.txt', 'Current content');
    const folder = (await storedCrux(page, id)).projectFolder;
    const overview = () => page.evaluate(() => window.electronAPI!.project.recoveryOverview!());
    await expect
      .poll(
        async () =>
          (await overview()).operations.filter((r) => r.folder === folder && r.hasPayload).length,
      )
      .toBeGreaterThan(0);
    const operation = (await overview()).operations.find(
      (r) => r.folder === folder && r.hasPayload,
    )!;
    const stage = join(folder, '.crux-recovery', operation.kind, operation.id);
    const receipt = readFileSync(join(stage, 'completed.json'), 'utf8');
    expect(operation.reason, receipt).toBeNull();
    const incomplete = join(folder, '.crux-recovery', 'write', randomUUID());
    mkdirSync(incomplete);
    writeFileSync(join(incomplete, 'original'), 'Keep unfinished recovery');
    await showPane(page, 'Settings');
    await chooseSettingsSection(page, 'Garden and backups');
    await page.getByRole('button', { name: 'Garden', exact: true }).click();
    const review = page.getByRole('region', { name: 'Recovery storage' });
    await review.getByRole('button', { name: 'Review recovery storage' }).click();
    await expect(review).toContainText('Hardlinks are counted once');
    const unfinished = review.getByRole('listitem').filter({ hasText: 'Needs recovery' });
    await expect(unfinished).toHaveCount(1);
    await expect(
      unfinished.getByRole('button', { name: 'Move retained files to Trash' }),
    ).toBeDisabled();
    const completed = review.locator(`[data-recovery-id="${operation.id}"]`);
    // Exercise the native confirmation through the real IPC handler; only the
    // dialog choice is scripted. shell.trashItem is the actual OS implementation.
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = (async (options: Electron.MessageBoxOptions) => {
        if (!options.detail?.includes('Close external editors') || options.defaultId !== 0)
          throw new Error('Missing safe confirmation');
        return { response: 0, checkboxChecked: false };
      }) as typeof dialog.showMessageBox;
    });
    await completed.getByRole('button', { name: 'Move retained files to Trash' }).click();
    await expect(
      completed.getByRole('button', { name: 'Move retained files to Trash' }),
    ).toBeEnabled();
    expect(readdirSync(stage).some((name) => name === 'replacement')).toBe(true);
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = (async () => ({
        response: 1,
        checkboxChecked: false,
      })) as typeof dialog.showMessageBox;
    });
    await completed.getByRole('button', { name: 'Move retained files to Trash' }).click();
    await expect(review.getByRole('status')).toContainText('Retained files moved to Trash');
    expect(readdirSync(stage).sort()).toEqual(['README.txt', 'completed.json']);
    expect(readFileSync(join(stage, 'completed.json'), 'utf8')).toBe(receipt);
    expect(readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('Current content');
    expect(existsSync(join(incomplete, 'original'))).toBe(true);
    await review.scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath('recovery-storage.png') });
    await app.close();
    instance = await launchApp({ dir, ai: false });
    await reenterWorkspace(instance.page, 'Recovery review');
    const restarted = await instance.page.evaluate(() =>
      window.electronAPI!.project.recoveryOverview!(),
    );
    expect(restarted.operations.find((r) => r.id === operation.id)?.hasPayload).toBe(false);
    expect(readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('Current content');
  } finally {
    await instance.app.close();
  }
});
