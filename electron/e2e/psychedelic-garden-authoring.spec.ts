import { test, expect } from '@playwright/test';
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';
import { member, exportCruxspacePackage } from './game-cruxspace-helpers';
import type { AgentPermissionRequest } from '../src/bridge';

// Opt-in authoring session, not a scripted AI acceptance test. The retained
// Garden and its ordinary MCP transcripts are the actual creative project.
// Commands are selected by the external Codex collaborator as work progresses.
test.use({ trace: 'off', screenshot: 'off' });
test('author the persistent Psychedelic Garden through its real tools', async () => {
  test.skip(process.env.CRUX_PSYCHEDELIC_AUTHOR !== '1', 'Explicit authoring session only');
  test.setTimeout(60 * 60_000);
  const control = process.env.CRUX_PSYCHEDELIC_CONTROL!;
  const dir = process.env.CRUX_PSYCHEDELIC_PROFILE!;
  expect(control).toBeTruthy();
  expect(dir).toBeTruthy();
  mkdirSync(control, { recursive: true });
  mkdirSync(dir, { recursive: true });
  const manifestPath = join(control, 'workspace.json');
  const state = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, 'utf8'))
    : { dir, members: {}, collectionCreated: false };
  const persist = () => writeFileSync(manifestPath, JSON.stringify(state, null, 2));
  const { app, page } = await launchApp({ dir });
  const clients = new Map<string, Client>();
  const goHome = async () => {
    const create = page.getByRole('button', { name: 'Create Cruxspace', exact: true });
    for (let attempt = 0; attempt < 4; attempt++) {
      if (await create.isVisible()) return;
      await page.locator('header').getByRole('button').first().click();
      if (
        await create.waitFor({ state: 'visible', timeout: 5000 }).then(
          () => true,
          () => false,
        )
      )
        return;
    }
    await expect(create).toBeVisible();
  };
  try {
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1050 });
    if (Object.keys(state.members).length) {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.goto(
        new URL(
          '/c/' + Object.values(state.members as Record<string, { id: string }>)[0].id,
          page.url(),
        ).toString(),
      );
      await expect(page.locator('[data-workspace-id]')).toBeVisible();
      await goHome();
    } else await enterGarden(page);
    const specs: [string, RegExp, string][] = [
      ['notes', /^Notes/, 'Garden — Creative journal'],
      ['plan', /^Kan\s/, 'Garden — Making the garden'],
      ['model', /^Blender/, 'Garden — Fractal bloom'],
      ['design', /^Figma/, 'Garden — Graphic language'],
      ['mosh', /^OpenMosh/, 'Garden — Living textures'],
      ['recordings', /^AudioMass/, 'Garden — AM-1 recordings'],
      ['world', /^GDevelop/, 'Garden — Walkable space'],
      ['site', /^Empty \(Astro\)/, 'Garden — Homepage'],
    ];
    for (const [key, menu, title] of specs) {
      if (state.members[key]) continue;
      console.log('Creating member:', key);
      await goHome();
      state.members[key] = await member(page, menu, title, 240000);
      await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
        title,
      );
      persist();
    }
    await goHome();
    if (!state.collectionCreated || state.membershipVersion !== 3) {
      if (state.collectionCreated) {
        await page
          .getByRole('combobox', { name: 'Cruxspace', exact: true })
          .selectOption({ label: 'Psychedelic Garden' });
        await page.getByRole('button', { name: 'Edit Cruxspace', exact: true }).click();
      } else await page.getByRole('button', { name: 'Create Cruxspace', exact: true }).click();
      await page.getByLabel('Cruxspace name').fill('Psychedelic Garden');
      await page
        .getByLabel('Shared brief')
        .fill(
          'Make Lava Flower: one compact dark garden setting solely for a flower interaction, matching the Digital Fractal Garden Mood. Approach the simple organic/digital bloom and transition into close first-person interaction. Its movement is slow, viscous and buoyant, as if floating in water: pull, distort, release and gradually relax. No wider world or additional exhibits. Layer native Blender sculpture, restrained Figma identity/interface graphics, Mosh background motion and Daniel’s AM-1 recordings, delivered through Astro. Finish the editable Cruxspace and its actual history first; make a video afterward. Keep both recordings as candidates; preserve originals. Preserve actual creative decisions, editable sources, revisions, transfers and Growth. Earlier concepts are imported references; no invented history. Daniel and the collaborator both shape the work.',
        );
      for (const [key, entry] of Object.entries(state.members) as [string, { title: string }][]) {
        const checkbox = page.getByRole('checkbox', { name: entry.title, exact: true });
        if (key === 'music')
          await checkbox.uncheck(); // Empty provisional BeepBox member stays in the Garden.
        else await checkbox.check();
      }
      await page.getByRole('button', { name: 'Save Cruxspace', exact: true }).click();
      state.collectionCreated = true;
      state.membershipVersion = 3;
      persist();
    }
    await page.keyboard.press('ControlOrMeta+,');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    for (const entry of Object.values(state.members) as { title: string }[]) {
      const toggle = page.getByRole('switch', {
        name: `Agent access for ${entry.title}`,
        exact: true,
      });
      if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'true');
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeHidden();
    writeFileSync(join(control, 'ready.json'), JSON.stringify({ ready: true, dir }));
    console.log('Authoring workspace ready');
    const activated = new Set<string>();
    const deadline = Date.now() + 50 * 60_000;
    while (Date.now() < deadline && !existsSync(join(control, 'stop'))) {
      const pending = readdirSync(control)
        .filter(
          (file) =>
            file.endsWith('.request.json') &&
            !existsSync(join(control, file.replace('.request.json', '.result.json'))),
        )
        .sort();
      for (const file of pending) {
        const request = JSON.parse(readFileSync(join(control, file), 'utf8'));
        const resultPath = join(control, file.replace('.request.json', '.result.json'));
        try {
          if (request.action === 'export') {
            await exportCruxspacePackage(page, app, 'Psychedelic Garden', resolve(request.path));
            writeFileSync(resultPath, JSON.stringify({ exported: request.path }));
            continue;
          }
          const entry = state.members[request.member];
          if (!entry) throw new Error('Unknown member');
          if (!page.url().includes('/c/' + entry.id)) {
            await page.goto(new URL('/c/' + entry.id, page.url()).toString());
          }
          await expect(page.locator('[data-workspace-id]')).toHaveAttribute(
            'data-workspace-id',
            entry.id,
          );
          if (['notes', 'plan', 'mosh', 'music', 'recordings', 'world'].includes(request.member)) {
            const toggle = page.getByRole('button', { name: 'Toggle workshop' });
            if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
            await expect(
              page.frameLocator('iframe[data-crux-id]').locator('#garden-project [role=status]'),
            ).toHaveText(/Saved/, { timeout: 180000 });
          }
          if (request.action === 'agent-turn') {
            const chatToggle = page.getByRole('button', { name: 'Toggle collaboration' });
            if ((await chatToggle.getAttribute('aria-pressed')) !== 'true')
              await chatToggle.click();
            const chat = page.getByTestId('pane-body-collaboration');
            if (!(await chat.getByRole('button', { name: 'Claude Code', exact: true }).count())) {
              await chat.getByTestId('model-selector').click();
              await page
                .getByTestId('model-group-claude-code')
                .getByRole('button', { name: 'Claude Code', exact: true })
                .click();
            }
            await page.evaluate(() => {
              const state = window as Window & { __creativePermissions: AgentPermissionRequest[] };
              state.__creativePermissions = [];
              window.electronAPI!.agent.onPermission((request) =>
                state.__creativePermissions.push(request),
              );
            });
            const messages = () =>
              page.evaluate(async (owner) => {
                const rows = (await window.electronAPI!.sqlite.all(
                  "SELECT meta FROM cruxes WHERE id = ? OR id IN (SELECT target_id FROM dimensions WHERE source_id = ? AND type = 'growth')",
                  [owner, owner],
                )) as { meta: string }[];
                return rows.flatMap((row) => JSON.parse(row.meta).messages ?? []);
              }, entry.id);
            const beforeMessages = new Set(
              (await messages()).map((m: unknown) => JSON.stringify(m)),
            );
            await page.getByPlaceholder('Send a message...').fill(request.prompt);
            await page.getByPlaceholder('Send a message...').press('Enter');
            const answered = new Set<string>();
            const end = Date.now() + 12 * 60_000;
            let completed = false;
            while (Date.now() < end) {
              const permissions = await page.evaluate(
                () =>
                  (window as Window & { __creativePermissions: AgentPermissionRequest[] })
                    .__creativePermissions,
              );
              writeFileSync(
                join(control, 'agent-permissions.json'),
                JSON.stringify(permissions, null, 2),
              );
              for (const permission of permissions) {
                if (answered.has(permission.requestId)) continue;
                const decision = join(
                  control,
                  permission.requestId.replace(/[^a-zA-Z0-9-]/g, '_') + '.decision',
                );
                if (!existsSync(decision)) continue;
                const choice = readFileSync(decision, 'utf8').trim();
                if (!['allow', 'deny'].includes(choice))
                  throw new Error('Invalid permission decision');
                const banner = page
                  .getByTestId('agent-approvals')
                  .getByRole('alert')
                  .filter({ hasText: permission.toolName })
                  .filter({ has: page.getByTitle(permission.summary, { exact: true }) })
                  .first();
                if (await banner.count())
                  await banner
                    .getByRole('button', {
                      name: choice === 'allow' ? 'Allow' : 'Not now',
                      exact: true,
                    })
                    .click();
                answered.add(permission.requestId);
              }
              const replies = (await messages()).filter(
                (m: unknown) => !beforeMessages.has(JSON.stringify(m)),
              );
              writeFileSync(
                join(control, file.replace('.request.json', '.messages.json')),
                JSON.stringify(replies, null, 2),
              );
              if (
                replies.some(
                  (m: { role: string; model?: string; content?: string }) =>
                    m.role === 'assistant' && m.model === 'claude-code' && m.content,
                ) &&
                !(await page.getByRole('button', { name: 'Stop', exact: true }).count())
              ) {
                completed = true;
                break;
              }
              await page.waitForTimeout(500);
            }
            writeFileSync(resultPath, JSON.stringify({ completed }));
            continue;
          }
          if (request.action === 'reload-native') {
            const f = page.frameLocator('iframe[data-crux-id]');
            await f.getByRole('button', { name: 'Reload saved project', exact: true }).click();
            await expect(f.locator('#garden-project [role=status]')).toHaveText(/Saved/, {
              timeout: 120000,
            });
            writeFileSync(resultPath, JSON.stringify({ reloaded: true }));
            continue;
          }
          if (request.action === 'game-preview') {
            const f = page.frameLocator('iframe[data-crux-id]');
            if (await f.getByRole('button', { name: 'Close game preview', exact: true }).count())
              await f.getByRole('button', { name: 'Close game preview', exact: true }).click();
            await f.locator('#toolbar-preview-button').click();
            await expect(
              f.frameLocator('#garden-game-preview iframe').locator('canvas'),
            ).toBeVisible({ timeout: 60000 });
            const game = page
              .frames()
              .find((frame) => frame.url().includes('/preview/index.html'))!;
            const errors: string[] = [];
            page.on('pageerror', (error) => errors.push(error.message));
            await expect
              .poll(() => game.evaluate(() => Boolean((window as any).__lavaDebug)), {
                timeout: 30000,
              })
              .toBeTruthy();
            await page.waitForTimeout(1500);
            const before = await game.evaluate(() => (window as any).__lavaDebug);
            if (request.gesture) {
              const canvas = game.locator('canvas');
              const box = (await canvas.boundingBox())!;
              await page.mouse.move(
                box.x + box.width * request.gesture.from[0],
                box.y + box.height * request.gesture.from[1],
              );
              await page.mouse.down();
              await page.mouse.move(
                box.x + box.width * request.gesture.to[0],
                box.y + box.height * request.gesture.to[1],
                { steps: 45 },
              );
              await page.waitForTimeout(1200);
              const held = await game.evaluate(() => (window as any).__lavaDebug);
              await page.screenshot({ path: resolve(request.path.replace('.png', '-held.png')) });
              await page.mouse.up();
              await page.waitForTimeout(5000);
              const released = await game.evaluate(() => (window as any).__lavaDebug);
              writeFileSync(
                resultPath,
                JSON.stringify({ before, held, released, errors }, null, 2),
              );
            } else writeFileSync(resultPath, JSON.stringify({ before, errors }, null, 2));
            await page.screenshot({ path: resolve(request.path) });
            continue;
          }
          if (request.action === 'screenshot') {
            await page.screenshot({ path: resolve(request.path) });
            writeFileSync(resultPath, JSON.stringify({ saved: request.path }));
            continue;
          }
          if (request.action === 'save-blender-output') {
            const companion = page.getByTestId('blender-companion');
            await expect(companion).toBeVisible();
            await expect(
              companion
                .getByLabel('Saved Artifact')
                .locator('option')
                .filter({ hasText: request.path }),
            ).toHaveCount(1);
            await companion.getByLabel('Saved Artifact').selectOption({ label: request.path });
            await companion.getByLabel('Output name').fill(request.label);
            await companion.getByRole('button', { name: 'Save output', exact: true }).click();
            await expect(companion.getByRole('status')).toHaveText(
              'Output saved for your Cruxspace.',
            );
            writeFileSync(
              resultPath,
              JSON.stringify({ saved: request.path, label: request.label }),
            );
            continue;
          }
          if (request.action === 'open-note') {
            const frame = page.frameLocator('iframe[data-crux-id]');
            await frame.getByRole('button', { name: request.title, exact: true }).first().click();
            await expect(frame.getByLabel('Note title', { exact: true })).toHaveValue(
              request.title,
            );
            await expect(frame.locator('#garden-project [role=status]')).toHaveText(/Saved/);
            writeFileSync(resultPath, JSON.stringify({ opened: request.title }));
            continue;
          }
          if (request.action === 'create-note') {
            const frame = page.frameLocator('iframe[data-crux-id]');
            await frame.getByRole('button', { name: 'Add Note or Folder', exact: true }).click();
            await frame.getByRole('menuitem', { name: /New Note/ }).click();
            await frame.getByRole('button', { name: 'Untitled', exact: true }).first().click();
            const title = frame.getByLabel('Note title', { exact: true });
            await title.fill(request.title);
            await title.press('Enter');
            await expect(frame.locator('.tiptap').first()).toBeVisible();
            writeFileSync(resultPath, JSON.stringify({ created: request.title }));
            continue;
          }
          if (!activated.has(request.member)) {
            const toggle = page.getByRole('button', { name: 'Toggle workshop' });
            if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
            activated.add(request.member);
          }
          let client = clients.get(request.member);
          if (!client) {
            const config = JSON.parse(readFileSync(join(entry.folder, '.crux/mcp.json'), 'utf8'));
            client = new Client({ name: 'Codex-creative-collaborator', version: '1.0.0' });
            await client.connect(
              new StreamableHTTPClientTransport(new URL(config.url), {
                requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
              }),
            );
            clients.set(request.member, client);
          }
          const result =
            request.action === 'list-tools'
              ? await client.listTools()
              : request.action === 'resource'
                ? await client.readResource({ uri: request.uri })
                : await client.callTool(
                    { name: request.name, arguments: request.arguments ?? {} },
                    undefined,
                    { timeout: 180000 },
                  );
          writeFileSync(resultPath, JSON.stringify(result, null, 2));
        } catch (error) {
          writeFileSync(resultPath, JSON.stringify({ error: (error as Error).message }));
        }
      }
      await page.waitForTimeout(500);
    }
  } finally {
    for (const client of clients.values()) await client.close().catch(() => {});
    await app.close();
  }
});
