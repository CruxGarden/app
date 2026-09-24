import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

// Real packaged API + native blobs + archive, across independent Electron
// profiles. UI import/folder provisioning are the subsequent adoption gate.
test('a private graph archive crosses clean profiles with shared membership, retained content and idempotent restart', async () => {
  let source = await launchApp();
  const sourceDir = source.dir;
  let destination: Awaited<ReturnType<typeof launchApp>> | undefined;
  try {
    const saved = await source.app.evaluate(async ({ app }) => {
      const path = process.getBuiltinModule('path');
      const fs = process.getBuiltinModule('fs');
      const { createHash, randomUUID } = process.getBuiltinModule('crypto');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { LocalGraphRuntime, CruxKind, DimensionType, packPrivateGraph } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      const { NativeBlobStore } = load('./dist/native-blobs.js');
      const rootPath = app.getPath('userData');
      const blobs = new NativeBlobStore(path.join(rootPath, 'transfer-blobs'));
      const store = {
        read: async (fp: string) => (blobs.blobExists(fp) ? blobs.blobRead(fp) : null),
        write: async (fp: string, bytes: Uint8Array) => {
          blobs.blobWrite(fp, bytes);
        },
      };
      const runtime = await LocalGraphRuntime.create(path.join(rootPath, 'transfer.db'));
      try {
        const identity = { authorId: randomUUID(), homeId: randomUUID() };
        const garden = await runtime.createCrux({
          ...identity,
          slug: 'garden',
          kind: CruxKind.GARDEN,
          meta: {
            mood: { synth: { tracks: [{ volume: 0.4, brightness: 0.2 }] } },
            layout: { panels: ['collaboration', 'artifacts'] },
          },
        });
        const child = await runtime.createCrux({
          ...identity,
          slug: 'child',
          kind: CruxKind.GARDEN,
        });
        const work = await runtime.createCrux({
          ...identity,
          slug: 'work',
          meta: {
            projectFolder: '/source-only/folder',
            settings: { agentSessions: { codex: 'private-session' } },
            messages: [{ role: 'user', content: 'Keep this conversation' }],
          },
        });
        const outside = await runtime.createCrux({
          ...identity,
          slug: 'private-sibling',
          meta: { secret: 'Do not include the sibling' },
        });
        for (const [gardenId, memberId] of [
          [garden, child],
          [garden, work],
          [child, work],
        ])
          await runtime.execute(({ garden: service }) =>
            service.add({ ...identity, gardenId, memberId }),
          );
        await runtime.execute(({ dimension }) =>
          dimension.create({
            ...identity,
            sourceId: work,
            targetId: outside,
            type: DimensionType.GRAFT,
          }),
        );
        const bytes = Uint8Array.of(0, 255, 42, 199);
        const fingerprint = createHash('sha256').update(bytes).digest('hex');
        const file = {
          id: 'stable-file',
          path: 'file.bin',
          fingerprint,
          size: bytes.length,
          encoding: 'binary',
          mimeType: 'application/octet-stream',
          mode: 0o640,
          attributes: { preserve: true },
        };
        const head = await runtime.editFileContent(
          { cruxId: work, expected: null, changes: [{ put: file, bytes }] },
          store,
        );
        const growth = await runtime.createGrowthSnapshot(
          { cruxId: work, expected: head, snapshotId: randomUUID(), parentId: null },
          store,
        );
        const task = randomUUID();
        await runtime.createWorkingCopy({
          id: task,
          taskId: randomUUID(),
          cruxId: work,
          title: 'Saved Task',
          baseSnapshotId: growth.snapshot.id,
          role: 'task',
          meta: { settings: { activeBranch: growth.snapshot.id } },
        });
        const current = new TextEncoder().encode('New Main content');
        await runtime.editFileContent(
          {
            cruxId: work,
            expected: head,
            changes: [
              {
                put: {
                  ...file,
                  size: current.length,
                  fingerprint: createHash('sha256').update(current).digest('hex'),
                },
                bytes: current,
              },
            ],
          },
          store,
        );
        const graph = await runtime.exportPrivateGraph(
          { roots: [garden], includeMembers: true },
          store,
        );
        const archive = await packPrivateGraph(graph, store);
        const archivePath = path.join(rootPath, 'round-trip.crux');
        fs.writeFileSync(archivePath, archive);
        return {
          archivePath,
          garden,
          child,
          work,
          outside,
          task,
          growth: growth.snapshot.id,
          bytes: [...bytes],
          current: [...current],
          graph,
          fingerprint,
          requestId: randomUUID(),
          destinationIdentity: { authorId: randomUUID(), homeId: randomUUID() },
        };
      } finally {
        await runtime.close();
      }
    });
    expect(JSON.stringify(saved.graph)).not.toContain('/source-only');
    expect(JSON.stringify(saved.graph)).not.toContain('private-session');
    expect(JSON.stringify(saved.graph)).not.toContain('Do not include the sibling');
    await source.app.close();
    destination = await launchApp();
    expect(destination.dir).not.toBe(sourceDir);
    const imported = await destination.app.evaluate(async ({ app }, saved) => {
      const path = process.getBuiltinModule('path');
      const fs = process.getBuiltinModule('fs');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { LocalGraphRuntime, openPrivateGraphArchive } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      const { NativeBlobStore } = load('./dist/native-blobs.js');
      const blobs = new NativeBlobStore(path.join(app.getPath('userData'), 'transfer-blobs'));
      const store = {
        read: async (fp: string) => (blobs.blobExists(fp) ? blobs.blobRead(fp) : null),
        write: async (fp: string, bytes: Uint8Array) => {
          blobs.blobWrite(fp, bytes);
        },
      };
      const runtime = await LocalGraphRuntime.create(
        path.join(app.getPath('userData'), 'transfer.db'),
      );
      try {
        const archive = await openPrivateGraphArchive(fs.readFileSync(saved.archivePath));
        const request = {
          requestId: saved.requestId,
          mode: 'copy' as const,
          destination: saved.destinationIdentity,
          graph: archive.graph,
        };
        let refused = '';
        try {
          await runtime.importPrivateGraph(
            request,
            { read: async (fp) => (fp === saved.fingerprint ? null : archive.content.read(fp)) },
            store,
          );
        } catch (error) {
          refused = (error as Error).message;
        }
        const afterFailure = await runtime.all('SELECT id FROM cruxes');
        const result = await runtime.importPrivateGraph(request, archive.content, store);
        const graph = await runtime.exportPrivateGraph(
          { roots: result.roots, includeMembers: true },
          store,
        );
        const historical = await runtime.readFileContent(
          {
            cruxId: result.ids[saved.growth],
            expected: (await runtime.fileContentHead(result.ids[saved.growth]))!,
            path: 'file.bin',
          },
          store,
        );
        return {
          refused,
          afterFailure,
          result,
          graph,
          historical: [...historical!.bytes],
          artifacts: await runtime.all('SELECT id FROM artifacts'),
        };
      } finally {
        await runtime.close();
      }
    }, saved);
    expect(imported.refused).toContain('Missing content');
    expect(imported.afterFailure).toEqual([]);
    expect(imported.historical).toEqual(saved.bytes);
    expect(imported.artifacts).toEqual([]);
    expect(
      imported.graph.dimensions.filter((edge) => edge.targetId === imported.result.ids[saved.work]),
    ).toHaveLength(2);
    expect(imported.graph.boundary[0].targetId).toBe(saved.outside);
    const dir = destination.dir;
    await destination.app.close();
    destination = await launchApp({ dir });
    const restarted = await destination.app.evaluate(async ({ app }, saved) => {
      const path = process.getBuiltinModule('path');
      const fs = process.getBuiltinModule('fs');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { LocalGraphRuntime, openPrivateGraphArchive } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      const { NativeBlobStore } = load('./dist/native-blobs.js');
      const blobs = new NativeBlobStore(path.join(app.getPath('userData'), 'transfer-blobs'));
      const store = {
        read: async (fp: string) => (blobs.blobExists(fp) ? blobs.blobRead(fp) : null),
        write: async (fp: string, bytes: Uint8Array) => {
          blobs.blobWrite(fp, bytes);
        },
      };
      const runtime = await LocalGraphRuntime.open(
        path.join(app.getPath('userData'), 'transfer.db'),
      );
      try {
        const archive = await openPrivateGraphArchive(fs.readFileSync(saved.archivePath));
        const result = await runtime.importPrivateGraph(
          {
            requestId: saved.requestId,
            mode: 'copy',
            destination: saved.destinationIdentity,
            graph: archive.graph,
          },
          archive.content,
          store,
        );
        const graph = await runtime.exportPrivateGraph(
          { roots: result.roots, includeMembers: true },
          store,
        );
        const contents = [];
        for (const original of [saved.work, saved.task, saved.growth]) {
          const id = result.ids[original];
          const file = await runtime.readFileContent(
            { cruxId: id, expected: (await runtime.fileContentHead(id))!, path: 'file.bin' },
            store,
          );
          contents.push([...file!.bytes]);
        }
        return {
          result,
          graph,
          contents,
          artifacts: await runtime.all('SELECT id FROM artifacts'),
        };
      } finally {
        await runtime.close();
      }
    }, saved);
    expect(restarted.result).toEqual(imported.result);
    expect(restarted.graph).toEqual(imported.graph);
    expect(restarted.contents).toEqual([saved.current, saved.bytes, saved.bytes]);
    expect(restarted.artifacts).toEqual([]);
  } finally {
    await source.app.close().catch(() => {});
    await destination?.app.close().catch(() => {});
  }
});
