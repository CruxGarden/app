import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { enterGarden, createCrux } from '../multi-crux-helpers';

/** The keyboard reaches the switcher and the picker. */
test('keyboard access to the switcher and the picker', async () => {
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    await createCrux(page, 'Alpha');
    await createCrux(page, 'Beta');
    // Keyboard: the switcher finds a Crux by name.
    const shortcut = process.platform === 'darwin' ? 'Meta+Alt+k' : 'Control+Alt+k';
    await page.keyboard.press(shortcut);
    const search = page.getByRole('textbox', { name: 'Find a Crux in My Garden' });
    await expect(search).toBeFocused();
    await page.keyboard.type('Alpha');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
      'Alpha',
    );
    // Keyboard: the picker opens a panel.
    await page.getByRole('button', { name: 'Add panel', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('textbox', { name: 'Find a panel' }).fill('history');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('pane-body-history')).toBeVisible();
    // The narrow (one-panel) layout is below the window's least width; the
    // narrow-layout unit tests cover it (workspace-panes.test.ts).
  } finally {
    await app.close();
  }
});
