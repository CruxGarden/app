import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';
import { member } from './game-cruxspace-helpers';
import type { AgentPermissionRequest } from '../src/bridge';
import type { ChatMessage } from '../../src/api/types';
type TrialWindow = Window & { __blenderLivePermissions: AgentPermissionRequest[] };

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
test('live Blender access through the Garden Claude Code provider', async () => {
  test.skip(process.env.CRUX_BLENDER_AGENT_TRIAL !== '1', 'Explicit live trial only');
  test.setTimeout(12 * 60_000);
  const control = process.env.CRUX_BLENDER_AGENT_CONTROL!;
  expect(control).toBeTruthy();
  mkdirSync(control, { recursive: true });
  const resumeFile = process.env.CRUX_BLENDER_AGENT_RESUME;
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
    const design = previous ?? (await member(page, /^Blender/, 'Blender live collaborator'));
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
    if (!previous) {
      execFileSync(
        '/Users/daniel/.local/bin/claude',
        [
          'mcp',
          'add',
          'crux-blender-poc',
          '--scope',
          'project',
          '--env',
          'BLENDER_HOST=127.0.0.1',
          '--env',
          'BLENDER_PORT=9877',
          '--env',
          'BLENDER_MCP_DISABLE_TELEMETRY=1',
          '--env',
          'BLENDER_MCP_SAFE_MODE=1',
          '--',
          process.env.CRUX_BLENDER_MCP_BIN!,
        ],
        { cwd: design.folder, stdio: 'pipe' },
      );
    }
    if (!previous) {
      mkdirSync(join(design.folder, '.claude'), { recursive: true });
      writeFileSync(
        join(design.folder, '.claude/settings.json'),
        JSON.stringify({ enabledMcpjsonServers: ['crux-blender-poc'] }),
      );
    }
    const companion = page.getByTestId('blender-companion');
    if (!(await companion.isVisible()))
      await page.getByRole('button', { name: 'Clean', exact: true }).click();
    await page.evaluate(() => {
      const state = window as TrialWindow;
      state.__blenderLivePermissions = [];
      window.electronAPI!.agent.onPermission((request) =>
        state.__blenderLivePermissions.push(request),
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
    const inspectOnly = process.env.CRUX_BLENDER_AGENT_INSPECT === '1';
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
      const permissions = await page.evaluate(
        () => (window as TrialWindow).__blenderLivePermissions,
      );
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
    for (const name of ['scene.blend', 'sprout.png', 'sprout.glb'])
      expect(existsSync(join(design.folder, name)), `Missing real native output: ${name}`).toBe(
        true,
      );
    const replies = (await recordedMessages(page, design.id))
      .slice(before)
      .filter((m) => m.role === 'assistant');
    expect(replies.some((m) => m.model === 'claude-code')).toBe(true);
    if (!inspectOnly)
      expect(
        replies.some((m) => m.job?.status === 'failed'),
        'The real agent reported a failed turn',
      ).toBe(false);
    if (inspectOnly) {
      const preserved = [];
      for (const path of ['scene.blend', 'sprout.png', 'sprout.glb']) {
        const hash = createHash('sha256')
          .update(readFileSync(join(design.folder, path)))
          .digest('hex');
        const copies = await page.evaluate(
          async ({ owner, path }) => {
            return window.electronAPI!.sqlite.all(
              "SELECT a.resource_id, a.fingerprint FROM artifacts a WHERE json_extract(a.meta, '$.path') = ? AND (a.resource_id = ? OR a.resource_id IN (SELECT target_id FROM dimensions WHERE source_id = ? AND type = 'growth'))",
              [path, owner, owner],
            ) as Promise<{ resource_id: string; fingerprint: string }[]>;
          },
          { owner: design.id, path },
        );
        expect(copies.some((c) => c.resource_id === design.id && c.fingerprint === hash)).toBe(
          true,
        );
        expect(copies.some((c) => c.resource_id !== design.id && c.fingerprint === hash)).toBe(
          true,
        );
        preserved.push({ path, hash, copies });
      }
      expect(
        replies.some((m) =>
          m.toolCalls?.some(
            (c) => c.name.endsWith('__export_scene') && c.result?.includes('GardenPot'),
          ),
        ),
      ).toBe(true);
      writeFileSync(
        join(control, 'preservation.json'),
        JSON.stringify({ recordedAfterRestart: true, preserved }, null, 2),
      );
    }
  } finally {
    await instance.app.close();
  }
});
