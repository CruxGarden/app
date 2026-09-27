import { test, expect } from '@playwright/test';
import { renameSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from '../launch';
import { enterGarden, createCrux, goHome, storedCrux } from '../multi-crux-helpers';
import { closeWorkspace, writeFirstFile } from '../journeys/journey-helpers';

/**
 * V1-TESTING-GUIDE § 33 · Recently deleted and failure recovery — Delete
 * forever's cancel and consequence, and a Project Folder that went missing.
 */
test.describe('guide 33 · Recovery', () => {
  test('RECOVER-02 — Delete forever: cancel keeps it, confirm removes it for good, a restart agrees', async () => {
    const first = await launchApp();
    const dir = first.dir;
    try {
      const { page } = first;
      await enterGarden(page);
      await createCrux(page, 'Disposable');
      await closeWorkspace(page, 'Disposable');
      await expect(page.getByTestId('pane-body-home')).toBeVisible({ timeout: 15_000 });
      const card = page.getByRole('button', { name: 'Open Disposable' }).locator('..');
      await card.hover();
      await card.getByRole('button', { name: 'Crux actions' }).click();
      await page.getByRole('menuitem', { name: 'Delete' }).click();
      const deleteAsk = page.getByRole('dialog', { name: 'Delete Crux' });
      await expect(deleteAsk).toBeVisible();
      await deleteAsk.getByRole('button', { name: 'Delete', exact: true }).click();
      const trash = page.getByTestId('trash-section');
      await expect(trash).toContainText('Disposable');
      // Cancel is harmless.
      await trash.getByRole('button', { name: 'Delete forever' }).click();
      const ask = page.getByRole('dialog', { name: 'Delete forever' });
      await expect(ask).toContainText(/cannot be undone|for good|permanent/i);
      await ask.getByRole('button', { name: 'Cancel' }).click();
      await expect(trash).toContainText('Disposable');
      // Confirm: gone from the Trash and from the database.
      await trash.getByRole('button', { name: 'Delete forever' }).click();
      await page
        .getByRole('dialog', { name: 'Delete forever' })
        .getByRole('button', { name: 'Delete forever' })
        .click();
      await expect(trash.getByText('Disposable')).toHaveCount(0);
    } finally {
      await first.app.close();
    }
    const again = await launchApp({ dir });
    try {
      await again.page
        .getByRole('button', { name: 'Enter', exact: true })
        .click({ timeout: 30_000 });
      await expect(again.page.getByTestId('pane-body-home')).toBeVisible({ timeout: 30_000 });
      await expect(again.page.getByText('Disposable')).toHaveCount(0);
    } finally {
      await again.app.close();
    }
  });

  test('RECOVER-06 — a moved Project Folder is named as missing and restored on request, not replaced silently', async () => {
    const first = await launchApp();
    const dir = first.dir;
    let folder = '';
    try {
      const { page } = first;
      await enterGarden(page);
      const id = await createCrux(page, 'Wanderer');
      await writeFirstFile(page, 'index.html', '<h1>Kept</h1>');
      folder = (await storedCrux(page, id)).projectFolder as string;
      await expect.poll(() => existsSync(folder)).toBe(true);
    } finally {
      await first.app.close();
    }
    renameSync(folder, `${folder}-moved`);
    const again = await launchApp({ dir });
    try {
      const { page } = again;
      await page.getByRole('button', { name: 'Enter', exact: true }).click({ timeout: 30_000 });
      await page.getByRole('button', { name: 'Open Wanderer', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(1500);
      const artifacts = page.getByTestId('pane-body-artifacts');
      if (!(await artifacts.isVisible().catch(() => false))) {
        await page.getByRole('button', { name: 'Add panel', exact: true }).click();
        await page
          .getByRole('dialog', { name: 'Add panel', exact: true })
          .getByRole('button', { name: 'Toggle artifacts', exact: true })
          .click();
      }
      await expect(artifacts).toBeVisible({ timeout: 30_000 });
      // Either the app names the missing folder and restores it on request, or it
      // already restored it from history — never an empty replacement.
      const banner = page.getByText('Project folder is missing on disk');
      const restored = () => existsSync(join(folder, 'index.html'));
      await expect
        .poll(async () => (await banner.isVisible().catch(() => false)) || restored(), {
          timeout: 30_000,
        })
        .toBe(true);
      if (await banner.isVisible().catch(() => false)) {
        expect(existsSync(folder)).toBe(false);
        await page.getByRole('button', { name: 'Restore folder' }).click();
        await expect(banner).toHaveCount(0, { timeout: 30_000 });
      }
      await expect.poll(restored, { timeout: 30_000 }).toBe(true);
      expect(readFileSync(join(folder, 'index.html'), 'utf8')).toContain('Kept');
      await expect(page.getByRole('tree').getByText('index.html')).toBeVisible({ timeout: 30_000 });
    } finally {
      await again.app.close();
    }
  });

  test('RECOVER-05 — killed after a save, the file is whole; killed with an edit pending, the saved text is whole and the loss window is recorded', async () => {
    test.setTimeout(180_000);
    const kill = async (app: import('@playwright/test').ElectronApplication) => {
      const exited = new Promise<void>((resolve) => app.process().once('exit', () => resolve()));
      app.process().kill('SIGKILL');
      await exited;
    };
    const first = await launchApp();
    const dir = first.dir;
    let folder = '';
    let killed = false;
    try {
      const { page } = first;
      await enterGarden(page);
      const id = await createCrux(page, 'Pending edit');
      await writeFirstFile(page, 'notes.txt', 'Saved line');
      folder = (await storedCrux(page, id)).projectFolder as string;
      await expect.poll(() => readFileSync(join(folder, 'notes.txt'), 'utf8')).toBe('Saved line');
      await kill(first.app);
      killed = true;
    } finally {
      if (!killed) await first.app.close();
    }
    // 1. After a save: everything saved is there.
    const second = await launchApp({ dir });
    killed = false;
    try {
      const { page } = second;
      await page.getByRole('button', { name: 'Enter', exact: true }).click({ timeout: 30_000 });
      await page.getByRole('button', { name: 'Open Pending edit', exact: true }).click();
      await page.getByRole('tree').getByText('notes.txt').click({ timeout: 30_000 });
      const monaco = page.locator('.monaco-editor').first();
      await expect(monaco).toContainText('Saved line', { timeout: 30_000 });
      expect(readFileSync(join(folder, 'notes.txt'), 'utf8')).toBe('Saved line');
      // 2. A small edit, not saved, then the process dies.
      await monaco.click();
      await page.keyboard.press('End');
      await page.keyboard.type(' plus pending');
      await expect(monaco).toContainText('plus pending');
      await page.waitForTimeout(1000);
      await kill(second.app);
      killed = true;
    } finally {
      if (!killed) await second.app.close();
    }
    const third = await launchApp({ dir });
    try {
      const { page } = third;
      await page.getByRole('button', { name: 'Enter', exact: true }).click({ timeout: 30_000 });
      await page.getByRole('button', { name: 'Open Pending edit', exact: true }).click();
      await page.getByRole('tree').getByText('notes.txt').click({ timeout: 30_000 });
      const monaco = page.locator('.monaco-editor').first();
      await expect(monaco).toContainText('Saved line', { timeout: 30_000 });
      // Never a torn file: exactly the saved text, or the whole pending edit if it was kept.
      const onDisk = readFileSync(join(folder, 'notes.txt'), 'utf8');
      expect(['Saved line', 'Saved line plus pending']).toContain(onDisk);
      const shown = await monaco.textContent();
      const recovered = onDisk.includes('plus pending') || (shown ?? '').includes('plus pending');
      console.log(`[RECOVER-05] on disk: ${JSON.stringify(onDisk)}; editor shows pending: ${(shown ?? '').includes('plus pending')}`);
      test.info().annotations.push({
        type: 'loss window',
        description: recovered
          ? 'the unsaved edit came back after the kill'
          : 'unsaved keystrokes since the last Cmd+S are lost on a hard kill; the saved file is intact',
      });
      await expect(page.getByRole('tree').getByText('notes.txt')).toBeVisible();
    } finally {
      await third.app.close();
    }
  });
});
