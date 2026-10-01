import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { DownloadItem, Event } from 'electron';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { join } from 'node:path';
import JSZip from 'jszip';
import { launchApp } from './launch';
import { enterGarden, createCrux, storedCrux, addArtifact } from './multi-crux-helpers';
import { togglePanel, newTaskButton } from './panel-helpers';
import { exportNativeCrux } from './native-archive-helpers';

test('the visible Crux exporter and importer preserve Main, Tasks, starting state and binary files across profiles and restart', async () => {
  test.setTimeout(180_000);
  const source = await launchApp();
  const filename = join(source.dir, 'private.crux');
  let originalId: string;
  try {
    await enterGarden(source.page);
    originalId = await createCrux(source.page, 'Portable work');
    await addArtifact(source.page, 'note.txt');
    const editor = source.page.locator('.monaco-editor').first();
    await editor.click();
    await source.page.keyboard.type('Earlier text');
    await source.page.keyboard.press('ControlOrMeta+s');
    const meta = await storedCrux(source.page, originalId);
    await expect
      .poll(() => readFileSync(join(meta.projectFolder, 'note.txt'), 'utf8'))
      .toBe('Earlier text');
    writeFileSync(join(meta.projectFolder, 'binary.dat'), Buffer.from([0, 255, 14, 42]));
    await (await newTaskButton(source.page)).click();
    await source.page.getByRole('textbox', { name: 'Task name', exact: true }).fill('Experiment');
    await source.page.getByRole('button', { name: 'Save and start task' }).click();
    await expect(
      source.page.getByRole('button', { name: 'Review changes', exact: true }),
    ).toBeVisible();
    const taskId = (await source.page
      .locator('[data-workspace-id]')
      .getAttribute('data-workspace-id'))!;
    const task = (await source.page.evaluate(
      async (id) =>
        window.electronAPI!.sqlite.get('SELECT project_folder FROM working_copies WHERE id = ?', [
          id,
        ]),
      taskId,
    )) as { project_folder: string };
    writeFileSync(join(task.project_folder, 'note.txt'), 'Task text');
    await source.page
      .getByTestId('task-bar')
      .getByRole('link', { name: 'Main', exact: true })
      .click();
    writeFileSync(join(meta.projectFolder, 'note.txt'), 'Current text');
    await exportNativeCrux(source.page, filename, source.app, () =>
      togglePanel(source.page, 'Toggle export'),
    );
    const zip = await JSZip.loadAsync(readFileSync(filename));
    const graph = JSON.parse(await zip.file('graph.json')!.async('text'));
    expect(graph.workingCopies).toHaveLength(1);
    expect(graph.cruxes.some((row: { kind: string }) => row.kind === 'snapshot')).toBe(false);
    expect(graph.workingCopies[0].baseState.workspace.parentId).toBeNull();
    expect(graph.fingerprints).toContain(graph.workingCopies[0].baseState.root);
    expect(JSON.stringify(graph)).not.toContain(meta.projectFolder);
    expect(graph.cruxes.find((row: { id: string }) => row.id === originalId)).not.toHaveProperty(
      'visibility',
    );
  } finally {
    await source.app.close();
  }
  let destination = await launchApp();
  const dir = destination.dir;
  try {
    await enterGarden(destination.page);
    // A damaged private backup must not leave a partial graph or a visible Crux.
    const broken = await JSZip.loadAsync(readFileSync(filename));
    const graph = JSON.parse(await broken.file('graph.json')!.async('text'));
    broken.remove(`content/${graph.fingerprints[0]}`);
    const damaged = join(dir, 'damaged.crux');
    writeFileSync(damaged, await broken.generateAsync({ type: 'nodebuffer' }));
    await destination.page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    const chooser = destination.page.waitForEvent('filechooser');
    await destination.page
      .getByRole('button', { name: 'Import Crux, tool or Mood', exact: true })
      .click();
    await (await chooser).setFiles(damaged);
    await expect(destination.page.getByText(/missing|incomplete/i).last()).toBeVisible();
    expect(
      await destination.page.evaluate(() =>
        window.electronAPI!.sqlite.all("SELECT id FROM cruxes WHERE title = 'Portable work'"),
      ),
    ).toEqual([]);
    await destination.page.keyboard.press('Escape');
    const retryChooser = destination.page.waitForEvent('filechooser');
    await destination.page
      .getByRole('button', { name: 'Import Crux, tool or Mood', exact: true })
      .click();
    await (await retryChooser).setFiles(filename);
    await expect(destination.page.locator('[data-workspace-id]')).toBeVisible({ timeout: 90_000 });
    const importedId = (await destination.page
      .locator('[data-workspace-id]')
      .getAttribute('data-workspace-id'))!;
    expect(importedId).not.toBe(originalId!);
    expect(
      await destination.page.evaluate(
        async (id) =>
          window.electronAPI!.sqlite.get(
            'SELECT visibility, discoverable FROM cruxes WHERE id = ?',
            [id],
          ),
        importedId,
      ),
    ).toEqual({ visibility: 'private', discoverable: 0 });
    const meta = await storedCrux(destination.page, importedId);
    expect(readFileSync(join(meta.projectFolder, 'note.txt'), 'utf8')).toBe('Current text');
    expect(Array.from(readFileSync(join(meta.projectFolder, 'binary.dat')))).toEqual([
      0, 255, 14, 42,
    ]);
    const copies = (await destination.page.evaluate(
      async (id) =>
        window.electronAPI!.sqlite.all(
          'SELECT id, project_folder, phase FROM working_copies WHERE crux_id = ?',
          [id],
        ),
      importedId,
    )) as { id: string; project_folder: string; phase: string }[];
    expect(copies).toHaveLength(1);
    expect(copies[0].phase).toBe('ready');
    expect(readFileSync(join(copies[0].project_folder, 'note.txt'), 'utf8')).toBe('Task text');
    expect(
      await destination.page.evaluate(() =>
        window.electronAPI!.sqlite.all('SELECT id FROM artifacts'),
      ),
    ).toEqual([]);
    const startingText = await destination.page.evaluate(async (id) => {
      const db = window.electronAPI!.sqlite;
      const base = await db.workingCopyBase!(id);
      const entry = base.entries.find((file) => file.path === 'note.txt')!;
      return new TextDecoder().decode(await db.blobRead(entry.fingerprint));
    }, copies[0].id);
    expect(startingText).toBe('Earlier text');
    await destination.app.close();
    destination = await launchApp({ dir });
    await destination.page.getByRole('button', { name: /enter/i }).click();
    await destination.page.getByRole('button', { name: 'Open Portable work', exact: true }).click();
    await expect(destination.page.locator('[data-workspace-id]')).toHaveAttribute(
      'data-workspace-id',
      importedId,
    );
    await destination.page.goto(`crux-app://app/c/${importedId}?task=${copies[0].id}`);
    await expect(
      destination.page.getByRole('button', { name: 'Review changes', exact: true }),
    ).toBeVisible();
    expect(readFileSync(join(copies[0].project_folder, 'note.txt'), 'utf8')).toBe('Task text');
  } finally {
    await destination.app.close();
  }
});

test('an authenticated outside agent exports the same private graph archive through the provided tool', async () => {
  const { app, page, dir } = await launchApp();
  const client = new Client({ name: 'archive-check', version: '1' });
  try {
    await enterGarden(page);
    await page.keyboard.press('ControlOrMeta+,');
    await page.getByRole('switch', { name: 'Agent access for Whole garden', exact: true }).click();
    const path = join(dir, 'userData', 'garden-agent-host', '.crux', 'mcp.json');
    await expect.poll(() => existsSync(path)).toBe(true);
    const config = JSON.parse(readFileSync(path, 'utf8'));
    await client.connect(
      new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
      }),
    );
    await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError).not.toBe(true);
      return (result.content as { text: string }[]).map((item) => item.text).join('\n');
    };
    const id = /id: (\S+)/.exec(
      await call('plant_crux', { title: 'Agent archive', template: 'blank' }),
    )![1];
    await call('call_crux_tool', {
      cruxId: id,
      name: 'write_file',
      input: { path: 'agent.txt', content: 'Created through MCP' },
    });
    const filename = join(dir, 'agent.crux');
    await app.evaluate(({ session }, filename) => {
      session.defaultSession.once('will-download', (_event: Event, item: DownloadItem) =>
        item.setSavePath(filename),
      );
    }, filename);
    expect(await call('export_crux', { cruxId: id })).toContain('Exported "Agent archive"');
    await expect.poll(() => existsSync(filename)).toBe(true);
    await expect
      .poll(async () => {
        try {
          return !!(await JSZip.loadAsync(readFileSync(filename))).file('graph.json');
        } catch {
          return false;
        }
      })
      .toBe(true);
    const zip = await JSZip.loadAsync(readFileSync(filename));
    expect(JSON.parse(await zip.file('manifest.json')!.async('text'))).toMatchObject({
      purpose: 'private-backup',
      archiveVersion: 3,
    });
    const graph = JSON.parse(await zip.file('graph.json')!.async('text'));
    expect(graph.selection.roots).toEqual([id]);
    expect(graph.contentHeads).toEqual(
      expect.arrayContaining([expect.objectContaining({ cruxId: id })]),
    );
    expect(
      await page.evaluate(() => window.electronAPI!.sqlite.all('SELECT id FROM artifacts')),
    ).toEqual([]);
  } finally {
    await client.close();
    await app.close();
  }
});
