import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { launchApp } from './launch';
import { addArtifact, createCrux, enterGarden, storedCrux } from './multi-crux-helpers';
import { enableAdvancedMode, togglePanel } from './panel-helpers';

// Real editor, actual local API, disk projection, shared outside-agent controls and restart.
test('edit recovery preserves files and conversation without growing the deliberate version graph', async () => {
  test.setTimeout(120_000);
  let launch = await launchApp();
  let client: Client | undefined;
  try {
    const { page, dir } = launch;
    await enterGarden(page);
    await enableAdvancedMode(page);
    const id = await createCrux(page, 'Rough mix');
    const meta = await storedCrux(page, id);
    await addArtifact(page, 'note.txt');
    const editor = page.locator('.monaco-editor').first();
    const disk = () => readFileSync(join(meta.projectFolder, 'note.txt'), 'utf8');
    const save = async (text: string) => {
      await editor.click();
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.type(text);
      await page.keyboard.press('ControlOrMeta+s');
      await expect.poll(disk).toBe(text);
    };
    await save('dream');
    await page.keyboard.press('ControlOrMeta+,');
    await page.getByRole('switch', { name: 'Agent access for Rough mix', exact: true }).click();
    const configPath = join(meta.projectFolder, '.crux', 'mcp.json');
    await expect
      .poll(() => {
        try {
          return JSON.parse(readFileSync(configPath, 'utf8')).url;
        } catch {
          return '';
        }
      })
      .toBeTruthy();
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as { url: string; token: string };
    await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
    client = new Client({ name: 'history-tester', version: '1.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
      }),
    );
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await client!.callTool({ name, arguments: args });
      const text = (result.content as { text?: string }[]).map((x) => x.text ?? '').join('\n');
      expect(text).not.toMatch(/^Error/);
      return text;
    };
    await call('edit_history', { action: 'capture' });
    const first = JSON.parse(await call('edit_history', { action: 'list' })).checkpoints.at(-1);
    await save('master');
    await togglePanel(page, 'Toggle growth');
    const history = page.getByTestId('pane-body-history');
    await expect(history.getByText('No snapshots yet')).toBeVisible();
    await history.getByRole('button', { name: 'Mark version', exact: true }).click();
    await history.getByPlaceholder('Label (optional)').fill('Master');
    await history.getByPlaceholder('Label (optional)').press('Enter');
    await expect(history.getByText('Master', { exact: true })).toBeVisible();
    await call('list_files', {});
    const before = await storedCrux(page, id);
    expect(before.messages.length).toBeGreaterThan(0);
    await history.getByRole('button', { name: 'Edits', exact: true }).click();
    const recovery = history.locator(`[data-checkpoint-id="${first.id}"]`);
    await recovery.getByRole('button', { name: /Inspect recovery/ }).click();
    await expect(recovery.getByText('note.txt', { exact: true })).toBeVisible();
    // Atomic refusal leaves the current files and recovery ring unchanged.
    await page.evaluate(() =>
      window.electronAPI!.sqlite.run(
        "CREATE TRIGGER refuse_restore BEFORE UPDATE ON file_content_heads BEGIN SELECT RAISE(ABORT, 'restore refused'); END",
      ),
    );
    await recovery.getByRole('button', { name: /Restore recovery/ }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Restore files', exact: true })
      .click();
    await expect(history.getByRole('alert')).toContainText('restore refused');
    expect(disk()).toBe('master');
    await page.evaluate(() => window.electronAPI!.sqlite.run('DROP TRIGGER refuse_restore'));
    await recovery.getByRole('button', { name: /Restore recovery/ }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Restore files', exact: true })
      .click();
    await expect(history.getByRole('status')).toContainText('Files restored');
    await expect.poll(disk).toBe('dream');
    await expect(editor).toContainText('dream');
    expect((await storedCrux(page, id)).messages).toEqual(before.messages);
    const safety = JSON.parse(await call('edit_history', { action: 'list' })).checkpoints.find(
      (p: { reason: string }) => p.reason === 'safety',
    );
    expect(safety).toBeTruthy();
    await call('edit_history', { action: 'restore', checkpointId: safety.id });
    await expect.poll(disk).toBe('master');
    await expect(editor).toContainText('master');
    expect(
      JSON.parse(await call('edit_history', { action: 'capture', reason: 'safety' })).reason,
    ).toBe('safety');
    await history.getByRole('button', { name: 'Versions', exact: true }).click();
    await expect(history.getByText('Master', { exact: true })).toBeVisible();
    const growth = () =>
      page.evaluate(
        (id) =>
          window.electronAPI!.sqlite.all(
            "SELECT id FROM dimensions WHERE source_id = ? AND type = 'growth'",
            [id],
          ),
        id,
      );
    expect(await growth()).toHaveLength(1);
    await expect(page.getByText('Could not load this Artifact.', { exact: true })).toHaveCount(0);
    await history.getByRole('button', { name: 'Edits', exact: true }).click();
    await page.screenshot({ path: 'e2e/.results/edit-history.png' });
    await client.close();
    client = undefined;
    await launch.app.close();
    launch = await launchApp({ dir });
    await launch.page.getByRole('button', { name: /enter/i }).click();
    await launch.page.getByRole('button', { name: 'Open Rough mix', exact: true }).click();
    await expect(launch.page.locator('[data-workspace-id]')).toBeVisible();
    const reopened = launch.page.getByTestId('pane-body-history');
    if (!(await reopened.isVisible())) await togglePanel(launch.page, 'Toggle growth');
    await reopened.getByRole('button', { name: 'Edits', exact: true }).click();
    await expect(reopened.getByText('Safety copy').first()).toBeVisible();
    expect(disk()).toBe('master');
  } finally {
    await client?.close().catch(() => {});
    await launch.app.close();
  }
});

test('planned built-in agent edits advance steps and retain recovery without automatic Growth', async () => {
  test.setTimeout(90_000);
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  try {
    await enterGarden(page);
    await enableAdvancedMode(page);
    const id = await createCrux(page, 'Three steps');
    const input = page.getByPlaceholder('Send a message...');
    await input.fill('Please build it in three steps');
    await input.press('Enter');
    await expect(page.getByTestId('plan-step').nth(0)).toHaveAttribute('data-status', 'done');
    await expect(page.getByTestId('plan-step').nth(1)).toHaveAttribute('data-status', 'running');
    await expect(page.getByText('Done — all three steps are in.')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('turn-summary')).toHaveText('Ran 3 steps');
    const meta = await storedCrux(page, id);
    for (const n of [1, 2, 3])
      expect(readFileSync(join(meta.projectFolder, `step-${n}.txt`), 'utf8')).toBe(`step ${n}\n`);
    await togglePanel(page, 'Toggle growth');
    const history = page.getByTestId('pane-body-history');
    await expect(history.getByText('No snapshots yet')).toBeVisible();
    await history.getByRole('button', { name: 'Edits', exact: true }).click();
    await expect(history.locator('[data-checkpoint-id]').first()).toBeVisible();
    expect(
      await page.evaluate(
        (id) =>
          window.electronAPI!.sqlite.all(
            "SELECT id FROM dimensions WHERE source_id=? AND type='growth'",
            [id],
          ),
        id,
      ),
    ).toEqual([]);
  } finally {
    await app.close();
  }
});
