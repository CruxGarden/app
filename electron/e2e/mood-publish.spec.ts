import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';

/**
 * Phase 6: a saved Mood is published as a "mood" crux (mood.cruxmood +
 * mood.json + index.html) through the ordinary publish pipeline, shows up in
 * Explore → Moods with its swatch, and can be installed from there.
 */
test.describe('publish + discover moods (mocked API)', () => {
  test.setTimeout(150_000);

  test('publish a Mood, find it in Explore, install it', async () => {
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();

      // Connect the account (via the Share pane's inline form, like publish.spec)
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await page.getByRole('button', { name: 'New file' }).click({ timeout: 30_000 });
      const nameInput = page.getByRole('tree').getByRole('textbox');
      await nameInput.fill('index.html');
      await nameInput.press('Enter');
      const monaco = page.locator('.monaco-editor').first();
      await expect(monaco).toBeVisible({ timeout: 30_000 });
      await monaco.click();
      await page.keyboard.type('<h1>Hi</h1>');
      await page.keyboard.press('Meta+s');
      await page.getByRole('button', { name: 'Toggle share' }).click();
      await page.getByRole('button', { name: 'Share', exact: true }).click();
      await page.getByPlaceholder('email@example.com').fill('tester@example.com');
      await page.getByRole('button', { name: 'Send Code' }).click();
      await page.getByPlaceholder('Enter code').fill('123456');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      await expect(page.getByText('Up to date')).toBeVisible({ timeout: 30_000 });

      // Save the current look as a Mood and publish it
      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      await page.getByRole('button', { name: 'Save current as Mood' }).click();
      await page.getByRole('textbox', { name: 'Mood name' }).fill('Sea Glass');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Saved "Sea Glass"');
      await page.getByRole('button', { name: 'Publish Sea Glass' }).click();
      await expect(page.getByRole('status')).toContainText('Published "Sea Glass"', {
        timeout: 60_000,
      });
      await expect(page.getByRole('button', { name: 'Republish Sea Glass' })).toBeVisible();

      // The mock saw a mood crux published with the three files
      const moodCrux = Object.values(api.state.cruxes).find((c) => c.kind === 'mood');
      expect(moodCrux?.title).toBe('Sea Glass');
      const paths = (api.state.published[moodCrux!.id as string] ?? []).map((f) => f.path).sort();
      expect(paths).toEqual(['index.html', 'mood.cruxmood', 'mood.json']);
      expect((moodCrux!.meta as Record<string, unknown>).mood).toMatchObject({ section: 'Dark' });

      // Explore → Moods shows it with a swatch; Install pulls the package from the API
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Explore', exact: true }).click();
      await page.getByRole('button', { name: 'Moods', exact: true }).click();
      const card = page.getByTestId(`explore-mood-${moodCrux!.id as string}`);
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(card).toContainText('Sea Glass');
      await expect(card).toContainText('by tester');
      await page.screenshot({ path: 'e2e/.results/mood-publish-1-explore.png' });
      await card.getByRole('button', { name: 'Install', exact: true }).click();
      await expect(card).toContainText('Installed', { timeout: 30_000 });
      expect(api.log.some((l) => /\/artifacts\/art-\d+\/download -> 200/.test(l))).toBe(true);
    } finally {
      await app.close();
      await api.close();
    }
  });
});
