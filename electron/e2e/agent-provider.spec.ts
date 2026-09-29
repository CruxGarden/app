import { togglePanel } from './panel-helpers';
import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, createCrux, storedCrux } from './multi-crux-helpers';

/**
 * The Agent Provider (ADR 0019): Claude Code as a Collaboration provider, on a
 * scripted runtime (CRUX_AGENT_MOCK=1) that speaks the SDK's message shapes.
 *  - "Your agent · Claude Code" appears in the model picker; picking it needs no key
 *  - a prompt renders streamed text, a Write tool bubble, and the file lands in
 *    the Project Folder → Artifacts (through the watcher, as any external edit)
 *  - the reply is attributed to Claude Code
 *  - a Bash tool asks in the pane's approval banner: Allow runs it, Not now
 *    declines and Claude Code says so
 *  - the second turn resumes the same session
 *  - Settings → AI shows Claude Code as installed, with no key field
 */
async function ensurePane(page: Page, type: string, toggle: string) {
  const body = page.getByTestId(`pane-body-${type}`);
  if (!(await body.isVisible().catch(() => false))) await togglePanel(page, toggle);
  await expect(body).toBeVisible({ timeout: 30_000 });
}

test.describe('agent provider (mock Claude Code)', () => {
  test.setTimeout(180_000);

  test('pick Claude Code, run turns with a tool, approve and decline Bash, resume the session', async () => {
    const { app, page } = await launchApp({
      env: { CRUX_AGENT_MOCK: '1', CRUX_AI_MOCK: '1' },
    });
    try {
      await enterGarden(page);
      const cruxId = await createCrux(page, 'Agent Garden');
      const folder = (await storedCrux(page, cruxId)).projectFolder as string;
      await ensurePane(page, 'collaboration', 'Toggle collaboration');

      // The picker offers the agent under its own heading
      const picker = page.getByTestId('pane-body-collaboration').getByTestId('model-selector');
      await picker.click();
      const group = page.getByTestId('model-group-claude-code');
      await expect(group).toContainText('Your agent');
      await group.getByRole('button', { name: 'Claude Code' }).click();
      await expect(picker).toContainText('Claude Code');
      await expect(picker).toHaveAttribute('aria-expanded', 'false');

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
      await expect.poll(() => existsSync(join(folder, 'agent-note.md'))).toBe(true);
      await ensurePane(page, 'artifacts', 'Toggle artifacts');
      await expect(page.getByRole('tree').getByText('agent-note.md')).toBeVisible({
        timeout: 30_000,
      });
      // Second turn resumes the session and asks before running Bash: decline
      await composer.fill('Please run the command');
      await composer.press('Enter');
      await expect(chat.getByText(/Resuming our session/)).toBeVisible({ timeout: 30_000 });
      const approvals = page.getByTestId('agent-approvals');
      await expect(approvals).toContainText('Claude Code');
      await expect(approvals).toContainText('Bash');
      await expect(approvals).toContainText('echo hello from claude code');
      // The whole request is readable before answering, not just a one-liner.
      await approvals.getByRole('button', { name: 'Review the full request' }).click();
      await expect(page.getByTestId('agent-approval-review')).toContainText(
        'command:\necho hello from claude code',
      );
      await approvals.getByRole('button', { name: 'Hide the full request' }).click();
      await expect(page.getByTestId('agent-approval-review')).toHaveCount(0);
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
      // Red means the producer said so (is_error), never that the result body
      // mentioned an error: the declined run is red, the allowed one is not.
      await expect(chat.locator('[data-testid="tool-call"][data-error="true"]')).toHaveCount(1);
      await expect(
        chat.locator('[data-testid="tool-call"][data-error="false"]').first(),
      ).toBeVisible();

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
      const notes = readFileSync(join(folder, 'agent-note.md'), 'utf8');
      expect(notes).toContain('run it again');
    } finally {
      await app.close();
    }
  });
});
