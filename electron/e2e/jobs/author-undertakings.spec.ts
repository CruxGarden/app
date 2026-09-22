import { test, expect } from '@playwright/test';
import type { DownloadItem, Event } from 'electron';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import JSZip from 'jszip';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { launchApp } from '../launch';
import { enterGarden } from '../multi-crux-helpers';
import {
  undertakings,
  brief,
  memberTemplate,
  planningFiles,
  projectFiles,
} from '../../../cruxspace-templates/recipes';

const enabled = process.env.CRUX_AUTHOR_UNDERTAKINGS;
test.skip(
  !enabled,
  'CRUX_AUTHOR_UNDERTAKINGS=all or an undertaking id explicitly authors reusable packages',
);
const resultText = (result: unknown) =>
  (result as { content: { text?: string }[] }).content.map((c) => c.text ?? '').join('\n');

test('author portable undertaking starters and actual worked-example Growth through MCP', async () => {
  test.setTimeout(60 * 60_000);
  const { app, page, dir } = await launchApp();
  const destination = resolve(__dirname, '../../../public/cruxspace-templates');
  mkdirSync(destination, { recursive: true });
  const client = new Client({ name: 'crux-garden-example-author', version: '1' });
  try {
    await enterGarden(page);
    await page.keyboard.press('ControlOrMeta+,');
    await page.getByRole('switch', { name: 'Agent access for Whole garden', exact: true }).click();
    const configPath = join(dir, 'userData', 'garden-agent-host', '.crux', 'mcp.json');
    await expect.poll(() => existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    await client.connect(
      new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
      }),
    );
    await page.keyboard.press('Escape');
    async function call(name: string, input: Record<string, unknown>) {
      const result = await client.callTool({ name, arguments: input }, undefined, {
        timeout: 600000,
      });
      const text = resultText(result);
      expect(result.isError, text).not.toBe(true);
      if (/^(Error:|Tool error:)/.test(text)) throw new Error(text);
      return text;
    }
    async function files(id: string, values: Record<string, string>) {
      for (const [path, content] of Object.entries(values)) {
        // The same read-before-write contract as any outside collaborator.
        await call('call_crux_tool', { cruxId: id, name: 'read_file', input: { path } }).catch(
          () => undefined,
        );
        await call('call_crux_tool', { cruxId: id, name: 'write_file', input: { path, content } });
      }
    }
    async function pack(spaceId: string, filename: string) {
      const path = join(destination, filename);
      await app.evaluate(({ session }, path) => {
        const state = globalThis as unknown as { undertakingDownload?: string };
        state.undertakingDownload = undefined;
        const listener = (_event: Event, item: DownloadItem) => {
          if (!item.getFilename().endsWith('.cruxspace')) return;
          session.defaultSession.removeListener('will-download', listener);
          item.setSavePath(path);
          item.once('done', (_event, stateValue) => {
            state.undertakingDownload = stateValue;
          });
        };
        session.defaultSession.on('will-download', listener);
      }, path);
      await call('export_cruxspace', { cruxspaceId: spaceId, runtime: 'included' });
      await expect
        .poll(
          () =>
            app.evaluate(
              () => (globalThis as unknown as { undertakingDownload?: string }).undertakingDownload,
            ),
          { timeout: 180000 },
        )
        .toBe('completed');
      const zip = await JSZip.loadAsync(readFileSync(path));
      const manifest = JSON.parse(await zip.file('cruxspace.json')!.async('text'));
      expect(manifest.members).toHaveLength(2);
      expect(manifest.unavailable).toEqual([]);
      for (const member of manifest.members)
        expect(member.checkpoints.length).toBeGreaterThanOrEqual(
          filename.includes('example') ? 3 : 1,
        );
      console.log(`authored ${filename}: ${readFileSync(path).length} bytes`);
    }
    for (const entry of undertakings.filter(
      (t) => enabled === 'all' || enabled?.split(',').includes(t.id),
    )) {
      const ids: string[] = [];
      for (const [index, title] of entry.members.entries()) {
        const planted = await call('plant_crux', {
          title,
          template: index === 0 ? 'notes' : memberTemplate(entry.id),
          brief: brief(entry),
        });
        ids.push(/id: (\S+)/.exec(planted)![1]);
        if (index === 0 || entry.id === 'short-book') {
          const row = await page.evaluate(
            async (id) =>
              window.electronAPI!.sqlite.get('SELECT kind FROM cruxes WHERE id = ?', [id]),
            ids.at(-1)!,
          );
          expect(row).toMatchObject({ kind: 'notes' });
        }
      }
      const makeSpace = async (name: string) =>
        /id: (\S+)/.exec(
          await call('create_cruxspace', { name, brief: brief(entry), cruxIds: ids }),
        )![1];
      const starter = await makeSpace(entry.name);
      for (let stage = 0; stage < 3; stage++) {
        await files(ids[0]!, planningFiles(entry, stage));
        await files(ids[1]!, projectFiles(entry, stage));
        for (const id of ids)
          await call('snapshot_crux', {
            cruxId: id,
            label: ['Starting point', 'First change in place', 'Example ready to inspect'][stage],
          });
        if (stage === 0) await pack(starter, `${entry.id}-starter.cruxspace`);
      }
      const example = await makeSpace(`${entry.name} — worked example`);
      await pack(example, `${entry.id}-example.cruxspace`);
    }
  } finally {
    await client.close().catch(() => {});
    await app.close();
  }
});
