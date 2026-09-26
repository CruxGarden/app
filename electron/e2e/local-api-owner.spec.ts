import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

test('packaged API graph owns a scratch database with the Electron SQLite binary and survives restart', async () => {
  let launch = await launchApp();
  const dir = launch.dir;
  try {
    const created = await launch.app.evaluate(async ({ app }) => {
      const path = process.getBuiltinModule('path');
      const fs = process.getBuiltinModule('fs');
      const { randomUUID } = process.getBuiltinModule('crypto');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { SqliteNative } = load('./dist/sqlite-native.js');
      const { LocalGraphRuntime, CruxKind, DimensionType } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      // The app keeps its existing owner during this proof. This separate,
      // temporary database is opened by only one owner at a time.
      const filename = path.join(app.getPath('userData'), 'api-owner-proof.db');
      const seed = new SqliteNative(
        filename,
        path.join(app.getPath('userData'), 'api-proof-blobs'),
      );
      seed.close();
      const runtime = await LocalGraphRuntime.open(filename);
      try {
        const alias = path.join(app.getPath('userData'), 'api-owner-alias.db');
        fs.linkSync(filename, alias);
        const ownershipErrors: string[] = [];
        for (const target of [filename, alias]) {
          let duplicate: import('@cruxgarden/local-api').LocalGraphRuntime | undefined;
          try {
            duplicate = await LocalGraphRuntime.open(target);
            ownershipErrors.push('Unexpected second owner');
          } catch (error) {
            ownershipErrors.push((error as Error).message);
          } finally {
            await duplicate?.close();
          }
        }
        const authorId = randomUUID();
        const homeId = randomUUID();
        const input = () => ({
          slug: randomUUID(),
          title: 'Initial title',
          authorId,
          homeId,
          kind: CruxKind.GARDEN,
        });
        const ids = await runtime.execute(async ({ crux }) => {
          const root = await crux.create(input());
          const nested = await crux.create(input());
          await crux.createDimension(root.id, {
            targetId: nested.id,
            type: DimensionType.GARDEN,
            kind: 'membership',
            authorId,
            homeId,
          });
          return { root: root.id, nested: nested.id };
        });
        let rolledBack = false;
        try {
          await runtime.execute(async ({ crux }) => {
            await crux.create(input());
            throw new Error('Interrupted graph edit');
          });
        } catch (error) {
          rolledBack = (error as Error).message === 'Interrupted graph edit';
        }
        const queuedArgs = ['Captured title', ids.nested];
        const queuedWrite = runtime.run('UPDATE cruxes SET title = ? WHERE id = ?', queuedArgs);
        queuedArgs[0] = 'Later title';
        queuedArgs[1] = ids.root;
        await queuedWrite;
        const rows = await runtime.all('SELECT * FROM cruxes');
        const dimensions = await runtime.all('SELECT * FROM dimensions');
        return {
          ids,
          rolledBack,
          ownershipErrors,
          count: rows.length,
          dimensions: dimensions.length,
          electron: process.versions.electron,
        };
      } finally {
        await runtime.close();
      }
    });
    expect(created.rolledBack).toBe(true);
    expect(created.ownershipErrors).toEqual([
      'Local API database is already owned in this process',
      'Local API database is already owned in this process',
    ]);
    expect(created.count).toBe(2);
    expect(created.dimensions).toBe(1);
    expect(created.electron).toBeTruthy();
    await launch.app.close();
    launch = await launchApp({ dir });
    const restored = await launch.app.evaluate(async ({ app }, ids) => {
      const path = process.getBuiltinModule('path');
      const fs = process.getBuiltinModule('fs');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { LocalGraphRuntime } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      const runtime = await LocalGraphRuntime.open(
        path.join(app.getPath('userData'), 'api-owner-proof.db'),
      );
      let snapshot: import('@cruxgarden/local-api').LocalGraphRuntime | undefined;
      try {
        const crux = await runtime.execute(({ crux }) => crux.findById(ids.nested));
        const root = await runtime.execute(({ crux }) => crux.findById(ids.root));
        const dimensions = await runtime.all('SELECT * FROM dimensions WHERE source_id = ?', [
          ids.root,
        ]);
        const exported = path.join(app.getPath('userData'), 'api-owner-export.db');
        const queuedWrite = runtime.run('UPDATE cruxes SET title = ? WHERE id = ?', [
          'Recovery checkpoint',
          ids.nested,
        ]);
        const recovery = runtime.closeWithRecoveryImage();
        let lateWriteError = '';
        try {
          await runtime.run('UPDATE cruxes SET title = ? WHERE id = ?', ['Too late', ids.nested]);
        } catch (error) {
          lateWriteError = (error as Error).message;
        }
        await queuedWrite;
        fs.writeFileSync(exported, Buffer.from(await recovery));
        // A different file verifies the actual serialized image, not a second
        // connection to the owner's database.
        snapshot = await LocalGraphRuntime.open(exported);
        const exportedRows = await snapshot.all('SELECT * FROM cruxes');
        return {
          id: crux.id,
          title: crux.title,
          rootTitle: root.title,
          visibility: crux.visibility,
          targets: dimensions.map((d) => d.target_id),
          exportCount: exportedRows.length,
          exportTitle: exportedRows.find((row) => row.id === ids.nested)?.title,
          lateWriteError,
        };
      } finally {
        await snapshot?.close();
        await runtime.close();
      }
    }, created.ids);
    expect(restored).toEqual({
      id: created.ids.nested,
      title: 'Captured title',
      rootTitle: 'Initial title',
      visibility: 'private',
      targets: [created.ids.nested],
      exportCount: 2,
      exportTitle: 'Recovery checkpoint',
      lateWriteError: 'Local API is closing',
    });
  } finally {
    await launch.app.close();
  }
});

test('the packaged API creates its own fresh schema and preserves membership through Electron restart', async () => {
  let launch = await launchApp();
  const dir = launch.dir;
  try {
    const ids = await launch.app.evaluate(async ({ app }) => {
      const path = process.getBuiltinModule('path');
      const { randomUUID } = process.getBuiltinModule('crypto');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { LocalGraphRuntime, CruxKind, inspectDesktopRecovery } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      const runtime = await LocalGraphRuntime.create(
        path.join(app.getPath('userData'), 'api-fresh.db'),
      );
      try {
        const authorId = randomUUID();
        const homeId = randomUUID();
        const input = () => ({ slug: randomUUID(), authorId, homeId, kind: CruxKind.GARDEN });
        const root = await runtime.execute(({ crux }) => crux.create(input()));
        const child = await runtime.execute(({ crux }) => crux.create(input()));
        await runtime.addGardenMember({ gardenId: root.id, memberId: child.id, authorId, homeId });
        await runtime.run('INSERT INTO settings (key, value) VALUES (?, ?)', [
          'fixture',
          'fresh API',
        ]);
        const inspected = inspectDesktopRecovery(await runtime.closeWithRecoveryImage());
        return { root: root.id, child: child.id, version: inspected.schemaVersion };
      } finally {
        await runtime.close();
      }
    });
    expect(ids.version).toBe(7);
    await launch.app.close();
    launch = await launchApp({ dir });
    const restored = await launch.app.evaluate(async ({ app }, ids) => {
      const path = process.getBuiltinModule('path');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { LocalGraphRuntime } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      const runtime = await LocalGraphRuntime.open(
        path.join(app.getPath('userData'), 'api-fresh.db'),
      );
      try {
        return {
          members: (await runtime.listGardenMembers(ids.root)).items.map((item) => item.id),
          setting: await runtime.get('SELECT value FROM settings WHERE key = ?', ['fixture']),
        };
      } finally {
        await runtime.close();
      }
    }, ids);
    expect(restored).toEqual({ members: [ids.child], setting: { value: 'fresh API' } });
  } finally {
    await launch.app.close();
  }
});
