import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { launchApp } from '../e2e/launch';
import { enterGarden, createCrux, storedCrux } from '../e2e/multi-crux-helpers';
import { openPanel } from '../e2e/panel-helpers';
import { markVersion } from '../e2e/journeys/journey-helpers';
import { exportNativeCrux } from '../e2e/native-archive-helpers';
import { pathFor, contentFor, hash } from '../../performance/fixture';

async function files(page: Page, cruxId: string) {
  return page
    .evaluate(async (cruxId) => {
      const api = window.electronAPI!.sqlite.fileContent!;
      const head = await api.head(cruxId);
      return head
        ? (await api.list({ cruxId, expected: head })).entries
            .filter((f) => f.path.startsWith('notes/'))
            .map((f) => [f.path, f.fingerprint])
            .sort(([a], [b]) => a!.localeCompare(b!))
        : [];
    }, cruxId)
    .catch((error: Error) => {
      // A watcher commit may land between head and list. Poll the next head.
      if (error.message.includes('reload before reading')) return [];
      throw error;
    });
}

for (const count of (process.env.CRUX_PERF_FILES ?? '1000,10000').split(',').map(Number)) {
  test(`${count} files: current manifests, real editor, Growth and portable import`, async () => {
    test.setTimeout(15 * 60_000);
    const out = process.env.CRUX_PERF_OUT ?? 'performance/.results';
    mkdirSync(out, { recursive: true });
    const archive = join(out, `project-${count}.crux`);
    let instance = await launchApp();
    const phases: { name: string; ms: number }[] = [];
    const measure = async (name: string, work: () => Promise<void>) => {
      const start = Date.now();
      await work();
      const result = { name, ms: Date.now() - start };
      phases.push(result);
      console.log(JSON.stringify({ count, ...result }));
      writeFileSync(join(out, `project-${count}.json`), JSON.stringify(phases, null, 2));
    };
    try {
      let { page } = instance;
      await enterGarden(page);
      const id = await createCrux(page, `Scale ${count}`);
      const { projectFolder } = await storedCrux(page, id);
      const expected = Array.from({ length: count }, (_, i) => [
        pathFor(i),
        hash(contentFor(i, 0)),
      ]).sort(([a], [b]) => a!.localeCompare(b!));
      if (process.env.CRUX_CPU_PROFILE)
        await instance.app.evaluate(async () => {
          const session = new (process.getBuiltinModule('inspector').Session)();
          session.connect();
          (globalThis as unknown as { perfSession: typeof session }).perfSession = session;
          await new Promise<void>((resolve) => session.post('Profiler.enable', () => resolve()));
          await new Promise<void>((resolve) => session.post('Profiler.start', () => resolve()));
        });
      await measure('write-and-ingest', async () => {
        for (let i = 0; i < count; i++) {
          const file = join(projectFolder, pathFor(i));
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, contentFor(i, 0));
        }
        await expect
          .poll(() => files(page, id), { timeout: 180_000, intervals: [1000] })
          .toEqual(expected);
      });
      if (process.env.CRUX_CPU_PROFILE) {
        const profile = await instance.app.evaluate(
          () =>
            new Promise((resolve) => {
              const session = (
                globalThis as unknown as { perfSession: import('node:inspector').Session }
              ).perfSession;
              session.post('Profiler.stop', (_error, result) => {
                session.disconnect();
                resolve(result);
              });
            }),
        );
        writeFileSync(join(out, `main-${count}.cpuprofile`), JSON.stringify(profile));
      }
      await measure('browse-and-open', async () => {
        await openPanel(page, 'artifacts', 'Toggle artifacts');
        const tree = page.getByRole('tree');
        for (const name of ['notes', 'shelf-000', 'chapter-000'])
          await tree.getByText(name, { exact: true }).click();
        await tree.getByText('note-000001.md', { exact: true }).click();
        await expect(page.locator('.monaco-editor').first()).toContainText('Note 000001');
        expect(await tree.getByRole('treeitem').count()).toBeLessThan(100);
      });
      await measure('snapshot', async () => {
        await markVersion(page, 'Scale checkpoint');
      });
      await measure('export', () =>
        exportNativeCrux(page, archive, instance.app, async () => {
          await openPanel(page, 'export', 'Toggle export');
        }),
      );
      await instance.app.close();
      instance = await launchApp();
      page = instance.page;
      await enterGarden(page);
      await measure('fresh-import', async () => {
        await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
        const [chooser] = await Promise.all([
          page.waitForEvent('filechooser'),
          page.getByRole('button', { name: 'Import .crux file', exact: true }).click(),
        ]);
        await chooser.setFiles(archive);
        await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 300_000 });
        const imported = (await page
          .locator('[data-workspace-id]')
          .getAttribute('data-workspace-id'))!;
        await expect.poll(() => files(page, imported)).toEqual(expected);
        const meta = await storedCrux(page, imported);
        for (const i of [0, Math.floor(count / 2), count - 1])
          expect(readFileSync(join(meta.projectFolder, pathFor(i)), 'utf8')).toBe(contentFor(i, 0));
        await openPanel(page, 'history', 'Toggle growth');
        await expect(
          page.getByTestId('pane-body-history').getByText('Scale checkpoint', { exact: true }),
        ).toBeVisible();
      });
    } finally {
      await instance.app.close();
    }
  });
}
