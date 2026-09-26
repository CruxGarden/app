import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { enterGarden, createCrux } from '../multi-crux-helpers';
import { writeFirstFile } from '../journeys/journey-helpers';

/**
 * V1-TESTING-GUIDE § 10 · Tasks — publication belongs to Main. Task creation,
 * review, merge and conflicts are parallel-tasks and task-* specs.
 */
test.describe('guide 10 · Tasks', () => {
  test('TASK-08 — a Task cannot publish; the Share pane points back to Main', async () => {
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      await createCrux(page, 'Task work');
      await writeFirstFile(page, 'index.html', '<h1>Main</h1>');
      await page.getByRole('button', { name: 'New task', exact: true }).click();
      await page.getByRole('textbox', { name: 'Task name', exact: true }).fill('Side quest');
      await page.getByRole('button', { name: 'Save and start task' }).click();
      await expect(page.getByRole('dialog', { name: 'New task', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
      // In the Task: Share, Sync, Export and Metadata belong to Main.
      for (const [type, toggle] of [
        ['publish', 'Toggle share'],
        ['export', 'Toggle export'],
      ] as const) {
        await page.getByRole('button', { name: 'Add panel', exact: true }).click();
        await page
          .getByRole('dialog', { name: 'Add panel', exact: true })
          .getByRole('button', { name: toggle, exact: true })
          .click();
        const pane = page.getByTestId(`pane-body-${type}`);
        await expect(page.locator(`.mosaic-window.pane-${type}`)).toBeVisible({ timeout: 30_000 });
        await expect(pane.getByText('Available in Main')).toBeVisible({ timeout: 30_000 });
        await expect(pane.getByRole('button', { name: 'Share', exact: true })).toHaveCount(0);
      }
      // Back in Main the Share pane is itself again.
      await page.getByRole('link', { name: 'Main', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
        'Task work',
      );
      await page.getByRole('button', { name: 'Add panel', exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Add panel', exact: true })
        .getByRole('button', { name: 'Toggle share', exact: true })
        .click();
      const share = page.getByTestId('pane-body-publish');
      await expect(share.getByRole('button', { name: 'Share', exact: true })).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      await app.close();
    }
  });
});
