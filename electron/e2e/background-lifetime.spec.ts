import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';
import { showPane, hidePane } from './panel-helpers';

test('closing the background preview preserves the selected image; clearing releases it', async () => {
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    await page.evaluate(() => {
      const recorded: string[] = [];
      (window as unknown as { revokedImages: string[] }).revokedImages = recorded;
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.revokeObjectURL = (url: string) => {
        recorded.push(url);
        revoke(url);
      };
    });
    const mood = await showPane(page, 'Mood');
    await mood.getByRole('button', { name: 'Background', exact: true }).click();
    await mood
      .locator('input[type="file"][accept="image/*"]')
      .setInputFiles(join(__dirname, 'fixtures/backdrop.png'));
    const preview = mood.getByRole('img', { name: 'Background preview' });
    await expect(preview).toBeVisible();
    const background = page.getByTestId('mood-background-image');
    await expect(background).toHaveCSS('background-image', /blob:/);
    const selected = await background.evaluate(
      (el) => getComputedStyle(el).backgroundImage.match(/url\("(.+)"\)/)?.[1],
    );
    expect(selected).toBeTruthy();
    expect(await preview.getAttribute('src')).not.toBe(selected);
    await hidePane(page, 'Mood');
    expect(
      await page.evaluate(() => (window as unknown as { revokedImages: string[] }).revokedImages),
    ).not.toContain(selected);
    expect(await page.evaluate(async (url) => (await fetch(url!)).ok, selected)).toBe(true);
    const reopened = await showPane(page, 'Mood');
    await reopened.getByRole('button', { name: 'Background', exact: true }).click();
    await reopened.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(background).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { revokedImages: string[] }).revokedImages),
      )
      .toContain(selected);
  } finally {
    await app.close();
  }
});
