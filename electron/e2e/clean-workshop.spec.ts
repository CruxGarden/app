import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux, createCrux, switchCrux } from './multi-crux-helpers';

test('idea → clean preview → entry choice → advanced edits → restart', async () => {
  test.setTimeout(180000);
  let instance = await launchApp();
  const dir = instance.dir;
  mkdirSync('/private/tmp/clean-workshop', { recursive: true });
  try {
    let page = instance.page;
    await page.setViewportSize({ width: 1440, height: 1000 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page
      .getByLabel('Your idea (optional)')
      .fill('Make a tiny reading list with a warm green background.');
    await page.getByLabel('Name', { exact: true }).fill('Reading room');
    await page.screenshot({ path: '/private/tmp/clean-workshop/01-create.png' });
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const workshop = () => page.getByTestId('workshop-view');
    await expect(workshop()).toHaveAttribute('data-view', 'clean');
    await expect(page.getByTestId('pane-body-collaboration').locator('textarea')).toHaveValue(
      'Make a tiny reading list with a warm green background.',
    );
    await expect(page.getByText('Your creation will appear here', { exact: true })).toBeVisible();
    await expect(page.getByTestId('pane-body-artifacts')).not.toBeVisible();
    await expect(page.getByRole('banner').getByRole('link', { name: /^Tending/ })).toBeVisible();
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const { projectFolder: folder } = await storedCrux(page, id);
    expect(
      ((await storedCrux(page, id)).messages ?? []).filter(
        (m: { role: string }) => m.role === 'user',
      ),
    ).toHaveLength(0); // Draft, never auto-sent.
    await page.screenshot({ path: '/private/tmp/clean-workshop/02-empty.png' });

    // Real external writes: ingestion alone opens the default result, with no tab selection.
    const home =
      '<!doctype html><html><body style="background:#eff4e6;color:#173f32;font-family:Georgia;padding:48px"><h1>The reading room</h1><p>A small place for the next good book.</p><a href="reading.html">Open reading list</a></body></html>';
    const reading =
      '<!doctype html><html><body style="background:#eff4e6;color:#173f32;font-family:Georgia;padding:48px"><h1>Your reading list</h1><button onclick="this.textContent=\'Saved\'">Save a book</button></body></html>';
    writeFileSync(join(folder, 'index.html'), home);
    writeFileSync(join(folder, 'reading.html'), reading);
    writeFileSync(join(folder, 'notes.md'), '# Notes\nKeep this draft.');
    await expect
      .poll(async () => {
        const row = (await page.evaluate(
          async (id) =>
            window.electronAPI!.sqlite.get(
              "SELECT COUNT(*) AS count FROM artifacts WHERE resource_id = ? AND path IN ('index.html', 'reading.html', 'notes.md')",
              [id],
            ),
          id,
        )) as { count: number };
        return row.count;
      })
      .toBe(3);

    const frame = () => page.frameLocator('iframe[data-crux-id]');
    await expect(frame().getByRole('heading', { name: 'The reading room' })).toBeVisible({
      timeout: 30000,
    });
    await frame().getByRole('link', { name: 'Open reading list' }).click();
    await expect(frame().getByRole('heading', { name: 'Your reading list' })).toBeVisible();
    await workshop().getByRole('button', { name: 'Home', exact: true }).click();
    await expect(frame().getByRole('heading', { name: 'The reading room' })).toBeVisible();
    await workshop().getByRole('button', { name: 'Crux settings' }).click();
    await page.getByLabel('Entry file', { exact: true }).selectOption('reading.html');
    await expect
      .poll(async () => (await storedCrux(page, id)).settings?.entryFile)
      .toBe('reading.html');
    await expect(frame().getByRole('heading', { name: 'Your reading list' })).toBeVisible();
    // Frame-local actionability does not wait for the outer pane's entrance animation.
    await workshop().evaluate(async (element) => {
      const pane = element.closest('.mosaic-window') ?? element;
      await Promise.all(
        pane
          .getAnimations({ subtree: true })
          .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
    await frame().getByRole('button', { name: 'Save a book' }).click();
    await expect(frame().getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
    await workshop().getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(frame().getByRole('button', { name: 'Save a book' })).toBeVisible();
    // Saving new bytes at the same path still refreshes the creation automatically.
    writeFileSync(
      join(folder, 'reading.html'),
      reading.replace('Your reading list', 'Updated reading list'),
    );
    await expect(frame().getByRole('heading', { name: 'Updated reading list' })).toBeVisible();
    writeFileSync(join(folder, 'reading.html'), reading);
    await expect(frame().getByRole('heading', { name: 'Your reading list' })).toBeVisible();
    await page.getByRole('button', { name: 'Toggle metadata' }).click();
    await expect(frame().getByRole('heading', { name: 'Your reading list' })).toBeVisible();
    await page.screenshot({ path: '/private/tmp/clean-workshop/03-clean.png' });

    await workshop().getByRole('button', { name: 'Advanced', exact: true }).click();
    await expect(page.locator('.monaco-editor').first()).toContainText('Your reading list');
    await workshop().getByRole('button', { name: 'Clean', exact: true }).click();
    await expect(frame().getByRole('heading', { name: 'Your reading list' })).toBeVisible();
    await page.getByRole('button', { name: 'Toggle artifacts' }).click();
    await page.getByRole('tree').getByText('notes.md', { exact: true }).click();
    await expect(workshop()).toHaveAttribute('data-view', 'advanced');
    await expect(page.locator('.monaco-editor').first()).toContainText('Keep this draft.');
    await page.locator('.monaco-editor').first().click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(' Unsaved thought.');
    await expect(page.locator('.monaco-editor').first()).toContainText('Unsaved thought.');
    await workshop().getByRole('button', { name: 'Clean', exact: true }).click();
    await expect(frame().getByRole('heading', { name: 'Your reading list' })).toBeVisible();
    await workshop().getByRole('button', { name: 'Advanced', exact: true }).click();
    await expect(page.locator('.monaco-editor').first()).toContainText('Unsaved thought.');
    await page.locator('.monaco-editor').first().click();
    await page.keyboard.press('ControlOrMeta+s');
    await workshop().getByRole('button', { name: 'Clean', exact: true }).click();
    await page.getByRole('button', { name: 'Toggle artifacts' }).click();

    // A saved choice disappearing never silently opens another page.
    unlinkSync(join(folder, 'reading.html'));
    await expect(page.getByText('Choose an available entry file', { exact: true })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.locator('iframe[data-crux-id]')).toHaveCount(0);
    writeFileSync(join(folder, 'reading.html'), reading);
    await expect(frame().getByRole('heading', { name: 'Your reading list' })).toBeVisible({
      timeout: 30000,
    });

    await createCrux(page, 'Other idea');
    await expect(page.getByText('Your creation will appear here', { exact: true })).toBeVisible();
    await switchCrux(page, 'Reading room');
    await expect(workshop()).toHaveAttribute('data-view', 'clean');
    await expect(frame().getByRole('heading', { name: 'Your reading list' })).toBeVisible();
    await instance.app.close();
    instance = await launchApp({ dir });
    page = instance.page;
    await page.getByRole('button', { name: /enter/i }).click();
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', id);
    await expect(page.getByTestId('workshop-view')).toHaveAttribute('data-view', 'clean');
    await expect(
      page.frameLocator('iframe[data-crux-id]').getByRole('heading', { name: 'Your reading list' }),
    ).toBeVisible({ timeout: 30000 });
  } finally {
    await instance.app.close();
  }
});
