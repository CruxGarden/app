import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { enterGarden, createCrux } from '../multi-crux-helpers';
import { showPane, hidePane } from '../panel-helpers';
import { writeFirstFile } from '../journeys/journey-helpers';

/**
 * V1-TESTING-GUIDE § 27 · Mood: Flow — at the least sensitivity a few
 * keystrokes barely register while sustained work still builds Flow.
 * Defaults, growth and decay are flow.spec.ts.
 */
const activity = (page: import('@playwright/test').Page) =>
  page.evaluate(
    () => Number(document.documentElement.style.getPropertyValue('--signal-activity')) || 0,
  );

test.describe('guide 27 · Flow', () => {
  test('FLOW-04 — minimum sensitivity: a few actions barely register, sustained work still builds', async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      await createCrux(page, 'Flowing');
      const monaco = await writeFirstFile(page, 'index.html', '<p>');
      const mood = await showPane(page, 'Mood');
      const flow = mood.getByRole('switch', { name: 'Flow', exact: true });
      if ((await flow.getAttribute('aria-checked')) !== 'true') await flow.click();
      await mood.getByRole('slider', { name: 'Sensitivity', exact: true }).fill('0');
      await hidePane(page, 'Mood');
      await monaco.click();
      const before = await activity(page);
      await page.keyboard.type('abc');
      await page.waitForTimeout(1500);
      const few = await activity(page);
      expect(few - before).toBeLessThan(0.15);
      for (let i = 0; i < 12; i++) {
        await page.keyboard.type(' more words to write here ');
        await page.waitForTimeout(150);
      }
      await expect.poll(() => activity(page), { timeout: 30_000 }).toBeGreaterThan(few + 0.05);
    } finally {
      await app.close();
    }
  });

  test('FLOW-01 — a fresh garden wears Plasma with Flow on at the middle; a non-Plasma Mood with no preference is off', async () => {
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      const mood = await showPane(page, 'Mood');
      const flow = mood.getByRole('switch', { name: 'Flow', exact: true });
      const sensitivity = mood.getByRole('slider', { name: 'Sensitivity', exact: true });
      await expect(flow).toHaveAttribute('aria-checked', 'true');
      await expect(sensitivity).toHaveValue('50');
      await page
        .getByTestId('bundled-moods')
        .getByTestId('bundled-digital-fractal-garden')
        .getByRole('button', { name: 'Apply' })
        .click();
      await expect(flow).toHaveAttribute('aria-checked', 'false', { timeout: 15_000 });
      await expect(sensitivity).toBeDisabled();
      await expect.poll(() => activity(page)).toBe(0);
    } finally {
      await app.close();
    }
  });

  test('FLOW-02/03 — at the middle: one click barely moves it, a minute of writing builds it, quiet decays it gradually', async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      await createCrux(page, 'Steady work');
      const mood = await showPane(page, 'Mood');
      await expect(mood.getByRole('switch', { name: 'Flow', exact: true })).toHaveAttribute(
        'aria-checked',
        'true',
      );
      await expect(mood.getByRole('slider', { name: 'Sensitivity', exact: true })).toHaveValue(
        '50',
      );
      await hidePane(page, 'Mood');
      const composer = page.getByPlaceholder('Send a message...');
      await expect(composer).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => activity(page)).toBeLessThan(0.2);
      // A single click is not a pulse.
      await page.locator('.mosaic-window.pane-collaboration .pane-toolbar-label').click();
      await page.waitForTimeout(400);
      const oneClick = await activity(page);
      expect(oneClick).toBeLessThan(0.3);
      // Sustained writing grows it, step by step, never falling while the work goes on.
      await composer.click();
      const samples: number[] = [];
      for (const line of [
        'A garden that wakes as we write, ',
        'line after line, without a jolt, ',
        'the borders slowly carry the light; ',
        'we keep going, word after word, ',
        'and the glow keeps pace with the work, ',
        'never leaping, always growing.',
      ]) {
        await page.keyboard.type(line, { delay: 50 });
        samples.push(await activity(page));
      }
      // The middle setting builds slowly: clearly above a click, well short of full.
      expect(samples[samples.length - 1]!).toBeGreaterThan(Math.max(0.1, oneClick + 0.05));
      expect(samples[samples.length - 1]!).toBeGreaterThan(samples[0]!);
      for (let i = 1; i < samples.length; i++)
        expect(samples[i]!, `sample ${i}`).toBeGreaterThanOrEqual(samples[i - 1]! - 0.03);
      // The glow eases up to its level a moment after the last keystroke, then settles.
      await page.waitForTimeout(2500);
      const awake = await activity(page);
      expect(awake).toBeLessThan(0.9);
      // Quiet: part of the way down after half a minute, most of the way after three minutes.
      await page.clock.install();
      await page.clock.fastForward(30_000);
      const midway = await activity(page);
      // A little slack: the meter can still be settling from the last keystroke.
      expect(midway).toBeLessThanOrEqual(awake + 0.05);
      expect(midway).toBeGreaterThan(awake * 0.1);
      await page.clock.fastForward(150_000);
      await expect.poll(() => activity(page)).toBeLessThan(Math.min(midway, awake * 0.5));
      await page.clock.resume();
    } finally {
      await app.close();
    }
  });

  test('FLOW-05 — at the top: a single keystroke shows promptly, and one action never jumps to full', async () => {
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      await createCrux(page, 'Sharp work');
      const mood = await showPane(page, 'Mood');
      const flow = mood.getByRole('switch', { name: 'Flow', exact: true });
      if ((await flow.getAttribute('aria-checked')) !== 'true') await flow.click();
      await mood.getByRole('slider', { name: 'Sensitivity', exact: true }).fill('100');
      await hidePane(page, 'Mood');
      const composer = page.getByPlaceholder('Send a message...');
      await composer.click();
      await expect.poll(() => activity(page)).toBeLessThan(0.3);
      const before = await activity(page);
      await page.keyboard.type('a');
      await expect.poll(() => activity(page), { timeout: 3_000 }).toBeGreaterThan(before + 0.03);
      expect(await activity(page)).toBeLessThan(0.95);
      await page.keyboard.type('b');
      await expect.poll(() => activity(page), { timeout: 3_000 }).toBeGreaterThan(before + 0.06);
      expect(await activity(page)).toBeLessThan(0.95);
    } finally {
      await app.close();
    }
  });
});
