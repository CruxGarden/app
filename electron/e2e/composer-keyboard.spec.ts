import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';
import { showPane } from './panel-helpers';

for (const target of ['Collaboration', 'Garden conversation'] as const) {
  test(`${target} waits for IME composition to finish before Enter sends`, async () => {
    const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    try {
      await enterGarden(page);
      await createCrux(page, 'Language test');
      const pane =
        target === 'Collaboration'
          ? page.getByTestId('pane-body-collaboration')
          : await showPane(page, 'Console');
      const composer = pane.getByPlaceholder('Send a message...');
      await composer.fill('こんにちは');
      // Chromium sends composing key events while an OS input method commits a word.
      const allowedComposition = await composer.evaluate((element) =>
        element.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            isComposing: true,
            bubbles: true,
            cancelable: true,
          }),
        ),
      );
      expect(allowedComposition).toBe(true);
      await expect(composer).toHaveValue('こんにちは');
      await expect(pane.locator('[data-streaming="true"]')).toHaveCount(0);
      await composer.press('Enter');
      await expect(composer).toHaveValue('');
      await expect(pane.getByRole('region')).toContainText('こんにちは');
    } finally {
      await app.close();
    }
  });
}
