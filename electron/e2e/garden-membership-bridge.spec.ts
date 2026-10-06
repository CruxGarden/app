import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

test('renderer Garden membership uses the API graph, trusted attribution, bounded pages and restart', async () => {
  test.setTimeout(120_000);
  let instance = await launchApp();
  const dir = instance.dir;
  try {
    await enterGarden(instance.page);
    // Normal startup now admits the API-owned root and identity before actions.
    expect(
      await instance.page.evaluate(
        async () => (await window.electronAPI!.sqlite.enterLocalGarden!()).kind,
      ),
    ).toBe('garden');
    const projectId = await createCrux(instance.page, 'Shared project');
    const setup = await instance.page.evaluate(async (member) => {
      const db = window.electronAPI!.sqlite;
      const rows = (await db.all(
        "SELECT key, value FROM settings WHERE key IN ('cruxgarden:local:authorId', 'cruxgarden:local:homeId')",
      )) as { key: string; value: string }[];
      const authorId = rows.find((row) => row.key.endsWith('authorId'))!.value;
      const homeId = rows.find((row) => row.key.endsWith('homeId'))!.value;
      const create = (title: string, kind: 'garden' | 'snapshot') =>
        db.createCrux!({ title, kind, slug: crypto.randomUUID(), authorId, homeId });
      const root = await create('Root', 'garden');
      const child = await create('Child', 'garden');
      const other = await create('Other', 'garden');
      const snapshot = await create('History', 'snapshot');
      return { root, child, other, member, snapshot, authorId, homeId };
    }, projectId);
    const result = await instance.page.evaluate(async (ids) => {
      const db = window.electronAPI!.sqlite;
      const api = db.gardenMembership!;
      const input = {
        gardenId: ids.root,
        memberId: ids.child,
        authorId: crypto.randomUUID(),
        homeId: crypto.randomUUID(),
      };
      const pending = api.add(input);
      input.gardenId = ids.other;
      await pending;
      await api.add({ gardenId: ids.root, memberId: ids.child });
      await api.move({
        gardenId: ids.root,
        memberId: ids.member,
        expectedParents: (await api.parents(ids.member)).map((parent) => parent.id),
      });
      const first = await api.list(ids.root, { limit: 1 });
      const second = await api.list(ids.root, { limit: 1, after: first.next! });
      const edge = await db.get(
        'SELECT author_id, home_id FROM dimensions WHERE source_id = ? AND target_id = ? AND deleted IS NULL',
        [ids.root, ids.child],
      );
      const errors: string[] = [];
      for (const operation of [
        () => api.add({ gardenId: ids.child, memberId: ids.root }),
        () => api.add({ gardenId: ids.root, memberId: ids.root }),
        () => api.add({ gardenId: ids.root, memberId: ids.snapshot }),
        () => api.add({ gardenId: ids.member, memberId: ids.other }),
        () => api.list(ids.root, { limit: 0 }),
        () => api.add({ gardenId: ids.other, memberId: ids.member }),
      ]) {
        try {
          await operation();
          errors.push('NOT REFUSED');
        } catch (error) {
          errors.push((error as Error).message);
        }
      }
      await api.move({ gardenId: ids.other, memberId: ids.member, expectedParents: [ids.root] });
      return {
        first,
        second,
        edge,
        errors,
        root: await api.list(ids.root),
        other: await api.list(ids.other),
        member: await db.get('SELECT deleted FROM cruxes WHERE id = ?', [ids.member]),
      };
    }, setup);
    expect(result.edge).toEqual({ author_id: setup.authorId, home_id: setup.homeId });
    expect(result.first.items).toHaveLength(1);
    expect(result.second.items).toHaveLength(1);
    expect(result.second.next).toBeNull();
    expect(new Set([...result.first.items, ...result.second.items].map((item) => item.id))).toEqual(
      new Set([setup.child, setup.member]),
    );
    expect(result.errors[0]).toContain('cycle');
    expect(result.errors[1]).toContain('itself');
    expect(result.errors[2]).toContain('Snapshots');
    expect(result.errors[3]).toContain('Garden');
    expect(result.errors[4]).toContain('page size');
    expect(result.errors[5]).toContain('already planted');
    expect(result.root.items.map((item) => item.id)).toEqual([setup.child]);
    expect(result.other.items.map((item) => item.id)).toEqual([setup.member]);
    expect(result.member).toEqual({ deleted: null });

    const refused = await instance.page.evaluate(async (ids) => {
      const db = window.electronAPI!.sqlite;
      await db.run(
        "CREATE TRIGGER refuse_membership BEFORE INSERT ON dimensions WHEN NEW.kind = 'membership' BEGIN SELECT RAISE(ABORT, 'Membership refused'); END",
      );
      let error = '';
      try {
        await db.gardenMembership!.move({
          gardenId: ids.child,
          memberId: ids.member,
          expectedParents: [ids.other],
        });
      } catch (failure) {
        error = (failure as Error).message;
      } finally {
        await db.run('DROP TRIGGER refuse_membership');
      }
      return { error, members: await db.gardenMembership!.list(ids.child) };
    }, setup);
    expect(refused.error).toContain('Dimension creation error');
    expect(refused.error).not.toContain('Membership refused');
    expect(
      await instance.page.evaluate(
        async (memberId) =>
          (await window.electronAPI!.sqlite.gardenMembership!.parents(memberId)).map(
            (parent) => parent.id,
          ),
        projectId,
      ),
    ).toEqual([setup.other]);
    expect(refused.members.items).toEqual([]);

    // A second renderer with the preload still cannot invoke Garden commands.
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
    expect(
      await extra.evaluate(async (root) => {
        try {
          await window.electronAPI!.sqlite.gardenMembership!.list(root);
          return 'NOT REFUSED';
        } catch (error) {
          return (error as Error).message;
        }
      }, setup.root),
    ).toContain('only available to Crux Garden');
    await extra.close();

    await instance.app.close();
    instance = await launchApp({ dir });
    await instance.page.getByRole('button', { name: /enter/i }).click();
    const restored = await instance.page.evaluate(async (ids) => {
      const api = window.electronAPI!.sqlite.gardenMembership!;
      const before = await api.list(ids.child);
      await api.move({ gardenId: ids.child, memberId: ids.member, expectedParents: [ids.other] });
      return {
        before,
        child: await api.list(ids.child),
        root: await api.list(ids.root),
        other: await api.list(ids.other),
      };
    }, setup);
    expect(restored.before.items).toEqual([]);
    expect(restored.child.items.map((item) => item.id)).toEqual([setup.member]);
    expect(restored.root.items.map((item) => item.id)).toEqual([setup.child]);
    expect(restored.other.items).toEqual([]);
  } finally {
    await instance.app.close().catch(() => {});
  }
});

test('a membership request cannot carry its captured identity through profile replacement', async () => {
  const instance = await launchApp();
  try {
    const result = await instance.app.evaluate(async ({ app }) => {
      const path = process.getBuiltinModule('path');
      const crypto = process.getBuiltinModule('crypto');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { SqliteApi } = load(
        path.join(app.getAppPath(), 'dist/sqlite-api.js'),
      ) as typeof import('../src/sqlite-api');
      const directory = path.join(app.getPath('userData'), 'membership-replacement-proof');
      const db = await SqliteApi.open(
        path.join(directory, 'garden.db'),
        path.join(directory, 'blobs'),
      );
      try {
        const authorId = crypto.randomUUID();
        const homeId = crypto.randomUUID();
        await db.run(
          "INSERT INTO settings (key,value) VALUES ('cruxgarden:local:authorId', ?), ('cruxgarden:local:homeId', ?)",
          [authorId, homeId],
        );
        const gardenId = await db.createCrux({ slug: 'root', kind: 'garden', authorId, homeId });
        const memberId = await db.createCrux({ slug: 'member', authorId, homeId });
        const image = await db.export();
        const owner = (
          db as unknown as { owner: import('@cruxgarden/local-api').LocalGraphRuntime }
        ).owner;
        const original = owner.get.bind(owner);
        let release!: () => void;
        let captured!: () => void;
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        const ready = new Promise<void>((resolve) => {
          captured = resolve;
        });
        owner.get = (async (sql: string, params?: unknown[]) => {
          const result = await original(sql, params);
          captured();
          await held;
          return result;
        }) as typeof owner.get;
        const pending = db.gardenMembership.add({ gardenId, memberId }).then(
          () => 'NOT REFUSED',
          (error) => (error as Error).message,
        );
        const moving = db.gardenMembership.move({ gardenId, memberId, expectedParents: [] }).then(
          () => 'NOT REFUSED',
          (error) => (error as Error).message,
        );
        await ready;
        owner.get = original;
        await db.import(image);
        release();
        const refused = await pending;
        const before = await db.gardenMembership.list(gardenId);
        await db.gardenMembership.add({ gardenId, memberId });
        return {
          refused,
          moveRefused: await moving,
          before,
          after: await db.gardenMembership.list(gardenId),
          memberId,
        };
      } finally {
        await db.close();
      }
    });
    expect(result.refused).toContain('Garden changed');
    expect(result.moveRefused).toContain('Garden changed');
    expect(result.before.items).toEqual([]);
    expect(result.after.items.map((item) => item.id)).toEqual([result.memberId]);
  } finally {
    await instance.app.close();
  }
});
