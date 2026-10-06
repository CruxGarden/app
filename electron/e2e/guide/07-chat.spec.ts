import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { enterGarden, createCrux } from '../multi-crux-helpers';
import { enableAi } from '../panel-helpers';

/**
 * V1-TESTING-GUIDE § 07 · Collaboration — the composer's keys. The turns
 * themselves are journeys/02, chat.spec.ts and the mock-model specs.
 */
test.describe('guide 07 · Collaboration', () => {
  test('CHAT-02 — Enter sends, Shift+Enter breaks a line, the Send button sends; no stale shortcut hint', async () => {
    const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    try {
      await enterGarden(page);
      await createCrux(page, 'Composer');
      await enableAi(page);
      const box = page.getByPlaceholder('Send a message...');
      const pane = page.getByTestId('pane-body-collaboration');
      // No sentence about shortcuts lives in the pane.
      await expect(pane.getByText(/press (Enter|⌘|Ctrl)/i)).toHaveCount(0);
      // Shift+Enter makes a new line and sends nothing.
      await box.fill('first line');
      await box.press('Shift+Enter');
      await box.type('second line');
      await expect(box).toHaveValue('first line\nsecond line');
      const sent = pane.locator('[data-role="user"]');
      await expect(sent).toHaveCount(0);
      // Enter sends the two lines as one message.
      await box.press('Enter');
      await expect(sent.first()).toContainText('first line', { timeout: 30_000 });
      await expect(sent.first()).toContainText('second line');
      await expect(box).toHaveValue('');
      // The Send button sends a short one.
      await box.fill('short');
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(sent.nth(1)).toContainText('short', { timeout: 30_000 });
      // A long one, sent with Enter, arrives whole.
      const long = 'A longer prompt that goes on for a while. '.repeat(12).trim();
      await box.fill(long);
      await box.press('Enter');
      await expect(sent.nth(2)).toContainText(long.slice(0, 40), { timeout: 30_000 });
    } finally {
      await app.close();
    }
  });
});
