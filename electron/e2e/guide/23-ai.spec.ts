import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from '../launch';
import { startMockApi } from '../api-mock';
import { enterGarden, createCrux } from '../multi-crux-helpers';
import { showPane, hidePane, togglePanel } from '../panel-helpers';
import { connectAccount, writeFirstFile } from '../journeys/journey-helpers';

/**
 * V1-TESTING-GUIDE § 23 · Settings: AI and Memory — the AI switch off, and
 * clearing memory with its confirmation. Keys, providers and metrics are
 * settings-ai-sound, included-collaborator and agent-metrics specs.
 */
test.describe('guide 23 · AI and Memory', () => {
  test('SETAI-01 — with AI Tools off nothing AI is offered and the work goes on by hand; on brings it back', async () => {
    const { app, page } = await launchApp({ ai: false, env: { CRUX_AI_MOCK: '1' } });
    try {
      await enterGarden(page);
      await createCrux(page, 'By hand');
      // A new Crux starts with its files beside the result, no conversation.
      await expect(page.getByTestId('pane-body-artifacts')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('pane-body-workshop')).toBeVisible();
      await expect(page.getByTestId('pane-body-collaboration')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Console', exact: true })).toHaveCount(0);
      // Neither the Panels picker nor ⌘K offers an AI panel.
      await page.getByRole('button', { name: 'Add panel', exact: true }).click();
      const picker = page.getByRole('dialog', { name: 'Add panel', exact: true });
      await expect(
        picker.getByRole('button', { name: 'Toggle artifacts', exact: true }),
      ).toBeVisible();
      await expect(picker.getByRole('button', { name: /collaboration/i })).toHaveCount(0);
      await page.keyboard.press('Escape');
      await page.keyboard.press('ControlOrMeta+k');
      const palette = page.getByRole('dialog', { name: 'Command palette' });
      await palette.getByRole('combobox').fill('collab');
      await expect(palette.getByRole('option', { name: /Collaboration/ })).toHaveCount(0);
      await page.keyboard.press('Escape');
      // Manual work is untouched.
      const monaco = await writeFirstFile(page, 'index.html', '<h1>By hand</h1>');
      await expect(monaco).toContainText('By hand');
      // On: the collaborator is offered again, and opens.
      const settings = await showPane(page, 'Settings');
      await settings.getByRole('button', { name: 'AI', exact: true }).click();
      const ai = settings.getByRole('switch', { name: 'Enable AI Tools' });
      await expect(ai).toHaveAttribute('aria-checked', 'false');
      await ai.click();
      await expect(ai).toHaveAttribute('aria-checked', 'true');
      await togglePanel(page, 'Toggle collaboration');
      await expect(page.getByTestId('pane-body-collaboration')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('button', { name: 'Console', exact: true })).toBeVisible();
      // Off again: the conversation goes with it.
      await ai.click();
      await expect(ai).toHaveAttribute('aria-checked', 'false');
      await expect(page.getByTestId('pane-body-collaboration')).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

  test('SETAI-08 — Clear memory asks first; Cancel keeps it; Clear empties it and a restart agrees', async () => {
    const first = await launchApp();
    const dir = first.dir;
    try {
      const { page } = first;
      await enterGarden(page);
      const settings = await showPane(page, 'Settings');
      const memory = settings.getByTestId('memory-settings');
      const box = memory.getByLabel('Memory');
      await box.fill('- prefers British spelling');
      await box.blur();
      await expect(
        memory.getByRole('button', { name: /^Forget: prefers British spelling/ }),
      ).toBeVisible({
        timeout: 30_000,
      });
      await memory.getByRole('button', { name: 'Clear', exact: true }).click();
      const ask = page.getByRole('dialog', { name: 'Clear memory' });
      await expect(ask).toContainText(/projects are untouched/);
      await ask.getByRole('button', { name: 'Cancel' }).click();
      await expect(
        memory.getByRole('button', { name: /^Forget: prefers British spelling/ }),
      ).toBeVisible();
      await memory.getByRole('button', { name: 'Clear', exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Clear memory' })
        .getByRole('button', { name: 'Clear' })
        .click();
      await expect(memory.getByRole('button', { name: /^Forget:/ })).toHaveCount(0);
      await expect(memory.getByRole('button', { name: 'Clear', exact: true })).toBeDisabled();
    } finally {
      await first.app.close();
    }
    const again = await launchApp({ dir });
    try {
      await again.page
        .getByRole('button', { name: 'Enter', exact: true })
        .click({ timeout: 30_000 });
      const settings = await showPane(again.page, 'Settings');
      const memory = settings.getByTestId('memory-settings');
      await expect(memory.getByRole('button', { name: /^Forget:/ })).toHaveCount(0);
      await expect(memory.getByRole('button', { name: 'Clear', exact: true })).toBeDisabled();
    } finally {
      await again.app.close();
    }
  });

  test('SETAI-06 — the included collaborator is absent while signed out or on Free, and offered with its allowance once eligible', async () => {
    test.setTimeout(150_000);
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url, CRUX_AI_MOCK: '1' } });
    try {
      await enterGarden(page);
      await createCrux(page, 'Included or not');
      const menu = page.getByTestId('model-selector-menu');
      // Signed out: no allowance section, no included choice in the picker.
      await page.getByTestId('model-selector').click();
      await expect(menu).toBeVisible();
      await expect(menu.getByText('Included collaborator')).toHaveCount(0);
      await page.keyboard.press('Escape');
      let settings = await showPane(page, 'Settings');
      await expect(settings.getByTestId('included-usage')).toHaveCount(0);
      // Signed in on Free: the section says the plan is not eligible; still no choice.
      await connectAccount(page, settings);
      await expect(settings.getByText(/Connected/).first()).toBeVisible({ timeout: 30_000 });
      const included = settings.getByTestId('included-usage');
      await expect(included).toBeVisible({ timeout: 30_000 });
      await expect(included.getByRole('progressbar')).toHaveCount(0);
      await expect(included).not.toContainText('Loading included allowance');
      await hidePane(page, 'Settings');
      await page.getByTestId('model-selector').click();
      await expect(menu.getByText('Included collaborator')).toHaveCount(0);
      await page.keyboard.press('Escape');
      // Eligible: the allowance meters show and the picker offers the included collaborator.
      api.state.billing.planId = 'gardener';
      await page.evaluate(() => window.dispatchEvent(new Event('crux:usage-changed')));
      settings = await showPane(page, 'Settings');
      await expect(
        settings.getByTestId('included-usage').getByRole('progressbar', {
          name: 'Rolling five hours used',
        }),
      ).toHaveAttribute('aria-valuenow', '25', { timeout: 30_000 });
      await hidePane(page, 'Settings');
      await createCrux(page, 'Now eligible');
      await page.getByTestId('model-selector').click();
      await expect(menu.getByText('Included collaborator')).toBeVisible({ timeout: 30_000 });
      await page.keyboard.press('Escape');
    } finally {
      await app.close();
      await api.close();
    }
  });

  test('SETAI-09 — a failed tool call is counted by kind; the report names tools, never the conversation', async () => {
    test.setTimeout(180_000);
    const { app, page, dir } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    try {
      await enterGarden(page);
      let settings = await showPane(page, 'Settings');
      await settings.locator('h2', { hasText: /^AI$/ }).click();
      const metrics = settings.getByTestId('agent-metrics');
      const toggle = metrics.getByRole('switch', { name: 'Record agent metrics' });
      if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'true');
      await hidePane(page, 'Settings');
      // The "rewind" script: snapshot → read a file that does not exist (fails) → write → restore.
      await createCrux(page, 'Metered failures');
      const input = page.getByPlaceholder('Send a message...');
      await input.fill('Please rewind this');
      await input.press('Enter');
      await expect(page.getByText('Done — rewound to the checkpoint.')).toBeVisible({
        timeout: 60_000,
      });
      settings = await showPane(page, 'Settings');
      if (!(await metrics.isVisible().catch(() => false)))
        await settings.locator('h2', { hasText: /^AI$/ }).click();
      await metrics.getByRole('button', { name: 'Refresh' }).click();
      const stat = (label: string) =>
        metrics.locator('dl > div', { has: page.locator('dt', { hasText: label }) }).locator('dd');
      await expect(stat('Turns')).toHaveText('1');
      await expect(stat('Tool calls')).toHaveText('4');
      // The missing file is a "named nothing" failure: one of four.
      await expect(stat('Named nothing')).toHaveText('25.0%');
      await metrics.getByText('Full report').click();
      const report = metrics.locator('pre');
      await expect(report).toContainText(/4 tool calls, [1-9] failed/);
      await expect(report).toContainText(/read_file: 1 call, 1 failed \(100%\).*unknown-target 1/);
      await expect(report).toContainText(/write_file: 1 call, 0 failed/);
      await expect(report).not.toContainText('rewind this');
      await expect(report).not.toContainText('hello.txt');
      // Saved under the Garden Root at the chosen relative path, counts only.
      await metrics
        .getByLabel('Report file path, relative to the Garden Root')
        .fill('notes/metrics/failures.md');
      await metrics.getByRole('button', { name: 'Append report' }).click();
      await expect(metrics.getByText(/^Appended to /)).toBeVisible();
      const file = join(dir, 'garden', 'notes', 'metrics', 'failures.md');
      await expect.poll(() => existsSync(file)).toBe(true);
      const text = readFileSync(file, 'utf8');
      expect(text).toContain('unknown-target 1');
      expect(text).not.toContain('rewind this');
    } finally {
      await app.close();
    }
  });
});
