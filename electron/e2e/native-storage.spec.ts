import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { legacyProfile, legacyIds } from '../../src/test/fixtures/unification/legacy-profile';

test('native tools resolve Main and ready Task folders through the actual queued API', async () => {
  const launch = await launchApp();
  try {
    const result = await launch.app.evaluate(
      async ({ app }, { fixture, ids }) => {
        const path = process.getBuiltinModule('path');
        const load = process
          .getBuiltinModule('module')
          .createRequire(path.join(app.getAppPath(), 'package.json'));
        const { SqliteNative } = load('./dist/sqlite-native.js');
        const { lookupProjectCrux } = load(
          './dist/native-storage.js',
        ) as typeof import('../src/native-storage');
        const { LocalGraphRuntime } = load(
          '@cruxgarden/local-api',
        ) as typeof import('@cruxgarden/local-api');
        const filename = path.join(app.getPath('userData'), 'native-lookup.db');
        const seed = new SqliteNative(filename, path.join(app.getPath('userData'), 'lookup-blobs'));
        try {
          for (const [table, rows] of Object.entries(fixture.tables)) {
            for (const row of rows) {
              const columns = Object.keys(row);
              seed.run(
                `INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
                Object.values(row),
              );
            }
          }
        } finally {
          seed.close();
        }
        const owner = await LocalGraphRuntime.open(filename);
        const mainFolder = path.join(app.getPath('userData'), 'Main');
        const taskFolder = path.join(app.getPath('userData'), 'Task');
        try {
          await owner.run('UPDATE cruxes SET meta = ? WHERE id = ?', [
            { projectFolder: mainFolder },
            ids.shared,
          ]);
          await owner.run(
            "UPDATE working_copies SET project_folder = ?, role = 'task' WHERE id = ?",
            [taskFolder, ids.copy],
          );
          const main = await lookupProjectCrux(owner, ids.shared);
          const task = await lookupProjectCrux(owner, ids.copy);
          await owner.run("UPDATE working_copies SET phase = 'failed' WHERE id = ?", [ids.copy]);
          const unavailable = await lookupProjectCrux(owner, ids.copy);
          await owner.run("UPDATE working_copies SET phase = 'ready' WHERE id = ?", [ids.copy]);
          await owner.run('UPDATE cruxes SET deleted = ? WHERE id = ?', [
            new Date().toISOString(),
            ids.shared,
          ]);
          const deletedMain = await lookupProjectCrux(owner, ids.shared);
          const deletedOwnerTask = await lookupProjectCrux(owner, ids.copy);
          await owner.run('UPDATE cruxes SET deleted = NULL, meta = ? WHERE id = ?', [
            'bad json',
            ids.shared,
          ]);
          const invalidMeta = await lookupProjectCrux(owner, ids.shared);
          const folderless = await lookupProjectCrux(owner, ids.private);
          return {
            mainFolder,
            taskFolder,
            main,
            task,
            unavailable,
            deletedMain,
            deletedOwnerTask,
            invalidMeta,
            folderless,
          };
        } finally {
          await owner.close();
        }
      },
      { fixture: legacyProfile(), ids: legacyIds },
    );
    expect(result.main).toMatchObject({ slug: legacyIds.shared, folder: result.mainFolder });
    expect(result.task).toEqual({
      slug: `task-${legacyIds.copy}`,
      title: 'Review',
      folder: result.taskFolder,
    });
    for (const key of [
      'unavailable',
      'deletedMain',
      'deletedOwnerTask',
      'invalidMeta',
      'folderless',
    ] as const)
      expect(result[key], key).toBeNull();
  } finally {
    await launch.app.close();
  }
});
