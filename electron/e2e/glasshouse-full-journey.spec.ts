import { test, expect, type Page, type ElectronApplication } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';
import { startMockApi } from './api-mock';

const output = '/private/tmp/glasshouse-proof';
type Row = {
  id: string;
  kind?: string;
  title?: string;
  phase?: string;
  role?: string;
  resource_id?: string;
  fingerprint?: string;
  meta: Record<string, unknown> | string;
};
type Graph = { cruxId: string; cruxes: Row[]; copies: Row[]; artifacts: Row[] };
const meta = (row: Row) => (typeof row.meta === 'string' ? JSON.parse(row.meta) : row.meta);
async function pane(page: Page, name: string, toggle: string) {
  if (!(await page.getByTestId(`pane-body-${name}`).isVisible()))
    await page.getByRole('button', { name: toggle, exact: true }).click();
}
async function preview(page: Page) {
  const collaboration = page.getByRole('button', { name: 'Toggle collaboration' });
  if (await page.getByTestId('pane-body-collaboration').isVisible()) await collaboration.click();
  await pane(page, 'artifacts', 'Toggle artifacts');
  await page.getByRole('tree').getByText('index.html', { exact: true }).click();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const frame = page.frameLocator('iframe[data-crux-id]');
  await expect(
    frame.getByRole('heading', { name: 'A little green. A whole new feeling.' }),
  ).toBeVisible();
  return frame;
}
async function exportArchive(page: Page, name: string) {
  await page.evaluate(() => {
    const w = window as unknown as { __proofBlob?: Blob };
    w.__proofBlob = undefined;
    const blobs = new Map<string, Blob>();
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = original(blob);
      if (blob instanceof Blob) blobs.set(url, blob);
      return url;
    };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download.endsWith('.crux')) w.__proofBlob = blobs.get(this.href);
      if (!this.download) click.call(this);
    };
  });
  await pane(page, 'export', 'Toggle export');
  await page.getByRole('button', { name: 'Export Crux', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => !!(window as unknown as { __proofBlob?: Blob }).__proofBlob))
    .toBe(true);
  const encoded = await page.evaluate(async () => {
    const bytes = new Uint8Array(
      await (window as unknown as { __proofBlob: Blob }).__proofBlob.arrayBuffer(),
    );
    let result = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      result += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(result);
  });
  const bytes = Buffer.from(encoded, 'base64');
  writeFileSync(join(output, name), bytes);
  const zip = await JSZip.loadAsync(bytes);
  const graph: Graph = JSON.parse(await zip.file('tasks.json')!.async('text'));
  await page.getByRole('button', { name: 'Toggle export', exact: true }).click();
  return { zip, graph, bytes };
}
async function close(app: ElectronApplication) {
  await app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) w.destroy();
  });
  await app.close();
}
async function graphShot(page: Page, filename: string) {
  await pane(page, 'history', 'Toggle history');
  await page.getByRole('button', { name: 'Whole Crux · branches & merges', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Whole Crux Growth' });
  for (const title of ['Brand foundation', 'Checkout', 'Accessibility']) {
    await expect(
      dialog.getByRole('button', { name: `${title} · merged`, exact: true }),
    ).toBeVisible();
  }
  await expect(dialog.getByTestId('growth-canvas-2d').locator('canvas')).toBeVisible();
  await page.screenshot({ path: join(output, filename) });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
}
async function fileText(zip: JSZip, graph: Graph, owner: string, path: string) {
  const row = graph.artifacts.find((a) => a.resource_id === owner && meta(a)?.path === path)!;
  expect(row, `${path} exists in ${owner}`).toBeTruthy();
  return zip.file(`artifacts/${row.fingerprint}`)!.async('text');
}
function historySignatures(graph: Graph) {
  return graph.cruxes
    .filter((c) => c.id !== graph.cruxId)
    .map((c) =>
      JSON.stringify({
        artifacts: graph.artifacts
          .filter((a) => a.resource_id === c.id)
          .map((a) => [meta(a)?.path, a.fingerprint])
          .sort(),
        messages: (meta(c)?.messages ?? []).map((message: Record<string, unknown>) => ({
          ...message,
          taskMergeId: undefined,
        })),
      }),
    );
}

test('Glasshouse grows through two reviews, publishes combined Main, and carries its history into a fresh garden', async () => {
  test.setTimeout(240000);
  mkdirSync(output, { recursive: true });
  const api = await startMockApi();
  const first = await launchApp({ env: { CRUX_API_URL: api.url } });
  let second: Awaited<ReturnType<typeof launchApp>> | undefined;
  let firstClosed = false;
  try {
    const page = first.page;
    await page.setViewportSize({ width: 1440, height: 1000 });
    await enterGarden(page);
    await page
      .getByRole('banner')
      .getByRole('link', { name: /^Tending/ })
      .click();
    await page.getByRole('button', { name: 'Create demo Crux', exact: true }).click();
    await expect(page.getByText('Glasshouse is ready.', { exact: false })).toBeVisible({
      timeout: 60000,
    });
    const region = page.getByRole('region', { name: 'Glasshouse · Tending demo', exact: true });
    await expect(region.getByText('Ready to review', { exact: true })).toHaveCount(2);
    await page.screenshot({ path: join(output, '01-two-tasks.png') });
    await region.getByRole('button', { name: 'Open Main', exact: true }).click();
    const start = await exportArchive(page, 'glasshouse-before.crux');
    let frame = await preview(page);
    await frame.getByRole('button', { name: 'Try demo checkout' }).click();
    await expect(frame.getByRole('status')).toContainText('Checkout is growing');
    const taskbar = page.getByTestId('task-bar');
    for (const title of ['Checkout', 'Accessibility']) {
      await taskbar.getByRole('link', { name: new RegExp('^' + title) }).click();
      await expect(taskbar.getByRole('link', { name: new RegExp('^' + title) })).toHaveAttribute(
        'aria-current',
        'page',
      );
      frame = await preview(page);
      if (title === 'Checkout') {
        await frame.getByRole('button', { name: 'Add to bag' }).first().click();
        await frame.getByRole('button', { name: 'Try demo checkout' }).click();
        await expect(frame.getByRole('status')).toContainText('Demo order placed: 1 plant');
      } else {
        // This parallel direction has its focus improvements, but still the original checkout.
        await frame.getByRole('button', { name: 'Try demo checkout' }).click();
        await expect(frame.getByRole('status')).toContainText('Checkout is growing');
        await frame.getByRole('link', { name: 'Skip to plants' }).focus();
        await frame.getByRole('link', { name: 'Skip to plants' }).press('Tab');
        await frame.getByRole('link', { name: 'Glasshouse home' }).press('Shift+Tab');
        await expect(frame.getByRole('link', { name: 'Skip to plants' })).toHaveCSS(
          'outline-width',
          '3px',
        );
      }
      await page.getByRole('button', { name: 'Review changes', exact: true }).click();
      const review = page.getByRole('dialog', { name: 'Review changes for Main' });
      await review.getByRole('button', { name: 'Check combined result' }).click();
      await expect(review.getByRole('checkbox')).toBeEnabled();
      await page.screenshot({ path: join(output, `02-review-${title.toLowerCase()}.png`) });
      await review.getByRole('checkbox').check();
      await review.getByRole('button', { name: 'Merge into Main' }).click();
      await expect(review).toHaveCount(0);
      await expect(taskbar.getByRole('link', { name: 'Main', exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
    }
    frame = await preview(page);
    await frame.getByRole('button', { name: 'Add to bag' }).first().click();
    await frame.getByRole('button', { name: 'Add to bag' }).nth(1).click();
    await expect(frame.locator('#cart-summary')).toContainText('2 in your bag · $56');
    await frame.getByRole('button', { name: 'Try demo checkout' }).click();
    await expect(frame.getByRole('status')).toContainText('Demo order placed: 2 plants');
    await frame.getByRole('button', { name: 'Try demo checkout' }).click();
    await expect(frame.getByRole('status')).toContainText('Your bag is empty');
    await frame.getByRole('link', { name: 'Skip to plants' }).focus();
    await frame.getByRole('link', { name: 'Skip to plants' }).press('Tab');
    await frame.getByRole('link', { name: 'Glasshouse home' }).press('Shift+Tab');
    await expect(frame.getByRole('link', { name: 'Skip to plants' })).toHaveCSS(
      'outline-width',
      '3px',
    );
    await graphShot(page, '03-merged-growth.png');

    // Exercise the real Share flow, with an explicit test API rather than a live account.
    await pane(page, 'publish', 'Toggle share');
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await page.getByPlaceholder('email@example.com').fill('tester@example.com');
    await page.getByRole('button', { name: 'Send Code' }).click();
    await page.getByPlaceholder('Enter code').fill('123456');
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    const backup = page.getByRole('dialog').filter({ hasText: 'A published site is not a backup' });
    await expect(backup).toBeVisible();
    await backup.getByRole('button', { name: 'Back up and share' }).click();
    await expect(page.getByText('Up to date', { exact: true })).toBeVisible({ timeout: 30000 });
    const published = api.state.published[start.graph.cruxId]!;
    expect(published.find((f) => f.path === 'checkout.js')?.bytes.toString()).toContain(
      'Demo order placed',
    );
    expect(published.find((f) => f.path === 'accessibility.css')?.bytes.toString()).toContain(
      'outline:3px',
    );
    await expect.poll(() => !!api.state.sync.cruxes[start.graph.cruxId]?.data).toBe(true);
    const backedUp = await JSZip.loadAsync(api.state.sync.cruxes[start.graph.cruxId]!.data!);
    const backupGraph: Graph = JSON.parse(await backedUp.file('tasks.json')!.async('text'));
    expect(backupGraph.copies.filter((c) => c.phase === 'merged').map((c) => c.title)).toEqual(
      expect.arrayContaining(['Checkout', 'Accessibility']),
    );
    await page.getByRole('button', { name: 'Toggle share', exact: true }).click();
    const finished = await exportArchive(page, 'glasshouse-grown.crux');
    expect(await fileText(start.zip, start.graph, start.graph.cruxId, 'checkout.js')).toContain(
      'Checkout is growing',
    );
    expect(finished.graph.copies.filter((c) => c.phase === 'merged')).toHaveLength(3);
    for (const title of ['Checkout', 'Accessibility']) {
      const copy = finished.graph.copies.find((c) => c.title === title)!;
      const conversation = finished.graph.cruxes
        .filter((c) => meta(c).contentOwnerId === copy.id)
        .flatMap((c) => meta(c).messages ?? []);
      expect(JSON.stringify(conversation)).toContain('Scripted demo');
    }
    const snapshotIds = new Set(finished.graph.cruxes.map((c) => c.id));
    for (const row of finished.graph.cruxes) {
      const merge = meta(row).merge;
      if (merge) {
        expect(snapshotIds.has(merge.sourceHead)).toBe(true);
        expect(snapshotIds.has(merge.targetHead)).toBe(true);
      }
    }
    const website = new JSZip();
    for (const row of finished.graph.artifacts.filter(
      (a) => a.resource_id === finished.graph.cruxId,
    )) {
      const path = String(meta(row).path);
      const bytes = await finished.zip.file(`artifacts/${row.fingerprint}`)!.async('nodebuffer');
      website.file(path, bytes);
      mkdirSync(join(output, 'site'), { recursive: true });
      // Original demo has only flat paths.
      expect(path).not.toContain('/');
      writeFileSync(join(output, 'site', path), bytes);
    }
    writeFileSync(
      join(output, 'glasshouse-website.zip'),
      await website.generateAsync({ type: 'nodebuffer' }),
    );
    await close(first.app);
    firstClosed = true;

    // No old local database, Blob Store, Project Folder or runtime is available here.
    second = await launchApp();
    await second.page.setViewportSize({ width: 1440, height: 1000 });
    await enterGarden(second.page);
    await second.page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    const [chooser] = await Promise.all([
      second.page.waitForEvent('filechooser'),
      second.page.getByRole('button', { name: 'Import .crux file', exact: true }).click(),
    ]);
    await chooser.setFiles(join(output, 'glasshouse-grown.crux'));
    await expect(second.page.locator('[data-workspace-id]')).toBeVisible();
    const restored = await exportArchive(second.page, 'glasshouse-reopened.crux');
    expect(restored.graph.cruxId).not.toBe(finished.graph.cruxId);
    expect(restored.graph.copies.map((c) => [c.title, c.phase])).toEqual(
      finished.graph.copies.map((c) => [c.title, c.phase]),
    );
    // Conversations include remapped merge ids; verify each historical Artifact state exactly.
    expect(historySignatures(restored.graph)).toEqual(
      expect.arrayContaining(historySignatures(finished.graph)),
    );
    expect(restored.graph.cruxes.length).toBeGreaterThanOrEqual(finished.graph.cruxes.length);
    for (const c of restored.graph.copies) {
      expect(meta(c).turnJob).toBeUndefined();
      expect(meta(c).turnQueue).toBeUndefined();
      const original = finished.graph.copies.find((o) => o.title === c.title)!;
      expect(meta(c).messages).toEqual(meta(original).messages);
    }
    for (const path of ['checkout.js', 'accessibility.css'])
      expect(await fileText(restored.zip, restored.graph, restored.graph.cruxId, path)).toBe(
        await fileText(finished.zip, finished.graph, finished.graph.cruxId, path),
      );
    await graphShot(second.page, '04-reopened-growth.png');
    frame = await preview(second.page);
    await frame.getByRole('button', { name: 'Add to bag' }).first().click();
    await frame.getByRole('button', { name: 'Try demo checkout' }).click();
    await expect(frame.getByRole('status')).toContainText('Demo order placed: 1 plant');
    await frame.getByRole('link', { name: 'Skip to plants' }).focus();
    await frame.getByRole('link', { name: 'Skip to plants' }).press('Tab');
    await frame.getByRole('link', { name: 'Glasshouse home' }).press('Shift+Tab');
    await expect(frame.getByRole('link', { name: 'Skip to plants' })).toHaveCSS(
      'outline-width',
      '3px',
    );
    const url = (await second.page.locator('iframe[data-crux-id]').getAttribute('src'))!;
    const ready = second.app.waitForEvent('window');
    await second.app.evaluate(({ BrowserWindow }, url) => {
      const w = new BrowserWindow({ show: false, width: 1200, height: 1050 });
      void w.loadURL(url);
    }, url);
    const site = await ready;
    await site.setViewportSize({ width: 1200, height: 1050 });
    await site.goto(url);
    await expect(
      site.getByRole('heading', { name: 'A little green. A whole new feeling.' }),
    ).toBeVisible();
    await site.screenshot({ path: join(output, '05-finished-site.png'), fullPage: true });
    await site.setViewportSize({ width: 390, height: 844 });
    expect(await site.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await site.screenshot({ path: join(output, '06-finished-mobile.png'), fullPage: true });
    writeFileSync(
      join(output, 'evidence.json'),
      JSON.stringify(
        {
          scriptedCollaboration: true,
          publishBackend: 'local mock API; not publicly deployed',
          tasks: finished.graph.copies.map((c) => ({ title: c.title, phase: c.phase })),
          snapshots: finished.graph.cruxes.length - 1,
          artifactReferences: finished.graph.artifacts.length,
          uniqueBlobs: Object.keys(finished.zip.files).filter(
            (k) => k.startsWith('artifacts/') && !finished.zip.files[k]!.dir,
          ).length,
          archiveBytes: finished.bytes.length,
          freshGardenHistoryVerified: true,
          combinedCheckoutVerified: true,
          keyboardFocusVerified: true,
          publishPayloadVerified: true,
          backupTaskGraphVerified: true,
          sourceGarden: first.dir,
          restoredGarden: second.dir,
          historicalStates: historySignatures(finished.graph).length,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const active = second?.page ?? first.page;
    if (!active.isClosed()) {
      await active.screenshot({ path: join(output, 'failure.png') });
      writeFileSync(join(output, 'failure.txt'), await active.locator('body').innerText());
    }
    throw error;
  } finally {
    if (second) await close(second.app);
    if (!firstClosed) await close(first.app);
    await api.close();
  }
});
