import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';

// Retained, explicitly requested authoring through normal Garden Collaboration.
// Does not auto-approve: each native action is reviewed in the visible pane.
test('author a Penpot study with the Garden collaborator', async () => {
  test.skip(process.env.CRUX_LIVE_PENPOT_DESIGN !== '1', 'Explicit creative session only');
  test.setTimeout(15 * 60_000);
  const dir = process.env.CRUX_PENPOT_DESIGN_PROFILE!;
  const cruxId = process.env.CRUX_PENPOT_DESIGN_CRUX!;
  const prompt = readFileSync(process.env.CRUX_PENPOT_DESIGN_PROMPT!, 'utf8');
  expect(dir && cruxId && prompt).toBeTruthy();
  const { app, page } = await launchApp({ dir, env: { CRUX_AI_MOCK: '1' } });
  console.log(`Retained Penpot creative profile: ${dir}`);
  try {
    await page.getByRole('button', { name: /enter/i }).click();
    await page.goto(new URL(`/c/${cruxId}`, page.url()).toString());
    await expect(page.locator('[data-workspace-id]')).toBeVisible();
    const chat = page.getByTestId('pane-body-collaboration');
    if (!(await chat.isVisible()))
      await page.getByRole('button', { name: 'Toggle collaboration' }).click();
    await expect(chat.getByRole('button', { name: 'Claude Code', exact: true })).toBeVisible();
    const composer = page.getByPlaceholder('Send a message...');
    await composer.fill(prompt);
    await composer.press('Enter');
    await expect(chat.locator('p').filter({ hasText: /LAVA_FLOWER_STUDY_READY$/ })).toBeVisible({
      timeout: 12 * 60_000,
    });
    await expect(chat.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
    await page.screenshot({ path: join(dir, 'lava-flower-garden.png') });
    writeFileSync(join(dir, 'creative-session-status.json'), JSON.stringify({ completed: true }));
  } finally {
    await page.screenshot({ path: join(dir, 'lava-flower-last.png') }).catch(() => {});
    await app.close();
  }
});
