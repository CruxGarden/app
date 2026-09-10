import { expect, test } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import JSZip from 'jszip';
import { initServices } from '../src/services';
import { exportCrux, importCrux } from '../src/services/crux-io';
import { getSqliteClient, setSqliteClient } from '../src/services/sqlite/client';
import { createTestSqliteClient } from '../src/test/sqlite-client';
import { artifactsToTreeData, type TreeNodeData } from '../src/components/artifacts/treeData';
import { pathOf } from '../src/lib/artifact-path';
import type { Artifact } from '../src/api/types';
import { sizes, snapshots, fileBytes, pathFor, contentFor, hash } from './fixture';

const signature = (artifacts: Artifact[]) =>
  artifacts
    .map((a) => [pathOf(a), a.fingerprint])
    .sort(([a], [b]) => String(a).localeCompare(String(b)));

for (const count of sizes)
  test(`${count} nested Artifacts retain content and Growth through export and fresh import`, async () => {
    const phases: Record<string, unknown>[] = [];
    const report: Record<string, unknown> = {
      backend: 'sql.js in-memory SQLite + Map Blob Store (not native desktop I/O)',
      count,
      snapshots,
      fileBytes,
      phases,
      startedAt: new Date().toISOString(),
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      cpu: cpus()[0]?.model,
      hostMemoryBytes: totalmem(),
    };
    async function measure<T>(name: string, action: () => Promise<T> | T): Promise<T> {
      const phase: Record<string, unknown> = { name };
      phases.push(phase);
      console.log(JSON.stringify({ count, phase: name, status: 'started' }));
      const startMemory = process.memoryUsage();
      const start = performance.now();
      try {
        const result = await action();
        phase.status = 'passed';
        return result;
      } catch (error) {
        phase.status = 'failed';
        phase.error = String(error);
        throw error;
      } finally {
        phase.durationMs = Math.round(performance.now() - start);
        phase.memoryBefore = startMemory;
        phase.memoryAfter = process.memoryUsage();
        // Endpoint observations only: synchronous work can prevent peak sampling.
        console.log(JSON.stringify({ count, ...phase }));
      }
    }
    try {
      const services = await initServices('local');
      const crux = await services.crux.create({ title: `Storage ${count}`, type: 'workspace' });
      await measure('create-artifacts', async () => {
        for (let i = 0; i < count; i++)
          await services.artifact.create({
            resourceId: crux.id,
            content: contentFor(i, 0),
            mimeType: 'text/markdown',
            meta: { path: pathFor(i) },
          });
      });
      const artifacts = await measure('load-file-list', () =>
        services.artifact.findByResource('crux', crux.id),
      );
      expect(artifacts).toHaveLength(count);
      const tree = await measure('build-folder-tree', () => artifactsToTreeData(artifacts));
      const paths: string[] = [];
      function walk(nodes: TreeNodeData[]) {
        for (const node of nodes) {
          if (node.children) walk(node.children);
          else paths.push(node.path);
        }
      }
      walk(tree);
      expect(paths.sort()).toEqual(Array.from({ length: count }, (_, i) => pathFor(i)).sort());

      // Native desktop tests can import this production-generated fixture to
      // measure later operations independently of the external-write watcher.
      mkdirSync('performance/.results', { recursive: true });
      const seed = await exportCrux({ cruxId: crux.id });
      expect(seed.failed).toEqual([]);
      writeFileSync(
        `performance/.results/seed-${count}.crux`,
        Buffer.from(await seed.blob.arrayBuffer()),
      );

      const history: ReturnType<typeof signature>[] = [];
      let parentCruxId: string | null = null;
      for (let revision = 0; revision < snapshots; revision++) {
        if (revision > 0)
          await measure(`edit-one-percent-${revision}`, async () => {
            for (let i = 0; i < Math.max(1, Math.floor(count / 100)); i++)
              await services.artifact.create({
                resourceId: crux.id,
                content: contentFor(i, revision),
                meta: { path: pathFor(i) },
              });
          });
        const snapshot = await services.crux.create({
          type: 'crux',
          kind: 'snapshot',
          title: `Checkpoint ${revision}`,
          meta: { parentCruxId, messages: [{ role: 'user', content: `Revision ${revision}` }] },
        });
        await measure(`snapshot-file-records-${revision}`, async () => {
          await services.artifact.computeSnapshotFingerprint(crux.id);
          await services.artifact.cloneArtifactsToSnapshot(crux.id, snapshot.id);
          await services.dimension.create({
            sourceId: crux.id,
            targetId: snapshot.id,
            type: 'growth',
            weight: revision,
          });
        });
        const rows = await services.artifact.findByResource('crux', snapshot.id);
        expect(rows).toHaveLength(count);
        const expected = Array.from({ length: count }, (_, i) => [
          pathFor(i),
          hash(contentFor(i, i < Math.max(1, Math.floor(count / 100)) ? revision : 0)),
        ]).sort(([a], [b]) => a!.localeCompare(b!));
        expect(signature(rows)).toEqual(expected);
        history.push(signature(rows));
        parentCruxId = snapshot.id;
      }
      const current = signature(await services.artifact.findByResource('crux', crux.id));
      report.sqliteBytesBeforeExport = (await getSqliteClient().export()).byteLength;
      report.fileReferences = count * (snapshots + 1);
      const exported = await measure('export-crux', () => exportCrux({ cruxId: crux.id }));
      expect(exported.failed).toEqual([]);
      report.archiveBytes = exported.blob.size;
      const data = await exported.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(data);
      const blobEntries = Object.values(zip.files).filter(
        (f) => !f.dir && f.name.startsWith('artifacts/'),
      );
      const uniqueBlobs = count + (snapshots - 1) * Math.max(1, Math.floor(count / 100));
      expect(blobEntries).toHaveLength(uniqueBlobs);
      report.uniqueBlobs = uniqueBlobs;
      const firstFp = hash(contentFor(0, 0));
      expect(await zip.file(`artifacts/${firstFp}`)!.async('text')).toBe(contentFor(0, 0));

      // Swap BOTH stores. A successful import cannot rely on pre-existing blobs.
      await getSqliteClient().close();
      setSqliteClient(await createTestSqliteClient());
      const imported = await measure('fresh-store-import', () => importCrux({ data }));
      expect(imported.failedArtifacts).toEqual([]);
      const rows = await services.artifact.findByResource('crux', imported.cruxId);
      expect(signature(rows)).toEqual(current);
      const nodes = (await services.dimension.findBySourceAndType(imported.cruxId, 'growth')).sort(
        (a, b) => (a.weight ?? 0) - (b.weight ?? 0),
      );
      expect(nodes).toHaveLength(snapshots);
      for (let i = 0; i < snapshots; i++) {
        const rows = await services.artifact.findByResource('crux', nodes[i]!.targetId);
        expect(signature(rows)).toEqual(history[i]);
        const first = rows.find((a) => pathOf(a) === pathFor(0))!;
        expect(await services.artifact.readContent(first.id)).toBe(contentFor(0, i));
      }
      for (const index of [...new Set([0, Math.min(9, count - 1), count - 1])]) {
        const row = rows.find((a) => pathOf(a) === pathFor(index))!;
        expect(hash(await services.artifact.readContent(row.id))).toBe(row.fingerprint);
      }
      report.status = 'passed';
    } finally {
      report.status ??= 'failed';
      mkdirSync('performance/.results', { recursive: true });
      writeFileSync(`performance/.results/storage-${count}.json`, JSON.stringify(report, null, 2));
      await getSqliteClient().close();
    }
  });
