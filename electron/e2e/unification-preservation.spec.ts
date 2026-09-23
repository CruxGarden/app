import {
  toolFunctionProfile,
  toolFunctionIds,
} from '../../src/test/fixtures/unification/tool-function-profile';
import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { legacyIds } from '../../src/test/fixtures/unification/legacy-profile';

// Integration at the real Electron/API/native SQLite boundary. This does not
// claim normal renderer ownership or selective Garden transfer has migrated.
test('the API preserves a complete legacy profile through preparation, export and process restart', async () => {
  const fixture = toolFunctionProfile();
  let launch = await launchApp();
  try {
    const prepared = await launch.app.evaluate(async ({ app }, fixture) => {
      const path = process.getBuiltinModule('path');
      const fs = process.getBuiltinModule('fs');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { SqliteNative } = load('./dist/sqlite-native.js');
      const { LocalGraphRuntime } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      const filename = path.join(app.getPath('userData'), 'preservation.db');
      const blobDir = path.join(app.getPath('userData'), 'preservation-blobs');
      const seed = new SqliteNative(filename, blobDir);
      const before: Record<string, Record<string, unknown>[]> = {};
      let tables: string[];
      try {
        for (const [table, rows] of Object.entries(fixture.tables)) {
          for (const row of rows) {
            const columns = Object.keys(row);
            seed.run(
              `INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
              Object.values(row),
            );
          }
          before[table] = seed.all(`SELECT * FROM ${table} ORDER BY 1`);
        }
        tables = seed
          .all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
          .map((row: { name: string }) => row.name)
          .sort();
        for (const blob of fixture.blobs)
          seed.blobWrite(blob.fingerprint, Uint8Array.from(blob.bytes));
      } finally {
        seed.close();
      }
      const owner = await LocalGraphRuntime.open(filename);
      try {
        const after: typeof before = {};
        for (const [table, rows] of Object.entries(before)) {
          // The API adds a nullable Dimension tombstone column. Compare all
          // original columns, retaining every original row and reference.
          const projection = rows.length ? Object.keys(rows[0]!).join(',') : '*';
          after[table] = await owner.all(`SELECT ${projection} FROM ${table} ORDER BY 1`);
        }
        const exported = path.join(app.getPath('userData'), 'preservation-export.db');
        fs.writeFileSync(exported, Buffer.from(await owner.exportDatabase()));
        return { before, after, tables };
      } finally {
        await owner.close();
      }
    }, fixture);
    expect(prepared.tables).toEqual(Object.keys(fixture.tables).sort());
    expect(prepared.before.schema_version).toEqual([]);
    const normalized = { ...prepared.before, schema_version: [{ version: 4 }] };
    expect(prepared.after).toEqual(normalized);
    const dir = launch.dir;
    await launch.app.close();
    launch = await launchApp({ dir });
    const restored = await launch.app.evaluate(
      async ({ app }, { fixture, before, ids }) => {
        const path = process.getBuiltinModule('path');
        const fs = process.getBuiltinModule('fs');
        const { createHash } = process.getBuiltinModule('crypto');
        const load = process
          .getBuiltinModule('module')
          .createRequire(path.join(app.getAppPath(), 'package.json'));
        const { LocalGraphRuntime } = load(
          '@cruxgarden/local-api',
        ) as typeof import('@cruxgarden/local-api');
        const owner = await LocalGraphRuntime.open(
          path.join(app.getPath('userData'), 'preservation-export.db'),
        );
        try {
          const rows: typeof before = {};
          for (const [table, values] of Object.entries(before)) {
            const projection = values.length ? Object.keys(values[0]!).join(',') : '*';
            rows[table] = await owner.all(`SELECT ${projection} FROM ${table} ORDER BY 1`);
          }
          const shared = await owner.execute(({ crux }) => crux.findById(ids.shared));
          const edges = await owner.execute(({ dimension }) =>
            dimension.findBySourceIdAndTypeQuery(ids.shared),
          );
          const bytes = fixture.blobs.map((blob) => {
            const content = fs.readFileSync(
              path.join(app.getPath('userData'), 'preservation-blobs', blob.fingerprint),
            );
            return {
              fingerprint: createHash('sha256').update(content).digest('hex'),
              bytes: [...content],
            };
          });
          return {
            rows,
            bytes,
            sharedId: shared.id,
            targets: edges.map((edge) => edge.target_id).sort(),
          };
        } finally {
          await owner.close();
        }
      },
      { fixture, before: normalized, ids: legacyIds },
    );
    expect(restored.rows).toEqual(normalized);
    expect(restored.bytes).toEqual(fixture.blobs);
    expect(restored.sharedId).toBe(legacyIds.shared);
    expect(restored.targets).toEqual(
      [
        legacyIds.base,
        legacyIds.tip,
        legacyIds.private,
        legacyIds.mood,
        toolFunctionIds.tool,
      ].sort(),
    );
  } finally {
    await launch.app.close();
  }
});
