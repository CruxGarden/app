import { togglePanel } from './panel-helpers';
import { test, expect, type Page } from '@playwright/test';
import { launchApp } from './launch';
import { storedCrux, enterGarden, createCrux, addArtifact } from './multi-crux-helpers';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrails (RESILIENCE-PLAN § Guardrails): the destructive actions that are
 * easy to reach each leave a way back.
 *   - deleting a file keeps a protected Edit history copy without a Growth edge
 *   - Clear on the crux store offers "Export a copy, then clear" — and exports
 *   - Wipe garden offers "Export, then wipe" — the .garden file is written
 *     before anything goes
 */
async function armBlobCapture(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __blobs?: Blob[] };
    if (w.__blobs) return;
    w.__blobs = [];
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b: Blob | MediaSource) => {
      if (b instanceof Blob) w.__blobs!.push(b);
      return orig(b);
    };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (!this.download) click.call(this);
    };
  });
}
const blobCount = (page: Page) =>
  page.evaluate(() => (window as unknown as { __blobs: Blob[] }).__blobs.length);
async function lastBlobText(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const w = window as unknown as { __blobs: Blob[] };
    return w.__blobs[w.__blobs.length - 1]!.text();
  });
}
async function ensurePane(page: Page, type: string, toggle: string) {
  const body = page.getByTestId(`pane-body-${type}`);
  if (!(await body.isVisible().catch(() => false))) await togglePanel(page, toggle);
  await expect(body).toBeVisible({ timeout: 30_000 });
}
async function plantWithFile(page: Page) {
  await enterGarden(page);
  await createCrux(page, 'My Crux');
  await addArtifact(page, 'index.html');
  const monaco = page.locator('.monaco-editor').first();
  await expect(monaco).toBeVisible({ timeout: 30_000 });
  await monaco.click();
  await page.keyboard.type('<h1>Keep me</h1>');
  await page.keyboard.press('ControlOrMeta+s');
}

test.describe('guardrails: a way back from every destructive action', () => {
  test.setTimeout(180_000);

  test('a refused safety checkpoint reports deletion failure, preserves the file and supports retry after restart', async () => {
    let launch = await launchApp();
    const dir = launch.dir;
    try {
      const { page } = launch;
      await plantWithFile(page);
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      const meta = await storedCrux(page, id);
      const file = join(meta.projectFolder, 'index.html');
      await expect
        .poll(() => (existsSync(file) ? readFileSync(file, 'utf8') : null))
        .toBe('<h1>Keep me</h1>');
      await page.evaluate(() =>
        window.electronAPI!.sqlite.run(
          "CREATE TRIGGER refuse_delete_safety BEFORE UPDATE ON edit_history BEGIN SELECT RAISE(ABORT, 'Safety snapshot unavailable'); END",
        ),
      );
      const tree = page.getByRole('tree');
      await tree.getByText('index.html', { exact: true }).click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
      const failure = page.getByRole('alertdialog', { name: 'Delete failed' });
      await expect(failure).toBeVisible();
      expect(readFileSync(file, 'utf8')).toBe('<h1>Keep me</h1>');
      await failure.getByRole('button', { name: 'OK' }).click();
      await expect(tree.getByText('index.html', { exact: true })).toBeVisible();
      await page.evaluate(() =>
        window.electronAPI!.sqlite.run('DROP TRIGGER refuse_delete_safety'),
      );
      await launch.app.close();
      launch = await launchApp({ dir });
      await launch.page.getByRole('button', { name: /enter/i }).click();
      await launch.page.getByRole('button', { name: 'Open My Crux', exact: true }).click();
      const restoredTree = launch.page.getByRole('tree');
      await expect(restoredTree.getByText('index.html', { exact: true })).toBeVisible();
      await restoredTree.getByText('index.html', { exact: true }).click({ button: 'right' });
      await launch.page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
      await launch.page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
      await expect.poll(() => existsSync(file)).toBe(false);
      await expect(restoredTree.getByText('index.html', { exact: true })).toHaveCount(0);
      await ensurePane(launch.page, 'history', 'Toggle growth');
      const history = launch.page.getByTestId('pane-body-history');
      await expect(history.getByText('No snapshots yet')).toBeVisible();
      await history.getByRole('button', { name: 'Edits', exact: true }).click();
      await history
        .locator('li')
        .filter({ hasText: 'Safety copy' })
        .first()
        .getByRole('button', { name: /Restore recovery/ })
        .click();
      await launch.page
        .getByRole('dialog')
        .getByRole('button', { name: 'Restore files', exact: true })
        .click();
      await expect
        .poll(() => (existsSync(file) ? readFileSync(file, 'utf8') : null))
        .toBe('<h1>Keep me</h1>');
      await launch.page.getByRole('tree').getByText('index.html', { exact: true }).click();
      await expect(launch.page.locator('.monaco-editor').first()).toContainText('Keep me');
    } finally {
      await launch.app.close();
    }
  });

  test('deleting a file keeps protected Edit history without Growth', async () => {
    const { app, page } = await launchApp();
    try {
      await plantWithFile(page);
      const tree = page.getByRole('tree');
      await tree.getByText('index.html', { exact: true }).click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toContainText('A safety copy is kept in Edit history');
      await dialog.getByRole('button', { name: 'Delete' }).click();
      await expect(tree.getByText('index.html', { exact: true })).toHaveCount(0, {
        timeout: 15_000,
      });
      await ensurePane(page, 'history', 'Toggle growth');
      const history = page.getByTestId('pane-body-history');
      await expect(history.getByText('No snapshots yet')).toBeVisible();
      await history.getByRole('button', { name: 'Edits', exact: true }).click();
      await expect(history.getByText('Safety copy', { exact: true })).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test('Clear on the store exports a copy first when asked', async () => {
    const { app, page } = await launchApp();
    try {
      await plantWithFile(page);
      await ensurePane(page, 'store', 'Toggle store');
      const store = page.getByTestId('pane-body-store');
      await store.getByRole('button', { name: '+ Add key' }).click();
      const keyInput = store.getByPlaceholder('key name');
      await keyInput.fill('score');
      await keyInput.press('Enter');
      await expect(store).toContainText('1 key');

      await armBlobCapture(page);
      await store.getByRole('button', { name: 'Clear all' }).click();
      const ask = page.getByRole('dialog').filter({ hasText: 'An export is the only way back' });
      await expect(ask).toBeVisible();
      await ask.getByRole('button', { name: 'Export a copy, then clear' }).click();
      await expect.poll(() => blobCount(page), { timeout: 15_000 }).toBe(1);
      const doc = JSON.parse(await lastBlobText(page));
      expect(doc.format).toBe('crux-store');
      expect(Object.keys(doc.protected ?? {}).length + Object.keys(doc.public ?? {}).length).toBe(
        1,
      );
      await expect(store.getByText('No store entries yet')).toBeVisible({ timeout: 15_000 });

      // Cancelling the dialog clears nothing
      await store.getByRole('button', { name: '+ Add key' }).click();
      await store.getByPlaceholder('key name').fill('again');
      await store.getByPlaceholder('key name').press('Enter');
      await store.getByRole('button', { name: 'Clear all' }).click();
      await expect(ask).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(store).toContainText('1 key');
    } finally {
      await app.close();
    }
  });

  test('Wipe garden offers an export first and writes the .garden before wiping', async () => {
    const { app, page } = await launchApp();
    try {
      await plantWithFile(page);
      // close the workspace (ADR 0018: a wipe refuses while one is open)
      await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
      await page
        .getByRole('button', { name: /^Close .* workspace$/ })
        .first()
        .click();
      const closeDlg = page.getByRole('dialog', { name: 'Close workspace' });
      if (await closeDlg.isVisible().catch(() => false))
        await page.getByRole('button', { name: 'Save and close', exact: true }).click();
      await expect(page.getByText('Home Garden', { exact: true })).toBeVisible({ timeout: 15_000 });

      await armBlobCapture(page);
      await page.keyboard.press('ControlOrMeta+,');
      await page.locator('h2', { hasText: /^Garden$/ }).click();
      await page.getByPlaceholder('delete me').fill('delete me');
      await page.getByRole('button', { name: 'Wipe garden' }).click();
      const ask = page.getByRole('dialog').filter({ hasText: 'the only way back' });
      await expect(ask).toBeVisible();
      // Escape = nothing happens
      await page.keyboard.press('Escape');
      await expect(ask).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Wipe garden' })).toBeVisible();

      await page.getByRole('button', { name: 'Wipe garden' }).click();
      await ask.getByRole('button', { name: 'Export, then wipe' }).click();
      await expect.poll(() => blobCount(page), { timeout: 60_000 }).toBe(1);
      await expect(page.getByRole('button', { name: /enter/i })).toBeVisible({ timeout: 60_000 });
    } finally {
      await app.close();
    }
  });
});
