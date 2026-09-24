import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

// Real packaged API + native blobs + archive, across independent Electron
// profiles, including verified destination Project Folders. Renderer UI adoption remains separate.
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
            gardenCollaboration: {
              version: 1,
              model: 'claude-sonnet-5',
              activeId: 'conversation-one',
              conversations: [
                {
                  id: 'conversation-one',
                  title: 'Private Garden idea',
                  createdAt: 1,
                  messages: [
                    {
                      role: 'user',
                      content: 'Private Garden conversation travels only in this backup.',
                    },
                  ],
                },
              ],
            },
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
      const { openPrivateGraphArchive } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      const { SqliteApi } = load('./dist/sqlite-api.js') as typeof import('../src/sqlite-api');
      const { importedWorkspacePreparer } = load(
        './dist/import-workspaces.js',
      ) as typeof import('../src/import-workspaces');
      const { DesktopConfig, ProjectFolders } = load(
        './dist/projects.js',
      ) as typeof import('../src/projects');
      const JSZip = load('jszip');
      const blobDir = path.join(app.getPath('userData'), 'transfer-blobs');
      const runtime = await SqliteApi.open(
        path.join(app.getPath('userData'), 'transfer.db'),
        blobDir,
      );
      const projects = new ProjectFolders(new DesktopConfig(app.getPath('userData')));
      const prepare = importedWorkspacePreparer(projects, blobDir);
      runtime.setImportHost(prepare);
      try {
        const bytes = fs.readFileSync(saved.archivePath);
        const broken = await JSZip.loadAsync(bytes);
        broken.remove(`content/${saved.fingerprint}`);
        const request = {
          requestId: saved.requestId,
          mode: 'copy' as const,
          destination: saved.destinationIdentity,
        };
        let refused = '';
        try {
          await runtime.importPrivateArchive(
            await broken.generateAsync({ type: 'uint8array' }),
            request,
          );
        } catch (error) {
          refused = (error as Error).message;
        }
        const afterFailure = await runtime.all('SELECT id FROM cruxes');
        const materialize = projects.materialize.bind(projects);
        let renamed = false;
        projects.materialize = (folder, blobPath, entries) => {
          const count = materialize(folder, blobPath, entries);
          if (!renamed && entries.length) {
            renamed = true;
            fs.renameSync(path.join(folder, 'file.bin'), path.join(folder, 'FILE.bin'));
          }
          return count;
        };
        let physicalError = '';
        try {
          await runtime.importPrivateArchive(bytes, request);
        } catch (error) {
          physicalError = (error as Error).message;
        }
        const afterPhysicalFailure = await runtime.all('SELECT id FROM cruxes');
        projects.materialize = materialize;
        let preparedFolder = '';
        runtime.setImportHost(async (workspace) => {
          const folder = await prepare(workspace);
          if (workspace.role === 'task') {
            preparedFolder = folder;
            throw new Error('Injected host preparation refusal');
          }
          return folder;
        });
        let preparationError = '';
        try {
          await runtime.importPrivateArchive(bytes, request);
        } catch (error) {
          preparationError = (error as Error).message;
        }
        const afterPreparationFailure = await runtime.all('SELECT id FROM cruxes');
        runtime.setImportHost(prepare);
        const result = await runtime.importPrivateArchive(bytes, request);
        const graph = (
          await openPrivateGraphArchive(
            await runtime.exportPrivateArchive({ roots: result.roots, includeMembers: true }),
          )
        ).graph;
        const historical = await runtime.fileContent.read({
          cruxId: result.ids[saved.growth],
          expected: (await runtime.fileContent.head(result.ids[saved.growth]))!,
          path: 'file.bin',
        });
        const work = await runtime.get<{ meta: string }>('SELECT meta FROM cruxes WHERE id = ?', [
          result.ids[saved.work],
        ]);
        const folder = JSON.parse(work!.meta).projectFolder;
        const task = await runtime.get<{ project_folder: string; phase: string }>(
          'SELECT project_folder, phase FROM working_copies WHERE id = ?',
          [result.ids[saved.task]],
        );
        const snapshot = await runtime.get<{ meta: string }>(
          'SELECT meta FROM cruxes WHERE id = ?',
          [result.ids[saved.growth]],
        );
        return {
          refused,
          afterFailure,
          preparationError,
          afterPreparationFailure,
          physicalError,
          afterPhysicalFailure,
          preservedPreparedBytes: [...fs.readFileSync(path.join(preparedFolder, 'file.bin'))],
          result,
          graph,
          historical: [...historical!.bytes],
          folder,
          task,
          physical: [...fs.readFileSync(path.join(folder, 'file.bin'))],
          taskPhysical: [...fs.readFileSync(path.join(task!.project_folder, 'file.bin'))],
          mode: fs.statSync(path.join(folder, 'file.bin')).mode & 0o777,
          snapshotFolder: JSON.parse(snapshot!.meta).projectFolder ?? null,
          artifacts: await runtime.all('SELECT id FROM artifacts'),
        };
      } finally {
        await runtime.close();
      }
    }, saved);
    expect(imported.refused).toContain('Missing private archive content');
    expect(imported.physicalError).not.toBe('');
    expect(imported.afterPhysicalFailure).toEqual([]);
    expect(imported.preparationError).toContain('Injected host preparation refusal');
    expect(imported.afterPreparationFailure).toEqual([]);
    expect(imported.preservedPreparedBytes).toEqual(saved.bytes);
    expect(imported.physical).toEqual(saved.current);
    expect(imported.taskPhysical).toEqual(saved.bytes);
    expect(imported.task!.phase).toBe('ready');
    expect(imported.task!.project_folder).not.toBe(imported.folder);
    expect(imported.snapshotFolder).toBeNull();
    if (process.platform !== 'win32') expect(imported.mode).toBe(0o640);
    expect(imported.afterFailure).toEqual([]);
    expect(imported.historical).toEqual(saved.bytes);
    expect(imported.artifacts).toEqual([]);
    expect(
      imported.graph.dimensions.filter((edge) => edge.targetId === imported.result.ids[saved.work]),
    ).toHaveLength(2);
    expect(imported.graph.boundary[0].targetId).toBe(saved.outside);
    expect(
      imported.graph.cruxes.find((crux) => crux.id === imported.result.ids[saved.garden])?.meta
        .gardenCollaboration,
    ).toEqual({
      version: 1,
      model: 'claude-sonnet-5',
      activeId: 'conversation-one',
      conversations: [
        {
          id: 'conversation-one',
          title: 'Private Garden idea',
          createdAt: 1,
          messages: [
            { role: 'user', content: 'Private Garden conversation travels only in this backup.' },
          ],
        },
      ],
    });
    const dir = destination.dir;
    await destination.app.close();
    destination = await launchApp({ dir });
    const restarted = await destination.app.evaluate(async ({ app }, saved) => {
      const path = process.getBuiltinModule('path');
      const fs = process.getBuiltinModule('fs');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { openPrivateGraphArchive } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      const { SqliteApi } = load('./dist/sqlite-api.js') as typeof import('../src/sqlite-api');
      const blobDir = path.join(app.getPath('userData'), 'transfer-blobs');
      const runtime = await SqliteApi.open(
        path.join(app.getPath('userData'), 'transfer.db'),
        blobDir,
      );
      runtime.setImportHost(async () => {
        throw new Error('A receipt must not prepare another folder');
      });
      try {
        const result = await runtime.importPrivateArchive(fs.readFileSync(saved.archivePath), {
          requestId: saved.requestId,
          mode: 'copy',
          destination: saved.destinationIdentity,
        });
        const graph = (
          await openPrivateGraphArchive(
            await runtime.exportPrivateArchive({ roots: result.roots, includeMembers: true }),
          )
        ).graph;
        const contents = [];
        for (const original of [saved.work, saved.task, saved.growth]) {
          const id = result.ids[original];
          const file = await runtime.fileContent.read({
            cruxId: id,
            expected: (await runtime.fileContent.head(id))!,
            path: 'file.bin',
          });
          contents.push([...file!.bytes]);
        }
        const work = await runtime.get<{ meta: string }>('SELECT meta FROM cruxes WHERE id = ?', [
          result.ids[saved.work],
        ]);
        const folder = JSON.parse(work!.meta).projectFolder;
        const task = await runtime.get<{ project_folder: string; phase: string }>(
          'SELECT project_folder, phase FROM working_copies WHERE id = ?',
          [result.ids[saved.task]],
        );
        return {
          result,
          graph,
          contents,
          folder,
          task,
          physical: [...fs.readFileSync(path.join(folder, 'file.bin'))],
          artifacts: await runtime.all('SELECT id FROM artifacts'),
        };
      } finally {
        await runtime.close();
      }
    }, saved);
    expect(restarted.folder).toBe(imported.folder);
    expect(restarted.task).toEqual(imported.task);
    expect(restarted.physical).toEqual(saved.current);
    expect(restarted.result).toEqual(imported.result);
    expect(restarted.graph).toEqual(imported.graph);
    expect(restarted.contents).toEqual([saved.current, saved.bytes, saved.bytes]);
    expect(restarted.artifacts).toEqual([]);
  } finally {
    await source.app.close().catch(() => {});
    await destination?.app.close().catch(() => {});
  }
});
