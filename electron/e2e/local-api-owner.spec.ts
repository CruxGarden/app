import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

test('packaged API graph owns a scratch database with the Electron SQLite binary and survives restart', async () => {
  let launch = await launchApp();
  const dir = launch.dir;
  try {
    const created = await launch.app.evaluate(async ({ app }) => {
      const path = process.getBuiltinModule('path');
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
        const authorId = randomUUID();
        const homeId = randomUUID();
        const input = () => ({ slug: randomUUID(), authorId, homeId, kind: CruxKind.GARDEN });
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
        const rows = await runtime.all('SELECT * FROM cruxes');
        const dimensions = await runtime.all('SELECT * FROM dimensions');
        return {
          ids,
          rolledBack,
          count: rows.length,
          dimensions: dimensions.length,
          electron: process.versions.electron,
        };
      } finally {
        await runtime.close();
      }
    });
    expect(created.rolledBack).toBe(true);
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
        const dimensions = await runtime.all('SELECT * FROM dimensions WHERE source_id = ?', [
          ids.root,
        ]);
        const exported = path.join(app.getPath('userData'), 'api-owner-export.db');
        fs.writeFileSync(exported, Buffer.from(await runtime.exportDatabase()));
        // A different file verifies the actual serialized image, not a second
        // connection to the owner's database.
        snapshot = await LocalGraphRuntime.open(exported);
        const exportedRows = await snapshot.all('SELECT * FROM cruxes');
        return {
          id: crux.id,
          visibility: crux.visibility,
          targets: dimensions.map((d) => d.target_id),
          exportCount: exportedRows.length,
        };
      } finally {
        await snapshot?.close();
        await runtime.close();
      }
    }, created.ids);
    expect(restored).toEqual({
      id: created.ids.nested,
      visibility: 'private',
      targets: [created.ids.nested],
      exportCount: 2,
    });
  } finally {
    await launch.app.close();
  }
});
