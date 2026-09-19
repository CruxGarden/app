import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';
import { member } from './game-cruxspace-helpers';
import type { AgentPermissionRequest } from '../src/bridge';
import type { ChatMessage } from '../../src/api/types';
type TrialWindow = Window & { __figmaLivePermissions: AgentPermissionRequest[] };

// A completed turn moves into Growth; reading only Main's current segment
// misses its saved reply. This trial has a single branch.
async function recordedMessages(page: Page, id: string): Promise<ChatMessage[]> {
  return page.evaluate(async (owner) => {
    const rows = (await window.electronAPI!.sqlite.all(
      "SELECT c.meta FROM dimensions d JOIN cruxes c ON c.id = d.target_id WHERE d.source_id = ? AND d.type = 'growth' ORDER BY d.weight, d.created",
      [owner],
    )) as { meta: string }[];
    const current = (await window.electronAPI!.sqlite.get('SELECT meta FROM cruxes WHERE id = ?', [
      owner,
    ])) as { meta: string };
    return [...rows, current].flatMap((row) => JSON.parse(row.meta).messages ?? []);
  }, id);
}

// Opt-in, real paid agent trial. Approval requests are reviewed externally and
// answered through the visible Garden banner; this harness never auto-allows.
test('live Figma access through the Garden Claude Code provider', async () => {
  test.skip(process.env.CRUX_FIGMA_AGENT_TRIAL !== '1', 'Explicit live trial only');
  test.setTimeout(12 * 60_000);
  const control = process.env.CRUX_FIGMA_AGENT_CONTROL!;
  expect(control).toBeTruthy();
  mkdirSync(control, { recursive: true });
  const resumeFile = process.env.CRUX_FIGMA_AGENT_RESUME;
  const previous = resumeFile ? JSON.parse(readFileSync(resumeFile, 'utf8')) : null;
  const instance = await launchApp(previous ? { dir: previous.dir } : {});
  const { page } = instance;
  try {
    await page.setViewportSize({ width: 1600, height: 1100 });
    if (!previous) await enterGarden(page);
    else {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.goto(new URL(`/c/${previous.id}`, page.url()).toString());
    }
    const design = previous ?? (await member(page, /^Figma/, 'Figma live collaborator'));
    if (previous) {
      await expect(page.locator('[data-workspace-id]')).toBeVisible();
      writeFileSync(
        join(control, 'prior-messages.json'),
        JSON.stringify(await recordedMessages(page, design.id), null, 2),
      );
    }
    writeFileSync(
      join(control, 'workspace.json'),
      JSON.stringify({ ...design, dir: instance.dir }),
    );
    if (!previous)
      writeFileSync(
        join(design.folder, 'garden-stamp.svg'),
        '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="100"><rect width="360" height="100" rx="16" fill="#6548a3"/><text x="32" y="62" font-family="sans-serif" font-size="28" fill="white">Made together</text></svg>',
      );
    const companion = page.getByTestId('figma-companion');
    if (!(await companion.isVisible()))
      await page.getByRole('button', { name: 'Clean', exact: true }).click();
    if (!previous) {
      await companion
        .getByLabel('Figma file or frame link')
        .fill('https://www.figma.com/design/1UGF8VTtWSz0D3pjGvOWwf?node-id=5-2');
      await companion.getByRole('button', { name: 'Save link', exact: true }).click();
      await expect(companion.getByRole('status')).toHaveText('Figma link saved.');
    }
    await page.evaluate(() => {
      const state = window as TrialWindow;
      state.__figmaLivePermissions = [];
      window.electronAPI!.agent.onPermission((request) =>
        state.__figmaLivePermissions.push(request),
      );
    });
    const chat = page.getByTestId('pane-body-collaboration');
    if (!previous) {
      await chat.getByTestId('model-selector').click();
      await page
        .getByTestId('model-group-claude-code')
        .getByRole('button', { name: 'Claude Code', exact: true })
        .click();
    }
    const inspectOnly = process.env.CRUX_FIGMA_AGENT_INSPECT === '1';
    const before = inspectOnly ? 0 : (await recordedMessages(page, design.id)).length;
    if (!inspectOnly) {
      await page
        .getByPlaceholder('Send a message...')
        .fill(readFileSync(join(control, 'prompt.txt'), 'utf8'));
      await page.getByPlaceholder('Send a message...').press('Enter');
    }
    const answered = new Set<string>();
    const deadline = Date.now() + 10 * 60_000;
    let completed = false;
    while (Date.now() < deadline) {
      const permissions = await page.evaluate(() => (window as TrialWindow).__figmaLivePermissions);
      writeFileSync(join(control, 'permissions.json'), JSON.stringify(permissions, null, 2));
      for (const request of permissions) {
        if (answered.has(request.requestId)) continue;
        const decisionPath = join(
          control,
          request.requestId.replace(/[^a-zA-Z0-9-]/g, '_') + '.decision',
        );
        if (!existsSync(decisionPath)) continue;
        const choice = readFileSync(decisionPath, 'utf8').trim();
        if (!['allow', 'deny'].includes(choice)) throw new Error('Invalid review decision');
        const banner = page
          .getByTestId('agent-approvals')
          .getByRole('alert')
          .filter({ hasText: request.toolName })
          .filter({ has: page.getByTitle(request.summary, { exact: true }) })
          .first();
        // The person can answer directly while the test is reviewing the request.
        if (!(await banner.count())) {
          answered.add(request.requestId);
          continue;
        }
        await banner
          .getByRole('button', { name: choice === 'allow' ? 'Allow' : 'Not now', exact: true })
          .click({ timeout: 1500 })
          .catch(async (error) => {
            if (await banner.count()) throw error;
          });
        answered.add(request.requestId);
      }
      const messages = (await recordedMessages(page, design.id)).slice(before);
      writeFileSync(join(control, 'messages.json'), JSON.stringify(messages, null, 2));
      if (
        messages.some(
          (message) =>
            message.role === 'assistant' && message.model === 'claude-code' && message.content,
        ) &&
        !(await page.getByRole('button', { name: 'Stop', exact: true }).count())
      ) {
        completed = true;
        break;
      }
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: join(control, 'garden-agent.png'), fullPage: true });
    expect(completed).toBe(true);
    const replies = (await recordedMessages(page, design.id))
      .slice(before)
      .filter((m) => m.role === 'assistant');
    expect(replies.some((m) => m.model === 'claude-code')).toBe(true);
    expect(
      replies.some((m) => m.job?.status === 'failed'),
      'The real agent reported a failed turn',
    ).toBe(false);
    if (inspectOnly) {
      const receipt = JSON.parse(readFileSync(join(design.folder, 'roundtrip.json'), 'utf8'));
      const hash = createHash('sha256')
        .update(readFileSync(join(design.folder, 'figma-output.png')))
        .digest('hex');
      expect(receipt.preservedEventText).toBe('EDITED · 10 AM\nThe community garden');
      expect(receipt.transfers.download.sha256).toBe(hash);
      const copies = await page.evaluate(async (owner) => {
        return window.electronAPI!.sqlite.all(
          "SELECT a.resource_id, a.fingerprint FROM artifacts a WHERE json_extract(a.meta, '$.path') = 'figma-output.png' AND (a.resource_id = ? OR a.resource_id IN (SELECT target_id FROM dimensions WHERE source_id = ? AND type = 'growth'))",
          [owner, owner],
        ) as Promise<{ resource_id: string; fingerprint: string }[]>;
      }, design.id);
      expect(copies.some((c) => c.resource_id === design.id && c.fingerprint === hash)).toBe(true);
      expect(copies.some((c) => c.resource_id !== design.id && c.fingerprint === hash)).toBe(true);
      expect(
        replies.some((m) =>
          m.toolCalls?.some(
            (c) => c.name.endsWith('__use_figma') && c.result?.includes('"mutatedNodeIds"'),
          ),
        ),
      ).toBe(true);
      writeFileSync(
        join(control, 'preservation.json'),
        JSON.stringify({ sha256: hash, copies, recordedAfterRestart: true }, null, 2),
      );
      if (!(await page.getByTestId('pane-body-artifacts').isVisible())) {
        await page.getByRole('button', { name: 'Toggle artifacts', exact: true }).click();
      }
      await page.getByRole('tree').getByText('figma-output.png', { exact: true }).click();
      await expect(page.getByRole('img', { name: 'figma-output.png', exact: true })).toBeVisible();
      await page.screenshot({ path: join(control, 'garden-agent.png'), fullPage: true });
    }
  } finally {
    await instance.app.close();
  }
});
