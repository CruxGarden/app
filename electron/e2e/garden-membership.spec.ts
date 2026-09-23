import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

test('actual API membership commands preserve a shared Crux across unlink and desktop restart', async () => {
  let launch = await launchApp();
  try {
    const result = await launch.app.evaluate(async ({ app }) => {
      const path = process.getBuiltinModule('path');
      const { randomUUID } = process.getBuiltinModule('crypto');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { SqliteNative } = load('./dist/sqlite-native.js');
      const { LocalGraphRuntime, CruxKind } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      const filename = path.join(app.getPath('userData'), 'membership.db');
      const seed = new SqliteNative(
        filename,
        path.join(app.getPath('userData'), 'membership-blobs'),
      );
      seed.close();
      const runtime = await LocalGraphRuntime.open(filename);
      try {
        const authorId = randomUUID();
        const homeId = randomUUID();
        const ids = await runtime.execute(async ({ crux, garden }) => {
          const make = (title: string, kind: typeof CruxKind.GARDEN | typeof CruxKind.WEBAPP) =>
            crux.create({ title, kind, slug: randomUUID(), authorId, homeId });
          const root = await make('Home', CruxKind.GARDEN);
          const studio = await make('Studio', CruxKind.GARDEN);
          const library = await make('Library', CruxKind.GARDEN);
          const poster = await make('Poster', CruxKind.WEBAPP);
          for (const [source, target] of [
            [root, studio],
            [root, library],
            [studio, poster],
            [library, poster],
          ])
            await garden.add({ gardenId: source.id, memberId: target.id, authorId, homeId });
          return { root: root.id, studio: studio.id, library: library.id, poster: poster.id };
        });
        const repeated = await Promise.all(
          Array.from({ length: 4 }, () =>
            runtime.addGardenMember({
              gardenId: ids.studio,
              memberId: ids.poster,
              authorId,
              homeId,
            }),
          ),
        );
        let cycle = '';
        try {
          await runtime.addGardenMember({
            gardenId: ids.studio,
            memberId: ids.root,
            authorId,
            homeId,
          });
        } catch (error) {
          cycle = (error as Error).message;
        }
        const edges = await runtime.all(
          'SELECT source_id, target_id, type, kind FROM dimensions WHERE deleted IS NULL',
        );
        const root = await runtime.listGardenMembers(ids.root);
        await runtime.removeGardenMember(ids.studio, ids.poster);
        return {
          ids,
          cycle,
          repeated: repeated.map((edge) => edge.id),
          edges,
          root: root.items.map((item) => item.title).sort(),
        };
      } finally {
        await runtime.close();
      }
    });
    expect(result.cycle).toContain('cycle');
    expect(new Set(result.repeated).size).toBe(1);
    expect(result.edges).toHaveLength(4);
    for (const edge of result.edges)
      expect(edge).toMatchObject({ type: 'garden', kind: 'membership' });
    expect(result.root).toEqual(['Library', 'Studio']);
    const dir = launch.dir;
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
        path.join(app.getPath('userData'), 'membership.db'),
      );
      try {
        const studio = await runtime.listGardenMembers(ids.studio);
        const library = await runtime.listGardenMembers(ids.library);
        const poster = await runtime.execute(({ crux }) => crux.findById(ids.poster));
        return {
          studio: studio.items,
          library: library.items.map((item) => item.id),
          poster: poster.title,
          count: (await runtime.all('SELECT id FROM cruxes')).length,
        };
      } finally {
        await runtime.close();
      }
    }, result.ids);
    expect(restored).toEqual({
      studio: [],
      library: [result.ids.poster],
      poster: 'Poster',
      count: 4,
    });
  } finally {
    await launch.app.close();
  }
});
