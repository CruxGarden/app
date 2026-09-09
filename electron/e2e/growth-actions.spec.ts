import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { launchApp } from './launch';

/**
 * Growth actions in the History pane, each proven on a visible outcome:
 *
 *   label a snapshot → the card carries the label
 *   auto-snapshot frequency → the select changes and survives re-opening the crux
 *   view an earlier snapshot → read-only banner, "Viewing" badge, the editor shows
 *     the old content, the Project Folder is untouched; Back (banner) and
 *     "Back to current" (pane) both return to the working files
 *   Remove last snapshot → the tip leaves history, files stay
 *   Revert → editor, disk and history agree; "Before revert" is recorded
 *   Branch → the only product path is an agent (the pane offers no Branch
 *     control — see the note in the final report); over the crux's MCP server
 *     the files come back to the branch point and "Before branch" is recorded
 *   re-open the crux → every label and the frequency are still there
 */

/** Open a pane if it is closed; never toggle an open one shut. */
async function ensurePane(page: Page, type: string, toggle: string) {
  const body = page.getByTestId(`pane-body-${type}`);
  if (!(await body.isVisible().catch(() => false)))
    await page.getByRole('button', { name: toggle }).click();
  await expect(body).toBeVisible({ timeout: 30_000 });
}

const textOf = (result: unknown): string => {
  const r = result as { content: Array<{ type: string; text?: string }> };
  return r.content.map((c) => c.text ?? '').join('\n');
};

test.describe('growth actions (History pane)', () => {
  test.setTimeout(150_000);

  test('label, frequency, view/back, remove last, revert, branch (agent), and reopen', async () => {
    const { app, page, dir } = await launchApp();
    const gardenRoot = join(dir, 'garden');
    const folder = () => join(gardenRoot, readdirSync(gardenRoot)[0]!);
    // null while the file is absent so expect.poll keeps retrying instead of throwing
    const fileOnDisk = (): string | null => {
      try {
        return readFileSync(join(folder(), 'note.txt'), 'utf8');
      } catch {
        return null;
      }
    };
    let client: Client | null = null;

    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();

      // ── a file with content, saved ──
      await page.getByRole('button', { name: 'New file' }).click({ timeout: 30_000 });
      const nameInput = page.getByRole('tree').getByRole('textbox');
      await nameInput.fill('note.txt');
      await nameInput.press('Enter');
      const monaco = page.locator('.monaco-editor').first();
      await expect(monaco).toBeVisible({ timeout: 30_000 });
      await monaco.click();
      await page.keyboard.type('one');
      await page.keyboard.press('ControlOrMeta+s');
      await expect.poll(fileOnDisk).toBe('one');

      await ensurePane(page, 'history', 'Toggle history');
      const history = page.getByTestId('pane-body-history');
      const takeSnapshot = history.getByRole('button', { name: 'Take snapshot' });
      const removeLatest = page.getByTestId('growth-remove-latest');
      const banner = page.getByText(/^Viewing snapshot \d+ of \d+$/);
      const badge = (n: number) => history.getByText(`#${n}`, { exact: true });

      // Empty state: nothing to remove yet
      await expect(history.getByText('No snapshots yet')).toBeVisible();
      await expect(removeLatest).toHaveCount(0);

      // ── auto-snapshot frequency: default, change, read back ──
      const frequency = history.getByRole('combobox');
      await expect(frequency).toHaveValue('ai-turn');
      await frequency.selectOption('manual');
      await expect(frequency).toHaveValue('manual');

      // ── label a snapshot ──
      const snapshotWithLabel = async (label: string) => {
        await takeSnapshot.click();
        const input = history.getByPlaceholder('Label (optional)');
        await input.fill(label);
        await input.press('Enter');
        await expect(history.getByText(label, { exact: true })).toBeVisible({ timeout: 30_000 });
      };
      await snapshotWithLabel('v1');
      await expect(badge(1)).toBeVisible();
      await expect(removeLatest).toBeVisible();

      // ── second version ──
      await monaco.click();
      await page.keyboard.press('ControlOrMeta+End');
      await page.keyboard.type(' two');
      await page.keyboard.press('ControlOrMeta+s');
      await expect.poll(fileOnDisk).toBe('one two');
      await snapshotWithLabel('v2');
      await expect(badge(2)).toBeVisible();
      await page.screenshot({ path: 'e2e/.results/growth-actions-1-two-snapshots.png' });

      // ── view v1: read-only banner, editor shows the old content, disk untouched ──
      const card = (label: string) =>
        history.getByRole('button').filter({ hasText: label }).first();
      await card('v1').click();
      await expect(banner).toHaveText('Viewing snapshot 1 of 2');
      await expect(page.getByText('read-only', { exact: true })).toBeVisible();
      await expect(history.getByText('Viewing', { exact: true })).toBeVisible();
      await expect(history.getByRole('button', { name: 'Back to current' })).toBeVisible();
      // capture controls are hidden while viewing
      await expect(takeSnapshot).toHaveCount(0);
      await expect(removeLatest).toHaveCount(0);
      await expect(monaco).toContainText('one', { timeout: 30_000 });
      await expect(monaco).not.toContainText('two');
      expect(fileOnDisk()).toBe('one two');
      await page.screenshot({ path: 'e2e/.results/growth-actions-2-viewing.png' });

      // Back (banner) → working files
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await expect(banner).toHaveCount(0);
      await expect(monaco).toContainText('one two', { timeout: 30_000 });
      await expect(takeSnapshot).toBeVisible();

      // View again → "Back to current" (pane) → working files
      await card('v1').click();
      await expect(banner).toHaveText('Viewing snapshot 1 of 2');
      await expect(monaco).not.toContainText('two', { timeout: 30_000 });
      await history.getByRole('button', { name: 'Back to current' }).click();
      await expect(banner).toHaveCount(0);
      await expect(monaco).toContainText('one two', { timeout: 30_000 });

      // ── Remove last snapshot: v2 leaves, v1 stays, the file is untouched ──
      await removeLatest.click();
      const removeDialog = page.getByRole('dialog');
      await expect(removeDialog).toContainText(/Remove "v2"/);
      await removeDialog.getByRole('button', { name: 'Remove' }).click();
      await expect(history.getByText('v2', { exact: true })).toHaveCount(0);
      await expect(badge(2)).toHaveCount(0);
      await expect(history.getByText('v1', { exact: true })).toBeVisible();
      await expect(monaco).toContainText('one two');
      expect(fileOnDisk()).toBe('one two');
      // …and take it again so the rest of the journey has its v2
      await snapshotWithLabel('v2');
      await expect(badge(2)).toBeVisible();

      // ── Revert to v1: editor, disk and history agree; safety snapshot recorded ──
      await card('v1').click();
      await expect(banner).toHaveText('Viewing snapshot 1 of 2');
      await page.getByRole('button', { name: 'Revert', exact: true }).click();
      const revertDialog = page.getByRole('dialog');
      await expect(revertDialog).toContainText(/Revert workspace/);
      await revertDialog.getByRole('button', { name: 'Revert' }).click();
      await expect(banner).toHaveCount(0, { timeout: 30_000 });
      await expect.poll(fileOnDisk).toBe('one');
      await expect(history.getByText('Before revert', { exact: true })).toBeVisible();
      await expect(badge(3)).toBeVisible();
      await page.screenshot({ path: 'e2e/.results/growth-actions-3-reverted.png' });
      // Known gap: revert/branch give every file a new artifact id and the open
      // editor tabs are not re-bound by path, so the Workshop is blank until the
      // file is picked again from the tree. Re-open it the way a person would.
      const tree = page.getByRole('tree');
      await tree.getByText('note.txt', { exact: true }).click();
      await expect(monaco).toContainText('one', { timeout: 30_000 });
      await expect(monaco).not.toContainText('two');

      // ── Branch from v2, over the crux's MCP server (Settings → Agents) ──
      await page.keyboard.press('ControlOrMeta+,');
      const agents = page.getByTestId('agents-settings');
      await expect(agents.getByRole('heading', { name: 'Agents' })).toBeVisible();
      await agents.getByRole('switch').first().click();
      await expect(agents.getByTestId('agents-connect')).toBeVisible({ timeout: 30_000 });
      const configPath = () => join(folder(), '.crux', 'mcp.json');
      await expect.poll(() => existsSync(configPath())).toBe(true);
      const config = JSON.parse(readFileSync(configPath(), 'utf8')) as {
        url: string;
        token: string;
      };
      await page.keyboard.press('Escape');
      await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCount(0);

      client = new Client({ name: 'e2e-brancher', version: '1.0.0' });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(config.url), {
          requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
        }),
      );
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(['branch', 'restore']));

      const branched = await client.callTool(
        { name: 'branch', arguments: { snapshotId: '#2', label: 'Try two again' } },
        undefined,
        { timeout: 60_000 },
      );
      const report = textOf(branched);
      expect(report).not.toMatch(/^Error/);
      expect(report).toContain('Before branch');

      // Files are back at v2, the safety snapshot is in history, the transcript says so
      await expect.poll(fileOnDisk, { timeout: 30_000 }).toBe('one two');
      await expect(history.getByText('Before branch', { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await expect(badge(4)).toBeVisible();
      await expect(page.getByText(/Branching from snapshot "Try two again"/).first()).toBeVisible();
      await tree.getByText('note.txt', { exact: true }).click();
      await expect(monaco).toContainText('one two', { timeout: 30_000 });
      await page.screenshot({ path: 'e2e/.results/growth-actions-4-branched.png' });

      // ── Re-open the crux: labels and the frequency setting are persisted ──
      await page.getByRole('banner').getByRole('button').first().click();
      await expect(page.getByText('Home Garden', { exact: true })).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: /^Open My Crux/ }).click();
      await expect(page.getByRole('tree')).toBeVisible({ timeout: 30_000 });
      await ensurePane(page, 'history', 'Toggle history');
      await expect(history.getByRole('combobox')).toHaveValue('manual');
      for (const label of ['v1', 'v2', 'Before revert', 'Before branch'])
        await expect(history.getByText(label, { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(badge(4)).toBeVisible();
      expect(fileOnDisk()).toBe('one two');
    } finally {
      await client?.close().catch(() => {});
      await app.close();
    }
  });
});
