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
  page.evaluate(() =>
    Number(document.documentElement.style.getPropertyValue('--signal-activity')) || 0,
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
});
