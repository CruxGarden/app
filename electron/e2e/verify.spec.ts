import { test, expect, type Page } from '@playwright/test';
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';

/**
 * Verify before done (AI-COLLABORATION-V3 B4) with the scripted model
 * (CRUX_AI_MOCK=1, "landing page" in ai/mock-model.ts): the model writes an
 * index.html without its heading and says it is done. The app checks the
 * claim — screenshots the preview and asks the model for a verdict — which
 * finds the heading missing; the findings go back as a "Check found:" message,
 * the model fixes the page in one follow-up turn, and the re-check passes with
 * a screenshot on the reply and on the snapshot. Then the person's own
 * "Check it" passes on the fixed page without a follow-up, and a plain answer
 * that changes no files is never checked.
 */
test.describe('verify before done (mock AI)', () => {
  test.setTimeout(240_000);

  const folderOf = (gardenRoot: string) => join(gardenRoot, readdirSync(gardenRoot)[0]!);
  const onDisk = (gardenRoot: string, file: string): string | null => {
    try {
      return readFileSync(join(folderOf(gardenRoot), file), 'utf8');
    } catch {
      return null;
    }
  };

  async function newBlankCrux(page: Page) {
    await page.getByRole('button', { name: /enter/i }).click();
    await page.getByText('Plant a new garden').click();
    await page.getByRole('button', { name: 'Welcome' }).click();
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Blank/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const input = page.getByPlaceholder('Send a message...');
    await expect(input).toBeVisible({ timeout: 30_000 });
    return input;
  }

  test('a done claim is checked, fixed once, re-checked; Check it passes; a plain answer is not checked', async () => {
    const { app, page, dir } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    const gardenRoot = join(dir, 'garden');
    // The renderer's console, for when a check stalls silently
    mkdirSync('e2e/.results', { recursive: true });
    const consoleLog = 'e2e/.results/verify-console.log';
    writeFileSync(consoleLog, '');
    page.on('console', (m) => appendFileSync(consoleLog, `[${m.type()}] ${m.text()}\n`));
    page.on('pageerror', (e) =>
      appendFileSync(consoleLog, `[pageerror] ${e.stack ?? e.message}\n`),
    );
    try {
      const input = await newBlankCrux(page);
      // A Blank crux has no index.html yet: the check controls are not offered
      await expect(page.getByTestId('check-controls')).toHaveCount(0);

      await input.fill('Please make a landing page');
      await input.press('Enter');

      // The model writes the page and claims done → the check starts
      const card = page.getByTestId('turn-job');
      await expect(page.getByText('Done — the landing page is ready.')).toBeVisible({
        timeout: 60_000,
      });
      await expect(card).toHaveAttribute('data-status', 'checking', { timeout: 30_000 });
      await expect(card).toContainText('Checking…');
      await page.screenshot({ path: 'e2e/.results/verify-1-checking.png' });

      // First verdict: problems → recorded on the reply, handed back as the
      // check's message, and the job reopens for one fix turn
      const results = page.getByTestId('check-result');
      await expect(results.first()).toHaveText('Check found problems', { timeout: 60_000 });
      const checkMessage = page.getByTestId('check-message');
      await expect(checkMessage).toHaveCount(1);
      await expect(checkMessage).toContainText('Check found: Heading missing');
      await expect(checkMessage).toContainText('Check'); // the app's words, not the person's
      await page.screenshot({ path: 'e2e/.results/verify-2-problems.png' });

      // The fix turn lands, the re-check passes: the reply carries "Checked ✓" and the shot
      await expect(page.getByText('Fixed — added the heading.')).toBeVisible({ timeout: 60_000 });
      await expect(results.last()).toHaveText('Checked ✓', { timeout: 60_000 });
      await expect(results.first()).toHaveText('Check found problems'); // the "before" stays honest
      await expect(results).toHaveCount(2);
      const thumbs = page.getByTestId('check-thumb');
      await expect(thumbs).toHaveCount(2);
      await expect(thumbs.last()).toBeVisible();
      await expect(thumbs.last()).toHaveAttribute('src', /^blob:/);
      // A passed automatic check folds the card away
      await expect(card).toHaveCount(0, { timeout: 60_000 });
      // Exactly one follow-up: the fix is on disk, the check message appears once
      await expect.poll(() => onDisk(gardenRoot, 'index.html')).toContain('<h1>Welcome</h1>');
      await expect(checkMessage).toHaveCount(1);
      await page.screenshot({ path: 'e2e/.results/verify-3-checked.png' });

      // Growth: the failed state and the fixed state each carry their verdict
      await page.getByRole('button', { name: 'Toggle history' }).click();
      const badges = page.getByTestId('growth-checked');
      await expect(badges.filter({ hasText: 'Checked ✓' })).toHaveCount(1, { timeout: 30_000 });
      await expect(badges.filter({ hasText: 'Check found problems' })).toHaveCount(1);
      await page.screenshot({ path: 'e2e/.results/verify-4-growth.png' });

      // The person's "Check it" on the unchanged page: passes, no follow-up turn
      const controls = page.getByTestId('check-controls');
      await expect(controls).toBeVisible();
      await controls.getByRole('button', { name: 'Check it' }).click();
      await expect(card).toHaveAttribute('data-check', 'passed', { timeout: 60_000 });
      await expect(card).toContainText('Checked ✓');
      await expect(card.getByTestId('check-shot')).toBeVisible();
      await expect(checkMessage).toHaveCount(1);
      await expect(page.getByText('Fixed — added the heading.')).toHaveCount(1);
      await expect(results).toHaveCount(2);
      await expect(badges.filter({ hasText: 'Checked ✓' })).toHaveCount(1);
      await page.screenshot({ path: 'e2e/.results/verify-5-check-it.png' });
      await card.getByRole('button', { name: 'Dismiss' }).click();
      await expect(card).toHaveCount(0);

      // The switch for the automatic check is the person's, and flips
      const auto = controls.getByRole('switch');
      await expect(auto).toHaveAttribute('aria-checked', 'true');
      await auto.click();
      await expect(auto).toHaveAttribute('aria-checked', 'false');
      await auto.click();
      await expect(auto).toHaveAttribute('aria-checked', 'true');

      // A one-line answer with no file changes is never checked
      await input.fill('Please just say hi');
      await input.press('Enter');
      await expect(page.getByText('Mock reply: Please just say hi')).toBeVisible({
        timeout: 30_000,
      });
      await expect(card).toHaveCount(0);
      await expect(results).toHaveCount(2);
      await expect(checkMessage).toHaveCount(1);
    } finally {
      await app.close();
    }
  });
});
