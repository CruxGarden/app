import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

/**
 * A long paste into the composer becomes a file (MAKING-THE-AD-PARITY gap 8):
 * notes/<slug>-<stamp>.md lands in Artifacts and the composer says to read it.
 */
test('a long paste becomes a note the collaborator can read', async () => {
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    await createCrux(page, 'Brief');
    const composer = page.getByPlaceholder('Send a message...');
    await composer.fill('Make the spot from this.');
    const brief =
      '# The campaign brief\n\n' + 'Serious, deadpan, like a bank commercial. '.repeat(60);
    await composer.evaluate((el, text) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      );
    }, brief);
    await expect(composer).toHaveValue(
      /Read notes\/the-campaign-brief-\d+\.md first \(pasted, 2,\d{3} characters\)/,
      {
        timeout: 15_000,
      },
    );
    await page.getByRole('button', { name: 'Toggle artifacts' }).click();
    const tree = page.getByRole('tree');
    await expect(tree.getByText('notes', { exact: true })).toBeVisible({ timeout: 30_000 });
    await tree.getByText('notes', { exact: true }).click();
    await expect(tree.getByText(/the-campaign-brief-\d+\.md/)).toBeVisible();
    // A short paste stays in the composer.
    await composer.fill('');
    await composer.evaluate((el) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'just a line');
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      );
    });
    await page.waitForTimeout(500);
    await expect(composer).not.toHaveValue(/Read notes/);
  } finally {
    await app.close();
  }
});
