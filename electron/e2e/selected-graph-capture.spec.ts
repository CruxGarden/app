import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

// Host-contract test: the actual API package and native Blob Store, in an
// isolated database. This does not claim that the .crux UI format has switched.
test('the packaged API captures a shared Garden graph and retained Task content through process restart and content refusal', async () => {
  let launch = await launchApp();
  const dir = launch.dir;
  try {
    const saved = await launch.app.evaluate(async ({ app }) => {
      const path = process.getBuiltinModule('path');
      const { randomUUID, createHash } = process.getBuiltinModule('crypto');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { LocalGraphRuntime, CruxKind, DimensionType } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      const { NativeBlobStore } = load('./dist/native-blobs.js');
      const blobs = new NativeBlobStore(path.join(app.getPath('userData'), 'selected-graph-blobs'));
      const store = {
        read: async (fp: string) => (blobs.blobExists(fp) ? blobs.blobRead(fp) : null),
        write: async (fp: string, bytes: Uint8Array) => {
          blobs.blobWrite(fp, bytes);
        },
      };
      const runtime = await LocalGraphRuntime.create(
        path.join(app.getPath('userData'), 'selected-graph.db'),
      );
      try {
        const identity = { authorId: randomUUID(), homeId: randomUUID() };
        const root = await runtime.createCrux({
          ...identity,
          slug: 'garden',
          kind: CruxKind.GARDEN,
        });
        const child = await runtime.createCrux({
          ...identity,
          slug: 'child',
          kind: CruxKind.GARDEN,
        });
        const work = await runtime.createCrux({
          ...identity,
          slug: 'work',
          meta: { messages: [{ role: 'user', content: 'Keep the story' }] },
        });
        const outside = await runtime.createCrux({
          ...identity,
          slug: 'private-sibling',
          meta: { private: 'Do not include this' },
        });
        for (const [gardenId, memberId] of [
          [root, child],
          [root, work],
          [child, work],
        ])
          await runtime.execute(({ garden }) => garden.add({ ...identity, gardenId, memberId }));
        await runtime.execute(({ dimension }) =>
          dimension.create({
            ...identity,
            sourceId: work,
            targetId: outside,
            type: DimensionType.GRAFT,
          }),
        );
        const bytes = Uint8Array.from([0, 255, 17, 42]);
        const fingerprint = createHash('sha256').update(bytes).digest('hex');
        const entry = {
          id: 'document',
          path: 'file.bin',
          fingerprint,
          size: bytes.length,
          mimeType: 'application/octet-stream',
          encoding: 'binary',
          mode: 0o640,
          attributes: { custom: 'preserved' },
        };
        const first = await runtime.editFileContent(
          { cruxId: work, expected: null, changes: [{ put: entry, bytes }] },
          store,
        );
        const snapshot = await runtime.createGrowthSnapshot(
          { cruxId: work, expected: first, snapshotId: randomUUID(), parentId: null },
          store,
        );
        const task = randomUUID();
        await runtime.createWorkingCopy({
          id: task,
          cruxId: work,
          taskId: randomUUID(),
          title: 'Task',
          baseSnapshotId: snapshot.snapshot.id,
          role: 'task',
          meta: {},
        });
        const later = new TextEncoder().encode('Current Main');
        await runtime.editFileContent(
          {
            cruxId: work,
            expected: first,
            changes: [
              {
                put: {
                  ...entry,
                  fingerprint: createHash('sha256').update(later).digest('hex'),
                  size: later.length,
                },
                bytes: later,
              },
            ],
          },
          store,
        );
        const capture = await runtime.captureSelectedGraph(
          { roots: [root], includeMembers: true },
          store,
        );
        return {
          root,
          child,
          work,
          outside,
          task,
          snapshot: snapshot.snapshot.id,
          fingerprint,
          bytes: [...bytes],
          capture,
        };
      } finally {
        await runtime.close();
      }
    });
    expect(saved.capture.cruxes.map((node) => node.id).sort()).toEqual(
      [saved.root, saved.child, saved.work, saved.snapshot].sort(),
    );
    expect(saved.capture.dimensions.filter((edge) => edge.targetId === saved.work)).toHaveLength(2);
    expect(saved.capture.workingCopies).toMatchObject([
      { id: saved.task, baseSnapshotId: saved.snapshot },
    ]);
    expect(saved.capture.contentHeads).toHaveLength(3);
    expect(saved.capture.fingerprints).toContain(saved.fingerprint);
    expect(JSON.stringify(saved.capture)).not.toContain('Do not include this');
    await launch.app.close();
    launch = await launchApp({ dir });
    const restarted = await launch.app.evaluate(async ({ app }, saved) => {
      const path = process.getBuiltinModule('path');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { LocalGraphRuntime } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      const { NativeBlobStore } = load('./dist/native-blobs.js');
      const blobs = new NativeBlobStore(path.join(app.getPath('userData'), 'selected-graph-blobs'));
      const store = {
        read: async (fp: string) => (blobs.blobExists(fp) ? blobs.blobRead(fp) : null),
      };
      const runtime = await LocalGraphRuntime.open(
        path.join(app.getPath('userData'), 'selected-graph.db'),
      );
      try {
        const selection = { roots: [saved.root], includeMembers: true };
        const before = await runtime.captureSelectedGraph(selection, store);
        blobs.blobDelete(saved.fingerprint);
        let error = '';
        try {
          await runtime.captureSelectedGraph(selection, store);
        } catch (caught) {
          error = (caught as Error).message;
        }
        blobs.blobWrite(saved.fingerprint, Uint8Array.from(saved.bytes));
        const after = await runtime.captureSelectedGraph(selection, store);
        const historical = await runtime.readFileContent(
          {
            cruxId: saved.snapshot,
            expected: before.contentHeads.find((head) => head.cruxId === saved.snapshot)!,
            path: 'file.bin',
          },
          store,
        );
        return {
          before,
          after,
          error,
          historical: [...historical!.bytes],
          artifacts: await runtime.all('SELECT id FROM artifacts'),
        };
      } finally {
        await runtime.close();
      }
    }, saved);
    expect(restarted.before).toEqual(saved.capture);
    expect(restarted.error).toContain('Missing content');
    expect(restarted.after).toEqual(saved.capture);
    expect(restarted.historical).toEqual(saved.bytes);
    expect(restarted.artifacts).toEqual([]);
  } finally {
    await launch.app.close();
  }
});
