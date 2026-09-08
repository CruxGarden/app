import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, createCrux, switchCrux, storedCrux } from './multi-crux-helpers';

test('concurrent turns write and snapshot only their own Crux; hidden approval stays scoped', async () => {
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  try {
    await enterGarden(page);
    const alpha = await createCrux(page, 'Alpha');
    const beta = await createCrux(page, 'Beta');
    const input = page.getByPlaceholder('Send a message...');
    await switchCrux(page, 'Alpha');
    await input.fill('[workspace:Alpha]');
    await input.press('Enter');
    await expect(page.getByTestId('turn-job')).toBeVisible();
    await switchCrux(page, 'Beta');
    await input.fill('[workspace:Beta]');
    await input.press('Enter');
    await expect(page.getByTestId('turn-job')).toBeVisible();
    await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
    const dialog = page.getByRole('dialog', { name: 'Switch Crux workspace' });
    await expect(dialog.getByRole('button', { name: /^Alpha Working/ })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^✓ Beta Working/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Completed workspace Beta.', { exact: true })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText('Completed workspace Alpha.', { exact: true })).toHaveCount(0);
    for (const [id, name] of [
      [alpha, 'Alpha'],
      [beta, 'Beta'],
    ]) {
      const meta = await storedCrux(page, id);
      await expect
        .poll(() => {
          try {
            return readFileSync(join(meta.projectFolder, 'shared.txt'), 'utf8');
          } catch {
            return '';
          }
        })
        .toBe(`Owned by ${name}\n`);
      await expect
        .poll(async () =>
          page.evaluate(async (id) => {
            const rows = await window.electronAPI!.sqlite.all(
              "SELECT id FROM dimensions WHERE source_id = ? AND type = 'growth'",
              [id],
            );
            return rows.length;
          }, id),
        )
        .toBeGreaterThan(0);
    }
    await switchCrux(page, 'Alpha');
    await expect(page.getByText('Completed workspace Alpha.', { exact: true })).toBeVisible();
    await expect(page.getByText('Completed workspace Beta.', { exact: true })).toHaveCount(0);
    await input.fill('[workspace:Alpha:delete]');
    await input.press('Enter');
    await switchCrux(page, 'Beta');
    await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
    await expect(dialog.getByRole('button', { name: /^Alpha Needs approval/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Keep', exact: true })).toHaveCount(0);
    await switchCrux(page, 'Alpha');
    await page.getByRole('button', { name: 'Keep', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Keep', exact: true })).toHaveCount(0);
    const a = await storedCrux(page, alpha);
    const b = await storedCrux(page, beta);
    expect(readFileSync(join(a.projectFolder, 'shared.txt'), 'utf8')).toBe('Owned by Alpha\n');
    expect(readFileSync(join(b.projectFolder, 'shared.txt'), 'utf8')).toBe('Owned by Beta\n');
  } finally {
    await app.close();
  }
});

test('closing A stops only A and preserves its queue while B finishes', async () => {
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  try {
    await enterGarden(page);
    const a = await createCrux(page, 'Alpha');
    const b = await createCrux(page, 'Beta');
    const input = page.getByPlaceholder('Send a message...');
    await switchCrux(page, 'Alpha');
    await input.fill('[workspace:Alpha]');
    await input.press('Enter');
    await expect(page.getByTestId('turn-job')).toBeVisible();
    await input.fill('Queued for Alpha');
    await input.press('Enter');
    await switchCrux(page, 'Beta');
    await input.fill('[workspace:Beta]');
    await input.press('Enter');
    await expect(page.getByTestId('turn-job')).toBeVisible();
    await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
    await page.getByRole('button', { name: 'Close Alpha workspace' }).click();
    await page.getByRole('button', { name: 'Save and close', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText('Beta');
    const alpha = await storedCrux(page, a);
    expect(alpha.turnJob.status).toBe('interrupted');
    expect(alpha.turnQueue).toEqual(['Queued for Alpha']);
    await expect(page.getByText('Completed workspace Beta.', { exact: true })).toBeVisible({
      timeout: 30000,
    });
    const beta = await storedCrux(page, b);
    expect(readFileSync(join(beta.projectFolder, 'shared.txt'), 'utf8')).toBe('Owned by Beta\n');
    expect(() => readFileSync(join(alpha.projectFolder, 'shared.txt'))).toThrow();
    await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
    await page.getByRole('button', { name: 'Open another Crux…' }).click();
    await page.getByRole('textbox', { name: 'Find a Crux in your garden' }).fill('Alpha');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('turn-job')).toHaveAttribute('data-status', 'interrupted');
    await expect(page.getByText('Queued for Alpha', { exact: true })).toBeVisible();
    expect((await storedCrux(page, a)).turnQueue).toEqual(['Queued for Alpha']);
  } finally {
    await app.close();
  }
});
