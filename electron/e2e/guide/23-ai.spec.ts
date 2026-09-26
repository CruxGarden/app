import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { enterGarden, createCrux } from '../multi-crux-helpers';
import { showPane } from '../panel-helpers';
import { writeFirstFile } from '../journeys/journey-helpers';

/**
 * V1-TESTING-GUIDE § 23 · Settings: AI and Memory — the AI switch off, and
 * clearing memory with its confirmation. Keys, providers and metrics are
 * settings-ai-sound, included-collaborator and agent-metrics specs.
 */
test.describe('guide 23 · AI and Memory', () => {
  test('SETAI-01 — with AI Tools off the work goes on by hand and the composer says so', async () => {
    const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    try {
      await enterGarden(page);
      await createCrux(page, 'By hand');
      const settings = await showPane(page, 'Settings');
      await settings.getByRole('button', { name: 'AI', exact: true }).click();
      const ai = settings.getByRole('switch', { name: 'Enable AI Tools' });
      // Off (the default in a fresh garden), then on, then off again.
      if ((await ai.getAttribute('aria-checked')) === 'true') await ai.click();
      await expect(ai).toHaveAttribute('aria-checked', 'false');
      // The Garden's collaborator says it is off and points at Settings.
      await page.getByRole('button', { name: 'Add panel', exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Add panel', exact: true })
        .getByRole('button', { name: 'Toggle garden collaboration', exact: true })
        .click();
      const console_ = page.getByTestId('pane-body-console');
      await expect(console_).toBeVisible({ timeout: 30_000 });
      await expect(console_.getByText(/Turn it on in Settings/)).toBeVisible();
      // Manual work is untouched.
      const monaco = await writeFirstFile(page, 'index.html', '<h1>By hand</h1>');
      await expect(monaco).toContainText('By hand');
      // On: the Garden's collaborator is there to talk to.
      await ai.click();
      await expect(ai).toHaveAttribute('aria-checked', 'true');
      await expect(console_.getByText(/Turn it on in Settings/)).toHaveCount(0);
      await expect(console_.getByPlaceholder(/Send a message|Ask/i).first()).toBeVisible({
        timeout: 30_000,
      });
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
});
