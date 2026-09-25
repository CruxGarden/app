import JSZip from 'jszip';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

test('saving a Mood uses actual content and Garden membership, refuses partial creation, and survives Copy and restart', async () => {
  test.setTimeout(120_000);
  let instance = await launchApp();
  const dir = instance.dir;
  try {
    let page = instance.page;
    await enterGarden(page);
    await page.getByRole('button', { name: 'Navigator', exact: true }).click();
    await page.getByRole('button', { name: 'New Garden', exact: true }).click();
    await page.getByRole('textbox', { name: 'Garden name' }).fill('Sound studio');
    await page.getByRole('button', { name: 'Create Garden', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'Sound studio',
    );
    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    await page.getByRole('button', { name: 'Save current as Mood' }).click();
    await page.getByRole('textbox', { name: 'Mood name' }).fill('Slow dream');
    await page.evaluate(() =>
      window.electronAPI!.sqlite.run(
        "CREATE TRIGGER refuse_mood_content BEFORE INSERT ON file_content_heads BEGIN SELECT RAISE(ABORT, 'Mood content refused'); END",
      ),
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Mood content refused');
    expect(
      await page.evaluate(() =>
        window.electronAPI!.sqlite.all("SELECT id FROM cruxes WHERE kind = 'mood'"),
      ),
    ).toEqual([]);
    await page.evaluate(() => window.electronAPI!.sqlite.run('DROP TRIGGER refuse_mood_content'));
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Apply Slow dream', exact: true })).toBeVisible();
    const result = await page.evaluate(async () => {
      const db = window.electronAPI!.sqlite;
      const garden = (await db.get("SELECT id FROM cruxes WHERE title = 'Sound studio'")) as {
        id: string;
      };
      const mood = (await db.get("SELECT id FROM cruxes WHERE title = 'Slow dream'")) as {
        id: string;
      };
      const head = (await db.fileContent!.head(mood.id))!;
      const content = await db.fileContent!.list({ cruxId: mood.id, expected: head });
      const parents = await db.gardenMembership!.parents(mood.id);
      const settings = (await db.all(
        "SELECT key,value FROM settings WHERE key IN ('cruxgarden:local:authorId','cruxgarden:local:homeId')",
      )) as { key: string; value: string }[];
      const archive = await db.privateArchive!.export({ roots: [garden.id], includeMembers: true });
      const copy = await db.privateArchive!.import(archive, {
        requestId: crypto.randomUUID(),
        mode: 'copy',
        destination: {
          authorId: settings.find((row) => row.key.endsWith('authorId'))!.value,
          homeId: settings.find((row) => row.key.endsWith('homeId'))!.value,
        },
      });
      const copiedHead = await db.fileContent!.head(copy.ids[mood.id]!);
      return {
        garden,
        mood,
        head,
        content,
        parents,
        copy,
        copiedHead,
        legacy: await db.all(
          "SELECT value FROM settings WHERE key = 'cruxgarden:moodPackages' AND value != ''",
        ),
        artifacts: await db.all('SELECT id FROM artifacts WHERE resource_id = ?', [mood.id]),
      };
    });
    expect(result.parents.map((parent) => parent.id)).toEqual([result.garden.id]);
    expect(result.content.entries.map((file) => file.path)).toEqual(['mood.cruxmood']);
    expect(result.head.revision).toBe(1);
    expect(result.copiedHead?.root).toBe(result.head.root);
    expect(result.copy.ids[result.mood.id]).not.toBe(result.mood.id);
    expect(result.legacy).toEqual([]);
    expect(result.artifacts).toEqual([]);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Garden location', exact: true }).click();
    await page
      .getByRole('navigation', { name: 'Garden ancestry' })
      .getByRole('button', { name: 'My Garden', exact: true })
      .click();
    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Apply Slow dream', exact: true })).toHaveCount(
      0,
    );
    await instance.app.close();
    instance = await launchApp({ dir });
    page = instance.page;
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await page.getByRole('button', { name: 'Navigator', exact: true }).click();
    await page.getByRole('button', { name: 'Sound studio', exact: true }).click();
    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Apply Slow dream', exact: true })).toBeVisible();
    await page.evaluate(async ({ garden, mood }) => {
      const api = window.electronAPI!.sqlite.gardenMood!;
      await api.select({
        gardenId: garden.id,
        moodId: mood.id,
        mode: 'own',
        expected: (await api.read(garden.id)).selection,
      });
    }, result);
    // The Garden now wears it, so it cannot be deleted from under that Garden.
    await expect(
      page.getByRole('button', { name: 'Delete Mood Slow dream', exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Apply Slow dream', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(async (id) => {
      const api = window.electronAPI!.sqlite.gardenMood!;
      await api.select({
        gardenId: id,
        moodId: null,
        mode: 'none',
        expected: (await api.read(id)).selection,
      });
    }, result.garden.id);
    await page.getByRole('button', { name: 'Delete Mood Slow dream', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Apply Slow dream', exact: true })).toHaveCount(
      0,
    );
    expect(
      await page.evaluate(
        async (id) =>
          (
            (await window.electronAPI!.sqlite.get('SELECT deleted FROM cruxes WHERE id = ?', [
              id,
            ])) as { deleted: string }
          ).deleted,
        result.mood.id,
      ),
    ).toBeTruthy();
    expect(
      await page.evaluate(
        async (id) =>
          (
            (await window.electronAPI!.sqlite.get('SELECT deleted FROM cruxes WHERE id = ?', [
              id,
            ])) as { deleted: null }
          ).deleted,
        result.copy.ids[result.mood.id]!,
      ),
    ).toBeNull();
  } finally {
    await instance.app.close();
  }
});

test('current saved packages move once with retry, and an outside agent lists and wears the same saved Mood', async () => {
  test.setTimeout(120_000);
  let instance = await launchApp();
  const dir = instance.dir;
  const client = new Client({ name: 'mood-library-check', version: '1' });
  try {
    let page = instance.page;
    await enterGarden(page);
    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    await page.getByRole('button', { name: 'Save current as Mood' }).click();
    await page.getByRole('textbox', { name: 'Mood name' }).fill('Seed sound');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Apply Seed sound', exact: true })).toBeVisible();
    const bytes = await page.evaluate(async () => {
      const db = window.electronAPI!.sqlite;
      const mood = (await db.get("SELECT id FROM cruxes WHERE title = 'Seed sound'")) as {
        id: string;
      };
      const head = (await db.fileContent!.head(mood.id))!;
      return [
        ...(await db.fileContent!.read({ cruxId: mood.id, expected: head, path: 'mood.cruxmood' }))!
          .bytes,
      ];
    });
    const zip = await JSZip.loadAsync(Buffer.from(bytes));
    const pkg = JSON.parse(await zip.file('package.json')!.async('text'));
    const previous = JSON.stringify([
      { ...pkg, id: 'mood-retained-sound', name: 'Retained sound' },
    ]);
    await page.evaluate(async (value) => {
      await window.electronAPI!.sqlite.run(
        'INSERT OR REPLACE INTO settings(key,value) VALUES (?,?)',
        ['cruxgarden:moodPackages', value],
      );
    }, previous);
    await instance.app.close();
    instance = await launchApp({ dir });
    page = instance.page;
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await page.evaluate(() =>
      window.electronAPI!.sqlite.run(
        "CREATE TRIGGER refuse_retirement BEFORE INSERT ON settings WHEN NEW.key = 'cruxgarden:moodPackages' AND NEW.value = '' BEGIN SELECT RAISE(ABORT, 'Retirement refused'); END",
      ),
    );
    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Retirement refused');
    const retained = (await page.evaluate(() =>
      window.electronAPI!.sqlite.all(
        "SELECT id FROM cruxes WHERE title = 'Retained sound' AND deleted IS NULL",
      ),
    )) as { id: string }[];
    expect(retained).toHaveLength(1);
    expect(
      await page.evaluate(() =>
        window.electronAPI!.sqlite.get(
          "SELECT value FROM settings WHERE key = 'cruxgarden:moodPackages'",
        ),
      ),
    ).toEqual({ value: previous });
    await page.evaluate(() => window.electronAPI!.sqlite.run('DROP TRIGGER refuse_retirement'));
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Apply Retained sound', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        window.electronAPI!.sqlite.all(
          "SELECT id FROM cruxes WHERE title = 'Retained sound' AND deleted IS NULL",
        ),
      ),
    ).toEqual(retained);
    expect(
      await page.evaluate(() =>
        window.electronAPI!.sqlite.get(
          "SELECT value FROM settings WHERE key = 'cruxgarden:moodPackages'",
        ),
      ),
    ).toEqual({ value: '' });
    await page.getByRole('button', { name: 'Close Mood', exact: true }).click();
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
    const listed = await client.callTool({ name: 'list_moods', arguments: {} });
    expect(listed.isError).not.toBe(true);
    expect(JSON.stringify(listed.content)).toContain(`${retained[0]!.id} — Retained sound`);
    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    const worn = await client.callTool({ name: 'wear_mood', arguments: { id: retained[0]!.id } });
    expect(worn.isError).not.toBe(true);
    expect(JSON.stringify(worn.content)).toContain('Retained sound');
    await expect(
      page.getByRole('button', { name: 'Apply Retained sound', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await client.close();
    await instance.app.close();
    instance = await launchApp({ dir });
    page = instance.page;
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Apply Retained sound', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        window.electronAPI!.sqlite.all(
          "SELECT id FROM cruxes WHERE title = 'Retained sound' AND deleted IS NULL",
        ),
      ),
    ).toEqual(retained);
  } finally {
    await client.close().catch(() => {});
    await instance.app.close();
  }
});
