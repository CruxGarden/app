import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import {
  sizes,
  snapshots,
  fileBytes,
  phaseTimeout,
  hash,
  pathFor,
  contentFor,
} from '../../performance/fixture';
import { cpus, totalmem } from 'node:os';
import JSZip from 'jszip';
import { launchApp } from '../e2e/launch';
import { enterGarden, createCrux, storedCrux } from '../e2e/multi-crux-helpers';

type FileRow = { path: string; fingerprint: string };
async function files(page: Page, id: string): Promise<FileRow[]> {
  return page.evaluate(
    async (id) =>
      window.electronAPI!.sqlite.all(
        "SELECT path, fingerprint FROM artifacts WHERE resource_id = ? AND path LIKE 'notes/%.md' ORDER BY path",
        [id],
      ),
    id,
  ) as Promise<FileRow[]>;
}
async function pane(page: Page, name: string, toggle: string) {
  if (!(await page.getByTestId(`pane-body-${name}`).isVisible()))
    await page.getByRole('button', { name: toggle, exact: true }).click();
  await expect(page.getByTestId(`pane-body-${name}`)).toBeVisible();
}

async function noteCount(page: Page, id: string) {
  return page.evaluate(async (id) => {
    const row = (await window.electronAPI!.sqlite.get(
      "SELECT COUNT(*) AS n FROM artifacts WHERE resource_id = ? AND path LIKE 'notes/%.md'",
      [id],
    )) as { n: number };
    return row.n;
  }, id);
}

const seedMode = process.env.CRUX_PERF_SEED ?? 'burst';
if (!['burst', 'archive'].includes(seedMode))
  throw new Error('CRUX_PERF_SEED must be burst or archive');

for (const count of sizes)
  test(`${count} nested files (${seedMode}): ingest, browse, snapshot, export, fresh import`, async ({
    browserName: _browserName,
  }, testInfo) => {
    let instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    let closed = false;
    const phases: Record<string, unknown>[] = [];
    const rendererErrors: string[] = [];
    function captureErrors(page: Page) {
      const record = (message: string) => {
        if (rendererErrors.length < 50) rendererErrors.push(message.slice(0, 2000));
      };
      page.on('pageerror', (error) => record(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') record(message.text());
      });
    }
    captureErrors(instance.page);
    const report: Record<string, unknown> = {
      count,
      seedMode,
      fileBytes,
      snapshots,
      phaseTimeoutMs: phaseTimeout,
      changedFiles: Math.max(1, Math.floor(count / 100)),
      platform: process.platform,
      architecture: process.arch,
      cpu: cpus()[0]?.model,
      hostMemoryBytes: totalmem(),
      node: process.version,
      phases,
      rendererErrors,
      startedAt: new Date().toISOString(),
    };
    // Samples all Electron processes. Sum can double-count shared pages; this is
    // sampled working-set memory, NOT a precise heap peak or a leak measurement.
    async function measure<T>(name: string, action: () => Promise<T>): Promise<T> {
      const phase: Record<string, unknown> = { name };
      phases.push(phase);
      console.log(JSON.stringify({ count, phase: name, status: 'started' }));
      let peak = 0;
      let samples = 0;
      let sampling = false;
      const sample = async () => {
        if (sampling) return;
        sampling = true;
        try {
          const kb = await instance.app.evaluate(({ app }) =>
            app
              .getAppMetrics()
              .reduce(
                (sum: number, p: { memory: { workingSetSize: number } }) =>
                  sum + p.memory.workingSetSize,
                0,
              ),
          );
          peak = Math.max(peak, kb * 1024);
          samples++;
        } finally {
          sampling = false;
        }
      };
      await sample();
      const timer = setInterval(() => {
        void sample().catch(() => {});
      }, 1000);
      const start = performance.now();
      try {
        const value = await action();
        phase.status = 'passed';
        return value;
      } catch (error) {
        phase.status = 'failed';
        phase.error = String(error);
        throw error;
      } finally {
        phase.durationMs = Math.round(performance.now() - start);
        clearInterval(timer);
        await sample().catch(() => {});
        phase.sampledElectronWorkingSetBytes = peak;
        phase.memorySamples = samples;
        console.log(JSON.stringify({ count, ...phase }));
      }
    }
    try {
      let page = instance.page;
      page.setDefaultTimeout(60_000);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await enterGarden(page);
      let id: string;
      if (seedMode === 'archive') {
        await measure('initial-archive-import', async () => {
          const archive = join(__dirname, '../../performance/.results', `seed-${count}.crux`);
          expect(
            statSync(archive).size,
            'Run the storage benchmark first to create this fixture',
          ).toBeGreaterThan(0);
          await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
          const [chooser] = await Promise.all([
            page.waitForEvent('filechooser'),
            page.getByRole('button', { name: 'Import .crux file', exact: true }).click(),
          ]);
          await chooser.setFiles(archive);
          await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: phaseTimeout });
        });
        id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      } else id = await createCrux(page, `Performance ${count}`);
      const { projectFolder: folder } = await storedCrux(page, id);
      expect(folder).toBeTruthy();
      await pane(page, 'history', 'Toggle history');
      await page.getByTestId('pane-body-history').getByRole('combobox').selectOption('manual');
      await page.getByRole('button', { name: 'Toggle history', exact: true }).click();
      await pane(page, 'artifacts', 'Toggle artifacts');

      // Establish a live watcher before the timed burst. A newly created Crux
      // starts watching asynchronously; startup readiness is not ingestion throughput.
      if (seedMode === 'burst')
        await expect
          .poll(
            async () => {
              writeFileSync(join(folder, 'watcher-ready.txt'), String(Date.now()));
              const row = await page.evaluate(
                async (id) =>
                  window.electronAPI!.sqlite.get(
                    "SELECT id FROM artifacts WHERE resource_id = ? AND path = 'watcher-ready.txt'",
                    [id],
                  ),
                id,
              );
              return !!row;
            },
            { intervals: [1000], timeout: 30_000 },
          )
          .toBe(true);

      const expected = new Map<string, string>();
      if (seedMode === 'burst')
        await measure('external-write-and-ingest', async () => {
          for (const ignored of ['node_modules', '.git', 'dist']) {
            mkdirSync(join(folder, ignored), { recursive: true });
            writeFileSync(join(folder, ignored, 'not-an-artifact.txt'), 'ignored');
          }
          for (let i = 0; i < count; i++) {
            const path = pathFor(i);
            const content = contentFor(i, 0);
            mkdirSync(dirname(join(folder, path)), { recursive: true });
            writeFileSync(join(folder, path), content);
            expected.set(path, hash(content));
          }
          report.writtenNotes = count;
          await expect
            .poll(
              async () => {
                const observed = await noteCount(page, id);
                report.observedNotes = observed;
                return observed;
              },
              {
                timeout: phaseTimeout,
                intervals: [1000],
              },
            )
            .toBe(count);
        });
      if (seedMode === 'archive')
        for (let i = 0; i < count; i++) expected.set(pathFor(i), hash(contentFor(i, 0)));
      const signatures = (rows: FileRow[]) => rows.map((r) => [r.path, r.fingerprint]);
      expect(signatures(await files(page, id))).toEqual(
        [...expected].sort(([a], [b]) => a.localeCompare(b)),
      );
      const ignored = await page.evaluate(
        async (id) =>
          window.electronAPI!.sqlite.all(
            "SELECT path FROM artifacts WHERE resource_id = ? AND (path LIKE 'node_modules/%' OR path LIKE '.git/%' OR path LIKE 'dist/%')",
            [id],
          ),
        id,
      );
      expect(ignored).toEqual([]);

      await measure('expand-folders-and-open-note', async () => {
        const tree = page.getByRole('tree');
        for (const name of ['notes', 'shelf-000', 'chapter-000']) {
          await tree.getByText(name, { exact: true }).click();
        }
        await tree.getByText('note-000000.md', { exact: true }).click();
        await expect(page.locator('.monaco-editor').first()).toContainText('Note 000000');
        // Chapter contains 90 direct files at normal sizes. Only viewport rows
        // should become DOM nodes; parent folders also consume some rows.
        report.renderedTreeRows = await tree.getByRole('treeitem').count();
        expect(report.renderedTreeRows).toBeGreaterThan(0);
        expect(report.renderedTreeRows).toBeLessThan(80);
      });

      await pane(page, 'history', 'Toggle history');
      const snapshotSignatures: Array<Array<string[]>> = [];
      for (let revision = 0; revision < snapshots; revision++) {
        if (revision > 0)
          await measure(`edit-and-ingest-${revision}`, async () => {
            const changed = Math.max(1, Math.floor(count / 100));
            for (let i = 0; i < changed; i++) {
              const content = contentFor(i, revision);
              writeFileSync(join(folder, pathFor(i)), content);
              expected.set(pathFor(i), hash(content));
            }
            await expect
              .poll(
                async () => {
                  const rows = (await page.evaluate(
                    async ({ id, paths }) =>
                      window.electronAPI!.sqlite.all(
                        `SELECT path, fingerprint FROM artifacts WHERE resource_id = ? AND path IN (${paths.map(() => '?').join(',')})`,
                        [id, ...paths],
                      ),
                    { id, paths: Array.from({ length: changed }, (_, i) => pathFor(i)) },
                  )) as FileRow[];
                  return rows.filter((r) => expected.get(r.path) === r.fingerprint).length;
                },
                { timeout: phaseTimeout, intervals: [1000] },
              )
              .toBe(changed);
          });
        const label = `Performance checkpoint ${revision}`;
        await measure(`snapshot-${revision}`, async () => {
          const history = page.getByTestId('pane-body-history');
          await history.getByRole('button', { name: 'Take snapshot', exact: true }).click();
          await history.getByPlaceholder('Label (optional)').fill(label);
          await history.getByPlaceholder('Label (optional)').press('Enter');
          await expect(history.getByText(label, { exact: true })).toBeVisible({
            timeout: phaseTimeout,
          });
        });
        const nodes = (await page.evaluate(
          async (id) =>
            window.electronAPI!.sqlite.all(
              "SELECT target_id FROM dimensions WHERE source_id = ? AND type = 'growth' ORDER BY weight",
              [id],
            ),
          id,
        )) as Array<{ target_id: string }>;
        expect(nodes).toHaveLength(revision + 1);
        const snapshotRows = await files(page, nodes[revision]!.target_id);
        expect(signatures(snapshotRows)).toEqual(
          [...expected].sort(([a], [b]) => a.localeCompare(b)),
        );
        snapshotSignatures.push(signatures(snapshotRows));
      }

      await page.evaluate(() => {
        const w = window as unknown as { __perfBlob?: Blob };
        const blobs = new Map<string, Blob>();
        const original = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (blob) => {
          const url = original(blob);
          if (blob instanceof Blob) blobs.set(url, blob);
          return url;
        };
        const click = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {
          if (this.download.endsWith('.crux')) w.__perfBlob = blobs.get(this.href);
          else click.call(this);
        };
      });
      await pane(page, 'export', 'Toggle export');
      await measure('export-crux', async () => {
        await page.getByRole('button', { name: 'Export Crux', exact: true }).click();
        await expect
          .poll(
            () => page.evaluate(() => !!(window as unknown as { __perfBlob?: Blob }).__perfBlob),
            { timeout: phaseTimeout, intervals: [1000] },
          )
          .toBe(true);
      });
      // Transport/inspection is outside export timing. The fresh import receives
      // these exact bytes, with no access to the original database or Blob Store.
      const encoded = await page.evaluate(async () => {
        const blob = (window as unknown as { __perfBlob: Blob }).__perfBlob;
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]!);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      });
      const archive = testInfo.outputPath('workspace.crux');
      const bytes = Buffer.from(encoded, 'base64');
      writeFileSync(archive, bytes);
      report.archiveBytes = bytes.length;
      const zip = await JSZip.loadAsync(bytes);
      const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));
      report.archiveManifest = manifest;
      const blobNames = Object.values(zip.files).filter(
        (f) => !f.dir && f.name.startsWith('artifacts/'),
      );
      expect(blobNames).toHaveLength(manifest.artifactCount);
      const expectedFingerprints = new Set(
        snapshotSignatures.flatMap((rows) => rows.map((r) => r[1]!)),
      );
      for (const fp of expectedFingerprints) expect(zip.file(`artifacts/${fp}`)).not.toBeNull();
      // The payload for unchanged notes occurs only once across all checkpoints.
      report.uniqueNoteBlobs = expectedFingerprints.size;
      expect(expectedFingerprints.size).toBe(
        count + (snapshots - 1) * Math.max(1, Math.floor(count / 100)),
      );
      const checkpoint0 = zip.file(
        `artifacts/${snapshotSignatures[0]!.find((r) => r[0] === pathFor(0))![1]}`,
      )!;
      expect(await checkpoint0.async('text')).toBe(contentFor(0, 0));

      await instance.app.close();
      closed = true;
      instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
      closed = false;
      page = instance.page;
      captureErrors(page);
      page.setDefaultTimeout(60_000);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await enterGarden(page);
      await measure('fresh-garden-import', async () => {
        await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
        const [chooser] = await Promise.all([
          page.waitForEvent('filechooser'),
          page.getByRole('button', { name: 'Import .crux file', exact: true }).click(),
        ]);
        await chooser.setFiles(archive);
        await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: phaseTimeout });
        const importedId = (await page
          .locator('[data-workspace-id]')
          .getAttribute('data-workspace-id'))!;
        expect(signatures(await files(page, importedId))).toEqual(
          [...expected].sort(([a], [b]) => a.localeCompare(b)),
        );
      });
      const importedId = (await page
        .locator('[data-workspace-id]')
        .getAttribute('data-workspace-id'))!;
      const importedNodes = (await page.evaluate(
        async (id) =>
          window.electronAPI!.sqlite.all(
            "SELECT target_id FROM dimensions WHERE source_id = ? AND type = 'growth' ORDER BY weight",
            [id],
          ),
        importedId,
      )) as Array<{ target_id: string }>;
      expect(importedNodes).toHaveLength(snapshots);
      for (let i = 0; i < snapshots; i++)
        expect(signatures(await files(page, importedNodes[i]!.target_id))).toEqual(
          snapshotSignatures[i],
        );
      const importedFolder = (await storedCrux(page, importedId)).projectFolder;
      const diskNotes = readdirSync(importedFolder, { recursive: true })
        .map((path) => String(path).split(sep).join('/'))
        .filter((path) => path.startsWith('notes/') && path.endsWith('.md'));
      expect(diskNotes.sort()).toEqual([...expected.keys()].sort());
      for (const i of [...new Set([0, Math.min(9, count - 1), count - 1])]) {
        const content = readFileSync(join(importedFolder, pathFor(i)), 'utf8');
        expect(hash(content)).toBe(expected.get(pathFor(i)));
        expect(statSync(join(importedFolder, pathFor(i))).size).toBe(fileBytes);
      }
      report.status = 'passed';
    } catch (error) {
      report.error = String(error);
      throw error;
    } finally {
      report.status ??= 'failed';
      writeFileSync(testInfo.outputPath('performance.json'), JSON.stringify(report, null, 2));
      await testInfo.attach('performance', {
        path: testInfo.outputPath('performance.json'),
        contentType: 'application/json',
      });
      if (!closed) await instance.app.close();
    }
  });
