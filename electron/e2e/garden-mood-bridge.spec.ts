import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

test('Garden Mood selection crosses the trusted desktop bridge, private Copy and restart', async () => {
  test.setTimeout(120_000);
  let instance = await launchApp();
  const dir = instance.dir;
  try {
    await enterGarden(instance.page);
    await instance.page.getByRole('button', { name: 'Navigator', exact: true }).click();
    await instance.page.getByRole('button', { name: 'New Garden', exact: true }).click();
    await instance.page.getByRole('textbox', { name: 'Garden name' }).fill('Mood studio');
    await instance.page.getByRole('button', { name: 'Create Garden', exact: true }).click();
    await expect(
      instance.page.getByRole('button', { name: 'Garden location', exact: true }),
    ).toHaveText('Mood studio');
    const result = await instance.page.evaluate(async () => {
      const db = window.electronAPI!.sqlite;
      const api = db.gardenMood!;
      const garden = (await db.get(
        "SELECT id FROM cruxes WHERE title = 'Mood studio' AND deleted IS NULL",
      )) as { id: string };
      const parent = (await db.gardenMembership!.parents(garden.id))[0].id;
      const rows = (await db.all(
        "SELECT key,value FROM settings WHERE key IN ('cruxgarden:local:authorId','cruxgarden:local:homeId')",
      )) as { key: string; value: string }[];
      const destination = {
        authorId: rows.find((row) => row.key.endsWith('authorId'))!.value,
        homeId: rows.find((row) => row.key.endsWith('homeId'))!.value,
      };
      const moodId = await db.createCrux!({
        ...destination,
        kind: 'mood',
        slug: crypto.randomUUID(),
        title: 'Dusk',
      });
      const expected = (await api.read(parent)).selection;
      const input = {
        gardenId: parent,
        mode: 'own' as const,
        moodId,
        expected,
        authorId: crypto.randomUUID(),
        homeId: crypto.randomUUID(),
      };
      const pending = api.select(input);
      input.gardenId = garden.id;
      await pending;
      const inherited = await api.resolve(garden.id);
      const edge = await db.get(
        "SELECT author_id,home_id FROM dimensions WHERE source_id = ? AND type = 'graft' AND kind = 'mood' AND deleted IS NULL",
        [parent],
      );
      const failure = async (operation: () => Promise<unknown>) => {
        try {
          await operation();
          return 'NOT REFUSED';
        } catch (error) {
          return (error as Error).message;
        }
      };
      const stale = await failure(() =>
        api.select({ gardenId: parent, mode: 'none', moodId: null, expected }),
      );
      await db.run(
        "CREATE TRIGGER refuse_mood BEFORE UPDATE OF meta ON cruxes BEGIN SELECT RAISE(ABORT, 'Mood save refused'); END",
      );
      const refused = await failure(() =>
        api.select({ gardenId: garden.id, mode: 'none', moodId: null, expected }),
      );
      await db.run('DROP TRIGGER refuse_mood');
      const afterFailure = await api.resolve(garden.id);
      await api.select({ gardenId: garden.id, mode: 'none', moodId: null, expected });
      const disabled = await api.resolve(garden.id);
      await api.select({
        gardenId: garden.id,
        mode: 'own',
        moodId,
        expected: (await api.read(garden.id)).selection,
      });
      const bytes = await db.privateArchive!.export({ roots: [garden.id], includeMembers: true });
      const copied = await db.privateArchive!.import(bytes, {
        requestId: crypto.randomUUID(),
        mode: 'copy',
        destination,
      });
      return {
        gardenId: garden.id,
        moodId,
        inherited,
        edge,
        destination,
        stale,
        refused,
        afterFailure,
        disabled,
        copiedGarden: copied.ids[garden.id],
        copiedMood: copied.ids[moodId],
        copied: await api.resolve(copied.ids[garden.id]),
        members: await db.gardenMembership!.list(copied.ids[garden.id]),
      };
    });
    expect(result.inherited).toMatchObject({
      moodId: result.moodId,
      mode: 'own',
      sourceTitle: 'My Garden',
    });
    expect(result.edge).toEqual({
      author_id: result.destination.authorId,
      home_id: result.destination.homeId,
    });
    expect(result.stale).toContain('changed');
    expect(result.refused).toContain('Mood save refused');
    expect(result.afterFailure).toEqual(result.inherited);
    expect(result.disabled).toMatchObject({
      moodId: null,
      mode: 'none',
      sourceGardenId: result.gardenId,
    });
    expect(result.copiedMood).not.toBe(result.moodId);
    expect(result.copied).toMatchObject({
      moodId: result.copiedMood,
      sourceGardenId: result.copiedGarden,
    });
    expect(result.members.items).toEqual([]);

    const extraWindow = instance.app.waitForEvent('window');
    await instance.app.evaluate(async ({ BrowserWindow, app }) => {
      const path = process.getBuiltinModule('path');
      const extra = new BrowserWindow({
        show: false,
        webPreferences: {
          preload: path.join(app.getAppPath(), 'dist/preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      await extra.loadURL('about:blank');
    });
    const extra = await extraWindow;
    const refusals = await extra.evaluate(async (id) => {
      const api = window.electronAPI!.sqlite.gardenMood!;
      const errors: string[] = [];
      for (const run of [
        () => api.read(id),
        () => api.resolve(id),
        () =>
          api.select({
            gardenId: id,
            mode: 'none',
            moodId: null,
            expected: { mode: 'inherit', moodId: null, edgeId: null },
          }),
      ]) {
        try {
          await run();
          errors.push('NOT REFUSED');
        } catch (error) {
          errors.push((error as Error).message);
        }
      }
      return errors;
    }, result.gardenId);
    expect(refusals).toHaveLength(3);
    for (const refusal of refusals) expect(refusal).toContain('only available to Crux Garden');
    await extra.close();
    await instance.app.close();
    instance = await launchApp({ dir });
    await instance.page.getByRole('button', { name: /enter/i }).click();
    expect(
      await instance.page.evaluate(
        (id) => window.electronAPI!.sqlite.gardenMood!.resolve(id),
        result.copiedGarden,
      ),
    ).toEqual(result.copied);
  } finally {
    await instance.app.close().catch(() => {});
  }
});

test('a pending Mood selection cannot cross a profile replacement', async () => {
  const instance = await launchApp();
  try {
    const result = await instance.app.evaluate(async ({ app }) => {
      const path = process.getBuiltinModule('path');
      const crypto = process.getBuiltinModule('crypto');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { SqliteApi } = load('./dist/sqlite-api.js') as typeof import('../src/sqlite-api');
      const directory = path.join(app.getPath('userData'), 'mood-replacement-proof');
      const db = await SqliteApi.open(
        path.join(directory, 'garden.db'),
        path.join(directory, 'blobs'),
      );
      try {
        const authorId = crypto.randomUUID(),
          homeId = crypto.randomUUID();
        await db.run(
          "INSERT INTO settings (key,value) VALUES ('cruxgarden:local:authorId', ?), ('cruxgarden:local:homeId', ?)",
          [authorId, homeId],
        );
        const gardenId = await db.createCrux({ slug: 'root', kind: 'garden', authorId, homeId });
        const moodId = await db.createCrux({ slug: 'dusk', kind: 'mood', authorId, homeId });
        const expected = (await db.gardenMood.read(gardenId)).selection;
        const image = await db.export();
        const owner = (
          db as unknown as { owner: import('@cruxgarden/local-api').LocalGraphRuntime }
        ).owner;
        const original = owner.get.bind(owner);
        let release!: () => void, captured!: () => void;
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        const ready = new Promise<void>((resolve) => {
          captured = resolve;
        });
        owner.get = (async (sql: string, params?: unknown[]) => {
          const row = await original(sql, params);
          captured();
          await held;
          return row;
        }) as typeof owner.get;
        const pending = db.gardenMood.select({ gardenId, moodId, mode: 'own', expected }).then(
          () => 'NOT REFUSED',
          (error) => (error as Error).message,
        );
        await ready;
        owner.get = original;
        await db.import(image);
        release();
        const refused = await pending;
        const before = (await db.gardenMood.read(gardenId)).selection;
        await db.gardenMood.select({ gardenId, moodId, mode: 'own', expected: before });
        return { refused, before, after: await db.gardenMood.resolve(gardenId), moodId };
      } finally {
        await db.close();
      }
    });
    expect(result.refused).toContain('Garden changed');
    expect(result.before).toEqual({ mode: 'inherit', edgeId: null, moodId: null });
    expect(result.after).toMatchObject({ mode: 'own', moodId: result.moodId });
  } finally {
    await instance.app.close();
  }
});
