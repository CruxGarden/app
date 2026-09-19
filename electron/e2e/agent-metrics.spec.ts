import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

/**
 * Agent metrics (2026-09-18) through the UI it ships with: turn the meter on
 * in Settings → AI, run one mock-AI turn that calls a tool, and read the
 * counters back; then append the report to the Garden Root and check the
 * file. Nothing about the numbers' quality — that the meter is wired to a
 * real turn and the readout to real settings, which is what a refactor would
 * break silently.
 */
test('agent metrics: a turn is counted and the report lands in the Garden Root', async () => {
  test.setTimeout(180_000);
  const { app, page, dir } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  try {
    await enterGarden(page);

    // Switch the meter on. Settings → AI holds the section.
    await page.keyboard.press('ControlOrMeta+,');
    // The Settings modal carries no dialog role; reach the section by its heading.
    await page.locator('h2', { hasText: /^AI$/ }).click();
    const metrics = page.getByTestId('agent-metrics');
    await expect(metrics).toBeVisible();
    const toggle = metrics.getByRole('switch', { name: 'Record agent metrics' });
    if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(metrics.getByRole('button', { name: 'Append report' })).toBeDisabled();
    await page.keyboard.press('Escape');

    // One turn with a tool call.
    await createCrux(page, 'Metered');
    const input = page.getByPlaceholder('Send a message...');
    await input.fill('Please write hello');
    await input.press('Enter');
    await expect(page.getByText('Done — I wrote that file for you.')).toBeVisible({
      timeout: 30_000,
    });

    // Read it back.
    await page.keyboard.press('ControlOrMeta+,');
    await page.locator('h2', { hasText: /^AI$/ }).click();
    await metrics.getByRole('button', { name: 'Refresh' }).click();
    const stat = (label: string) =>
      metrics.locator('dl > div', { has: page.locator('dt', { hasText: label }) }).locator('dd');
    await expect(stat('Turns')).toHaveText('1');
    await expect(stat('Tool calls')).toHaveText('1');
    await expect(stat('Named nothing')).toHaveText('0.0%');
    await metrics.getByText('Full report').click();
    await expect(metrics.locator('pre')).toContainText('write_file');

    // Append the report under the Garden Root, at the path shown.
    const pathField = metrics.getByLabel('Report file path, relative to the Garden Root');
    await pathField.fill('reports/agent-metrics.md');
    await metrics.getByRole('button', { name: 'Append report' }).click();
    await expect(metrics.getByText(/^Appended to /)).toBeVisible();
    const file = join(dir, 'garden', 'reports', 'agent-metrics.md');
    await expect.poll(() => existsSync(file)).toBe(true);
    const text = readFileSync(file, 'utf8');
    expect(text).toContain('write_file');
    expect(text).not.toContain('Please write hello'); // counts, never content

    // Reset clears the counters; the file stays.
    await metrics.getByRole('button', { name: 'Reset' }).click();
    await expect(stat('Turns')).toHaveText('0');
    expect(existsSync(file)).toBe(true);
  } finally {
    await app.close();
  }
});
