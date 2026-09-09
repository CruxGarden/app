import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

/**
 * The Agent Provider (ADR 0019): Claude Code as a Collaboration provider, on a
 * scripted runtime (CRUX_AGENT_MOCK=1) that speaks the SDK's message shapes.
 *  - "Your agent · Claude Code" appears in the model picker; picking it needs no key
 *  - a prompt renders streamed text, a Write tool bubble, and the file lands in
 *    the Project Folder → Artifacts (through the watcher, as any external edit)
 *  - a snapshot is taken for the turn; the reply is attributed to Claude Code
 *  - a Bash tool asks in the pane's approval banner: Allow runs it, Not now
 *    declines and Claude Code says so
 *  - the second turn resumes the same session
 *  - Settings → AI shows Claude Code as installed, with no key field
 */
async function ensurePane(page: Page, type: string, toggle: string) {
  const body = page.getByTestId(`pane-body-${type}`);
  if (!(await body.isVisible().catch(() => false)))
    await page.getByRole('button', { name: toggle }).click();
  await expect(body).toBeVisible({ timeout: 30_000 });
}

test.describe('agent provider (mock Claude Code)', () => {
  test.setTimeout(180_000);

  test('pick Claude Code, run turns with a tool, approve and decline Bash, resume the session', async () => {
    const { app, page, dir } = await launchApp({
      env: { CRUX_AGENT_MOCK: '1', CRUX_AI_MOCK: '1' },
    });
    try {
      await enterGarden(page);
      await createCrux(page, 'Agent Garden');
      await ensurePane(page, 'collaboration', 'Toggle collaboration');

      // The picker offers the agent under its own heading
      const picker = page.getByTestId('pane-body-collaboration').getByRole('button', {
        name: /Claude Sonnet 5/,
      });
      await picker.click();
      const group = page.getByTestId('model-group-claude-code');
      await expect(group).toContainText('Your agent');
      await group.getByRole('button', { name: 'Claude Code' }).click();
      await expect(
        page.getByTestId('pane-body-collaboration').getByRole('button', { name: /Claude Code/ }),
      ).toBeVisible();

      // First turn: text streams, a Write bubble appears, the file is ingested
      const composer = page.getByPlaceholder('Send a message...');
      await composer.fill('Leave me a note');
      await composer.press('Enter');
      const chat = page.getByTestId('pane-body-collaboration');
      await expect(chat.getByText(/Starting fresh/)).toBeVisible({ timeout: 30_000 });
      await expect(chat.getByText(/Wrote .*agent-note\.md/)).toBeVisible({ timeout: 30_000 });
      await expect(chat.getByText(/Done — the note is in agent-note\.md/)).toBeVisible({
        timeout: 30_000,
      });
      await expect(chat.getByText(/Claude Code · 1\.2s · \$0\.0042/)).toBeVisible();
      // attributed to the agent, not to the Keeper's model
      await expect(chat.getByText('Claude Code', { exact: true }).first()).toBeVisible();
      // the file is really in the Project Folder and reached Artifacts through the watcher
      const folder = join(dir, 'garden');
      await expect
        .poll(
          () => {
            const dirs = readdirSync(folder);
            return dirs.some((d) => existsSync(join(folder, d, 'agent-note.md')));
          },
          { timeout: 15_000 },
        )
        .toBe(true);
      await ensurePane(page, 'artifacts', 'Toggle artifacts');
      await expect(page.getByRole('tree').getByText('agent-note.md')).toBeVisible({
        timeout: 30_000,
      });
      // a snapshot for the turn
      await ensurePane(page, 'history', 'Toggle history');
      await expect(page.getByTestId('pane-body-history').getByText('No snapshots yet')).toHaveCount(
        0,
        {
          timeout: 30_000,
        },
      );

      // Second turn resumes the session and asks before running Bash: decline
      await composer.fill('Please run the command');
      await composer.press('Enter');
      await expect(chat.getByText(/Resuming our session/)).toBeVisible({ timeout: 30_000 });
      const approvals = page.getByTestId('agent-approvals');
      await expect(approvals).toContainText('Claude Code');
      await expect(approvals).toContainText('Bash');
      await expect(approvals).toContainText('echo hello from claude code');
      await approvals.getByRole('button', { name: 'Not now' }).click();
      await expect(chat.getByText(/Skipped the command, as you asked/)).toBeVisible({
        timeout: 30_000,
      });

      // Third turn: allow
      await composer.fill('run it again');
      await composer.press('Enter');
      await expect(approvals.getByRole('button', { name: 'Allow' })).toBeVisible({
        timeout: 30_000,
      });
      await approvals.getByRole('button', { name: 'Allow' }).click();
      await expect(chat.getByText(/The command ran/)).toBeVisible({ timeout: 30_000 });
      await expect(chat.getByText(/Ran echo hello from claude code/)).toHaveCount(2); // declined + allowed

      // Settings → AI: installed, no key field
      await page.keyboard.press('ControlOrMeta+,');
      await page.locator('h2', { hasText: /^AI$/ }).click();
      const aiToggle = page.getByRole('switch', { name: 'Enable AI Tools' });
      if ((await aiToggle.getAttribute('aria-checked')) !== 'true') await aiToggle.click();
      const status = page.getByTestId('claude-code-status');
      await expect(status).toContainText('Installed');
      await expect(status).toContainText('uses your Claude Code login');
      await page.keyboard.press('Escape');

      // every turn wrote into the same Project Folder
      const cruxDir = readdirSync(folder).find((d) =>
        existsSync(join(folder, d, 'agent-note.md')),
      )!;
      const notes = readFileSync(join(folder, cruxDir, 'agent-note.md'), 'utf8');
      expect(notes).toContain('run it again');
    } finally {
      await app.close();
    }
  });
});
