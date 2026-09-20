import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

/**
 * The Tasks area's details (Daniel, 2026-09-19): Main and each task show
 * their name, status, start and notes in the Tasks pane; the name and notes
 * are edited in place and survive a switch and a reopen.
 */
test('a task’s details are reviewed and updated in the Tasks pane', async () => {
  test.setTimeout(150000);
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  try {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);
    await createCrux(page, 'Launch site');
    const details = page.getByTestId('task-details');
    await expect(details).toContainText('Main');
    // Main's notes.
    await details.getByRole('textbox', { name: 'Notes' }).fill('The site ships Friday.');
    await details.getByRole('textbox', { name: 'Notes' }).blur();
    await expect(details.getByText('Notes saved')).toBeVisible();

    // A task: its ask, its status, its own notes and a rename.
    await page.getByRole('button', { name: 'New task', exact: true }).click();
    await page.getByRole('textbox', { name: 'Task name', exact: true }).fill('Checkout');
    await page
      .getByRole('dialog', { name: 'New task', exact: true })
      .locator('textarea')
      .fill('Make the checkout safe.');
    await page.getByRole('button', { name: 'Save and start task' }).click();
    await expect(page.getByRole('dialog', { name: 'New task', exact: true })).toHaveCount(0);
    await expect(details).toContainText('This task', { timeout: 30000 });
    await expect(details).toContainText('Make the checkout safe.');
    await expect(details.getByTestId('task-status')).toBeVisible();
    await details.getByRole('textbox', { name: 'Notes' }).fill('Stripe first, then Apple Pay.');
    await details.getByRole('textbox', { name: 'Notes' }).blur();
    await expect(details.getByText('Notes saved')).toBeVisible();
    const name = details.getByRole('textbox', { name: 'Task name' });
    await name.fill('Checkout flow');
    await name.press('Enter');
    await expect(details.getByText('Name saved')).toBeVisible();
    await expect(
      page.getByTestId('task-bar').getByRole('link', { name: /Checkout flow/ }),
    ).toBeVisible();

    // Back to Main and forward again: everything kept.
    await page.getByTestId('task-bar').getByRole('link', { name: 'Main', exact: true }).click();
    await expect(details).toContainText('Main');
    await expect(details.getByRole('textbox', { name: 'Notes' })).toHaveValue(
      'The site ships Friday.',
    );
    await page
      .getByTestId('task-bar')
      .getByRole('link', { name: /Checkout flow/ })
      .click();
    await expect(details).toContainText('This task');
    await expect(details.getByRole('textbox', { name: 'Notes' })).toHaveValue(
      'Stripe first, then Apple Pay.',
    );
    await page.screenshot({ path: 'e2e/.results/task-details.png' });
  } finally {
    await app.close();
  }
});
