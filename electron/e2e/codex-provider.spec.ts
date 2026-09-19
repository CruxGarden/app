import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

test('Codex shares Garden tools, resumes its own session, and asks in Collaboration', async () => {
  test.setTimeout(180_000);
  const { app, page, dir } = await launchApp({
    env: {
      CRUX_CODEX_PATH: join(__dirname, 'fixtures/codex-app-server.cjs'),
      CRUX_AGENT_MOCK: '1',
      CRUX_AI_MOCK: '1',
    },
  });
  try {
    await enterGarden(page);
    await createCrux(page, 'Codex Garden');
    const chat = page.getByTestId('pane-body-collaboration');
    if (!(await chat.isVisible()))
      await page.getByRole('button', { name: 'Toggle collaboration' }).click();
    await chat.getByTestId('model-selector').click();
    await page.getByTestId('model-group-codex').getByRole('button', { name: 'Codex' }).click();
    const composer = page.getByPlaceholder('Send a message...');
    await composer.fill('Leave a note using Garden tools');
    await composer.press('Enter');
    await expect(chat.getByText(/Saved codex-note.md using Garden tools/)).toBeVisible({
      timeout: 45_000,
    });
    const readNote = () => {
      const garden = join(dir, 'garden');
      const folder = readdirSync(garden).find((name) =>
        existsSync(join(garden, name, 'codex-note.md')),
      );
      return folder ? readFileSync(join(garden, folder, 'codex-note.md'), 'utf8') : '';
    };
    await expect.poll(readNote).toContain('Leave a note using Garden tools');
    await expect(chat.getByText(/cost not reported/)).toBeVisible();
    await composer.fill('run a command');
    await composer.press('Enter');
    const approvals = page.getByTestId('agent-approvals');
    await expect(approvals).toContainText('Codex', { timeout: 30_000 });
    await approvals.getByRole('button', { name: 'Not now' }).click();
    await expect(chat.getByText(/Saved codex-note.md using Garden tools/)).toHaveCount(2);
    await expect(chat.getByText(/Resuming Codex/)).toBeVisible();
    await expect.poll(readNote).toContain('run a command');
    // A provider switch must not pass the Codex session id to Claude or vice versa.
    await chat.getByRole('button', { name: 'Codex Codex', exact: true }).click();
    await page
      .getByTestId('model-group-claude-code')
      .getByRole('button', { name: 'Claude Code' })
      .click();
    await composer.fill('Leave a Claude note');
    await composer.press('Enter');
    await expect(chat.getByText(/Starting fresh/)).toBeVisible({ timeout: 30_000 });
    await expect(chat.getByText(/Done — the note is in agent-note.md/)).toBeVisible();
    await chat.getByRole('button', { name: 'Claude Code Claude Code', exact: true }).click();
    await page.getByTestId('model-group-codex').getByRole('button', { name: 'Codex' }).click();
    await composer.fill('run again');
    await composer.press('Enter');
    await expect(approvals).toContainText('Codex', { timeout: 30_000 });
    await approvals.getByRole('button', { name: 'Allow' }).click();
    await expect(chat.getByText(/Saved codex-note.md using Garden tools/)).toHaveCount(3);
    await expect(chat.getByText(/Resuming Codex/)).toHaveCount(2);
    await composer.fill('stop during this approval');
    await composer.press('Enter');
    await expect(approvals).toContainText('Codex', { timeout: 30_000 });
    await chat.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(approvals).toHaveCount(0);
    await expect(chat.getByText(/Saved codex-note.md using Garden tools/)).toHaveCount(3);
    await page.getByRole('button', { name: 'Toggle history' }).click();
    await expect(page.getByTestId('pane-body-history')).toBeVisible();
    await expect(page.getByTestId('pane-body-history').getByText('No snapshots yet')).toHaveCount(
      0,
    );
  } finally {
    await app.close();
  }
});
