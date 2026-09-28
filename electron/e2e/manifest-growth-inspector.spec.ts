import { test, expect, type Page } from '@playwright/test';
import { launchApp } from './launch';
import { createCrux, enterGarden } from './multi-crux-helpers';
import { togglePanel } from './panel-helpers';

async function openGraph(page: Page) {
  // Entering lands on Garden Home; the Crux opens from its card.
  const card = page.getByRole('button', { name: 'Open Version-bound history', exact: true });
  const workspace = page.locator('[data-workspace-id]');
  await card.or(workspace).first().waitFor({ timeout: 30_000 });
  if (!(await workspace.isVisible())) await card.click();
  await expect(page.locator('[data-workspace-id]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
    'Version-bound history',
  );
  const history = page.getByTestId('pane-body-history');
  if (!(await history.isVisible())) await togglePanel(page, 'Toggle growth');
  await history.getByRole('button', { name: 'Whole Crux · branches & merges' }).click();
  const graph = page.getByRole('dialog', { name: 'Whole Crux Growth' });
  await graph.getByRole('button', { name: 'Expand checkpoints', exact: true }).click();
  return graph;
}

test('Growth inspects manifest checkpoints with shared file IDs, missing bytes, retry and restart', async () => {
  let launch = await launchApp();
  const dir = launch.dir;
  try {
    await enterGarden(launch.page);
    const id = await createCrux(launch.page, 'Version-bound history');
    const saved = await launch.page.evaluate(async (id) => {
      const db = window.electronAPI!.sqlite;
      const content = db.fileContent!;
      const edit = async (text: string, expected: { root: string; revision: number } | null) => {
        const bytes = new TextEncoder().encode(text);
        const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
          .map((n) => n.toString(16).padStart(2, '0'))
          .join('');
        const head = await content.edit({
          cruxId: id,
          expected,
          changes: [
            {
              put: {
                id: 'shared-file-id',
                path: 'notes.txt',
                fingerprint,
                size: bytes.length,
                encoding: 'utf-8',
                mimeType: 'text/plain',
                mode: 0o640,
                attributes: {},
              },
              bytes,
            },
          ],
        });
        return { head, fingerprint, bytes: Array.from(bytes) };
      };
      const first = await edit('The first dream, preserved.', null);
      const one = await content.snapshot({
        cruxId: id,
        expected: first.head,
        snapshotId: crypto.randomUUID(),
        parentId: null,
        dimensionMeta: { label: 'First dream' },
        meta: { messages: [{ role: 'user', content: 'First conversation' }] },
      });
      const second = await edit('The second dream, distinct.', first.head);
      const two = await content.snapshot({
        cruxId: id,
        expected: second.head,
        snapshotId: crypto.randomUUID(),
        parentId: one.snapshot.id,
        dimensionMeta: { label: 'Second dream' },
        meta: { messages: [{ role: 'user', content: 'Second conversation' }] },
      });
      await edit('Current work must never appear in history.', second.head);
      return { first, one: one.snapshot.id, two: two.snapshot.id };
    }, id);
    await expect
      .poll(() =>
        launch.page.evaluate(async (id) => {
          const row = await window.electronAPI!.sqlite.get<{ value: string }>(
            "SELECT value FROM settings WHERE key = 'cruxgarden:open-workspaces:v1'",
          );
          return row ? JSON.parse(row.value).lastActiveCruxId === id : false;
        }, id),
      )
      .toBe(true);
    await launch.app.close();
    launch = await launchApp({ dir });
    await launch.page.getByRole('button', { name: /enter/i }).click();
    let graph = await openGraph(launch.page);
    const choose = async (label: string) => {
      await graph.getByLabel('Find checkpoint').fill(label);
      await graph.getByRole('button', { name: `${label} Main · Checkpoint`, exact: true }).click();
      await graph.getByLabel('Checkpoint Artifact').selectOption({ label: 'notes.txt' });
    };
    await choose('First dream');
    await expect(graph.getByTestId('growth-inspector').locator('pre')).toHaveText(
      'The first dream, preserved.',
    );
    await choose('Second dream');
    await expect(graph.getByTestId('growth-inspector').locator('pre')).toHaveText(
      'The second dream, distinct.',
    );
    await expect(graph.getByTestId('growth-inspector')).toContainText('Second conversation');
    await launch.page.evaluate(async (fingerprint) => {
      await window.electronAPI!.sqlite.blobDelete(fingerprint);
    }, saved.first.fingerprint);
    await choose('First dream');
    await expect(graph.getByTestId('growth-inspector').getByRole('alert')).toBeVisible();
    await expect(graph.getByTestId('growth-inspector').locator('pre')).toHaveCount(0);
    await launch.page.evaluate(async ({ fingerprint, bytes }) => {
      await window.electronAPI!.sqlite.blobWrite(fingerprint, new Uint8Array(bytes));
    }, saved.first);
    await choose('Second dream');
    await expect(graph.getByTestId('growth-inspector').getByRole('alert')).toHaveCount(0);
    await choose('First dream');
    await expect(graph.getByTestId('growth-inspector').locator('pre')).toHaveText(
      'The first dream, preserved.',
    );
    await launch.app.close();
    launch = await launchApp({ dir });
    await launch.page.getByRole('button', { name: /enter/i }).click();
    graph = await openGraph(launch.page);
    await choose('First dream');
    await expect(graph.getByTestId('growth-inspector').locator('pre')).toHaveText(
      'The first dream, preserved.',
    );
    expect(
      await launch.page.evaluate(
        async (ids) =>
          window.electronAPI!.sqlite.all(
            'SELECT id FROM artifacts WHERE resource_id IN (?, ?, ?)',
            ids,
          ),
        [id, saved.one, saved.two],
      ),
    ).toEqual([]);
  } finally {
    await launch.app.close();
  }
});
