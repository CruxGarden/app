import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux, wearMaterial } from './multi-crux-helpers';

test('wordmark, titles, content and code keep their fonts across Moods', async () => {
  const { app, page } = await launchApp();
  try {
    await expect(page.locator('.font-wordmark').first()).toHaveCSS(
      'font-family',
      /Cormorant Garamond/,
    );
    // Simulate the old saved title picker and custom font settings at boot.
    await page.evaluate(() =>
      localStorage.setItem(
        'cruxgarden:moodThemeDark',
        JSON.stringify({
          fontDisplay: "'Cormorant Garamond', serif",
          fontBody: "'Outfit', sans-serif",
          fontMono: 'Menlo, monospace',
          fontReading: 'Georgia, serif',
        }),
      ),
    );
    await page.reload();
    await enterGarden(page);
    await page.evaluate(() => {
      document.documentElement.dataset.observedForming = '0';
      new MutationObserver((records) => {
        if (
          records.some(
            (record) =>
              record.attributeName === 'data-plasma-forming' &&
              (record.target as Element).hasAttribute('data-plasma-forming'),
          )
        ) {
          document.documentElement.dataset.observedForming = '1';
        }
      }).observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ['data-plasma-forming'],
      });
    });
    await createCrux(page, 'Type study');
    const pane = page.locator('.pane-toolbar-label').filter({ hasText: 'Collaboration' });
    await expect(pane).toHaveCSS('font-family', /Outfit/);
    await expect(pane).toHaveCSS('font-size', '13px');
    await expect(page.getByPlaceholder('Send a message...')).toHaveCSS('font-family', /Inter/);
    await expect(page.locator('.font-mono').filter({ visible: true }).first()).toHaveCSS(
      'font-family',
      /JetBrains Mono/,
    );
    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    const title = page.getByRole('heading', { name: 'Mood', exact: true });
    await expect(title).toHaveCSS('font-family', /Outfit/);
    await expect(page.locator('html')).toHaveCSS('--plasma-form-in', 'off');
    await expect(page.getByTestId('material-switch-titles')).toHaveCount(0);
    for (const mood of ['plasma-fjord', 'fjord']) {
      await wearMaterial(page, mood);
      await expect(pane).toHaveCSS('font-family', /Outfit/);
      await expect(title).toHaveCSS('font-family', /Outfit/);
      await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
    }
    await page.evaluate(() => document.fonts.ready);
    const loaded = await page.evaluate(() => [...document.fonts].map((font) => font.family));
    expect(new Set(loaded)).toEqual(
      new Set(['Outfit', 'Inter', 'JetBrains Mono', 'Cormorant Garamond']),
    );
    await expect(page.locator('html')).toHaveAttribute('data-observed-forming', '0');
    await page.screenshot({ path: 'e2e/.results/mood-title-font.png' });
  } finally {
    await app.close();
  }
});
