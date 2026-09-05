import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';

/**
 * Garden Memory (AI-COLLABORATION-V3 B6, ADR 0013) with the scripted model
 * (CRUX_AI_MOCK=1): "remember" makes the model call the visible `remember`
 * tool; the transcript shows what was saved; Settings → Memory shows the same
 * line, edits there persist, a NEW crux's first turn is sent a system prompt
 * that carries it, the desktop mirror memory.md exists, and Clear empties it.
 */
const NOTE = 'prefers British spelling';

async function plantGarden(page: Page) {
  await page.getByRole('button', { name: /enter/i }).click();
  await page.getByText('Plant a new garden').click();
  await page.getByRole('button', { name: 'Welcome' }).click();
  await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible();
}

async function newBlankCrux(page: Page) {
  await page.getByRole('button', { name: 'Add Crux' }).click();
  await page.getByRole('button', { name: /^Blank/ }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const input = page.getByPlaceholder('Send a message...');
  await expect(input).toBeVisible({ timeout: 30_000 });
  return input;
}

async function openSettings(page: Page) {
  await page.keyboard.press('ControlOrMeta+,');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Memory', exact: true })).toBeVisible();
}

async function closeSettings(page: Page) {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCount(0);
}

/** What the mock model has been sent as system prompts so far (see ai/mock-model.ts). */
function systemPrompts(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      (
        window as unknown as { __cruxAiMock?: { systemPrompts(): string[] } }
      ).__cruxAiMock?.systemPrompts() ?? [],
  );
}

test.describe('garden memory (mock AI)', () => {
  test.setTimeout(180_000);

  test('remember → transcript, Settings → Memory, mirror file, new crux prompt, Clear', async () => {
    const { app, page, dir } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    const mirror = join(dir, 'garden', 'memory.md');
    try {
      await plantGarden(page);

      // ── Nothing remembered yet: the first prompt says so ───────────────────
      const input = await newBlankCrux(page);
      await input.fill('hello');
      await input.press('Enter');
      await expect(page.getByText('Mock reply: hello')).toBeVisible({ timeout: 30_000 });
      const before = await systemPrompts(page);
      expect(before.length).toBeGreaterThan(0);
      expect(before.at(-1)).toContain('## What you know about this gardener');
      expect(before.at(-1)).toContain('Nothing remembered yet.');
      expect(before.at(-1)).not.toContain(NOTE);

      // ── The model remembers through the visible tool ───────────────────────
      await input.fill('Please remember that I prefer British spelling');
      await input.press('Enter');
      await expect(page.getByText('Noted — I will keep that in mind.')).toBeVisible({
        timeout: 30_000,
      });
      // The tool record is in the transcript; expanding it shows what was saved
      const toolRecord = page.getByRole('button', { name: /^Remembered\b/ });
      await expect(toolRecord).toBeVisible();
      await toolRecord.click();
      await expect(page.getByText(`Remembered (Preferences): ${NOTE}`)).toBeVisible();
      await page.screenshot({ path: 'e2e/.results/memory-1-remembered.png' });

      // ── Desktop mirror: a real file in the Garden Root ─────────────────────
      await expect.poll(() => existsSync(mirror), { timeout: 15_000 }).toBe(true);
      expect(readFileSync(mirror, 'utf8')).toContain(`## Preferences\n- ${NOTE}`);

      // ── Settings → Memory shows it; the person edits; it persists ──────────
      await openSettings(page);
      const textarea = page.getByTestId('memory-text');
      await expect(textarea).toHaveValue(new RegExp(`## Preferences\\n- ${NOTE}`));
      await expect(page.getByRole('button', { name: `Forget: ${NOTE}` })).toBeVisible();
      await expect(page.getByTestId('memory-settings')).not.toContainText(/\bAI\b/);
      await textarea.fill(`## Preferences\n- ${NOTE}\n\n## Voice\n- short sentences\n`);
      await textarea.blur(); // save on blur
      await expect(page.getByTestId('memory-status')).toHaveText(/Saved|2 lines/);
      await page.screenshot({ path: 'e2e/.results/memory-2-settings.png' });
      await closeSettings(page);
      await openSettings(page);
      await expect(page.getByTestId('memory-text')).toHaveValue(/## Voice\n- short sentences/);
      await expect(page.getByTestId('memory-status')).toHaveText('2 lines');
      await closeSettings(page);
      await expect
        .poll(() => readFileSync(mirror, 'utf8'), { timeout: 15_000 })
        .toContain('- short sentences');

      // ── A NEW crux's first turn is sent the memory in its system prompt ────
      await page
        .getByRole('link', { name: /garden|home/i })
        .first()
        .click()
        .catch(async () => {
          await page.evaluate(() => window.history.back());
        });
      await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible({ timeout: 30_000 });
      const input2 = await newBlankCrux(page);
      await input2.fill('hello again');
      await input2.press('Enter');
      await expect(page.getByText('Mock reply: hello again')).toBeVisible({ timeout: 30_000 });
      const after = await systemPrompts(page);
      expect(after.at(-1)).toContain('## What you know about this gardener');
      expect(after.at(-1)).toContain(`- ${NOTE}`);
      expect(after.at(-1)).toContain('- short sentences');
      expect(after.at(-1)).not.toContain('Nothing remembered yet.');

      // ── Clear empties it everywhere ────────────────────────────────────────
      await openSettings(page);
      await page.getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(page.getByTestId('memory-status')).toHaveText('nothing remembered');
      await expect(page.getByTestId('memory-text')).not.toHaveValue(new RegExp(NOTE));
      await closeSettings(page);
      await expect
        .poll(() => readFileSync(mirror, 'utf8'), { timeout: 15_000 })
        .not.toContain(NOTE);
      await input2.fill('hello once more');
      await input2.press('Enter');
      await expect(page.getByText('Mock reply: hello once more')).toBeVisible({ timeout: 30_000 });
      expect((await systemPrompts(page)).at(-1)).toContain('Nothing remembered yet.');
    } finally {
      await app.close();
    }
  });
});
