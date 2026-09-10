import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';

const evidence = resolve(__dirname, '../../docs/notes-crux');
test('Notes Crux: create → write → image → Growth → restart → selected public edition', async () => {
  test.setTimeout(300000);
  let instance = await launchApp();
  mkdirSync(evidence, { recursive: true });
  const dir = instance.dir;
  try {
    let page = instance.page;
    await page.setViewportSize({ width: 1440, height: 1000 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Notes/ }).click();
    await page.getByLabel('Name', { exact: true }).fill('Field notes');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const folder = (await storedCrux(page, id)).projectFolder as string;
    const frame = () => page.frameLocator('iframe[data-crux-id]');
    await expect(frame().getByRole('heading', { name: 'Welcome', exact: true })).toBeVisible({
      timeout: 120000,
    });
    await frame().getByLabel('New note', { exact: true }).fill('Research/Field journal');
    await frame().getByRole('button', { name: 'Create note', exact: true }).click();
    const editor = () => frame().locator('.tiptap[contenteditable=true]').first();
    await expect(
      frame().getByRole('heading', { name: 'Field journal', exact: true }),
    ).toBeVisible();
    await editor().fill('Today I found a quiet place for growing ideas.');
    await page
      .getByTestId('workshop-view')
      .getByRole('button', { name: 'Advanced', exact: true })
      .click();
    await expect(page.getByTestId('workshop-view')).toHaveAttribute('data-view', 'advanced');
    await page
      .getByTestId('workshop-view')
      .getByRole('button', { name: 'Clean', exact: true })
      .click();
    await frame()
      .getByRole('button', { name: /Research\/Field journal/ })
      .click();
    await expect(frame().getByRole('status')).toContainText('Saved');
    expect(readFileSync(join(folder, 'notebook/Research/Field journal.md'), 'utf8')).toContain(
      'quiet place',
    );

    // Exercise the actual clipboard image handler; image bytes must reach the Project Folder.
    await editor().evaluate((element) => {
      const bytes = Uint8Array.from(
        atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
        ),
        (c) => c.charCodeAt(0),
      );
      const clipboardData = new DataTransfer();
      clipboardData.items.add(new File([bytes], 'Sketch.png', { type: 'image/png' }));
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
      );
    });
    await expect(editor().locator('img')).toHaveCount(1);
    await frame().getByRole('button', { name: 'Save now', exact: true }).click();
    await expect
      .poll(() => readFileSync(join(folder, 'notebook/Research/Field journal.md'), 'utf8'))
      .toContain('../assets/');
    await frame().getByLabel('Include in public edition').check();
    await expect
      .poll(() => JSON.parse(readFileSync(join(folder, 'notebook/publish.json'), 'utf8')).pages)
      .toEqual(['Research/Field journal.md']);
    // A second note remains private, as do the app's Collaboration and source files.
    await frame().getByLabel('New note', { exact: true }).fill('Private thoughts');
    await frame().getByRole('button', { name: 'Create note', exact: true }).click();
    await editor().fill('PRIVATE_NOTE_SENTINEL_9e2a');
    await frame().getByRole('button', { name: 'Save now', exact: true }).click();
    await expect
      .poll(() => readFileSync(join(folder, 'notebook/Private thoughts.md'), 'utf8'))
      .toContain('PRIVATE_NOTE_SENTINEL');
    await expect(frame().getByLabel('Include in public edition')).not.toBeChecked();
    // An external edit cannot be silently replaced by the open rich editor.
    const privatePath = join(folder, 'notebook/Private thoughts.md');
    const header = '---\ninternal: PRIVATE_FRONTMATTER_SENTINEL\n---\n';
    writeFileSync(privatePath, header + 'PRIVATE_NOTE_SENTINEL_9e2a from another editor');
    await editor().fill('An unsaved conflicting draft');
    await frame().getByRole('button', { name: 'Save now', exact: true }).click();
    await expect(frame().getByRole('alert')).toContainText('changed elsewhere');
    expect(readFileSync(privatePath, 'utf8')).toContain('from another editor');
    page.once('dialog', (dialog) => dialog.accept());
    await frame().getByRole('button', { name: 'Discard draft and reload', exact: true }).click();
    await expect(editor()).toContainText('from another editor');
    await editor().fill('PRIVATE_NOTE_SENTINEL_9e2a with frontmatter preserved');
    await frame().getByRole('button', { name: 'Save now', exact: true }).click();
    await expect
      .poll(() => readFileSync(privatePath, 'utf8'))
      .toBe(header + 'PRIVATE_NOTE_SENTINEL_9e2a with frontmatter preserved\n');

    await frame()
      .getByRole('button', { name: /Research\/Field journal/ })
      .click();
    await page.screenshot({ path: join(evidence, 'notebook.png') });
    const growth = (await page.evaluate(
      async (id) =>
        window.electronAPI!.sqlite.get(
          "SELECT COUNT(*) AS count FROM dimensions WHERE source_id = ? AND type = 'growth'",
          [id],
        ),
      id,
    )) as { count: number };
    expect(growth.count).toBeGreaterThan(3);

    const archivePath = join(evidence, 'field-notes.crux');
    await page.evaluate(() => {
      const state = window as unknown as { notebookExport?: Blob };
      const blobs = new Map<string, Blob>();
      const original = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        const url = original(blob);
        if (blob instanceof Blob) blobs.set(url, blob);
        return url;
      };
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download.endsWith('.crux')) state.notebookExport = blobs.get(this.href);
        else click.call(this);
      };
    });
    await page.getByRole('button', { name: 'Toggle export', exact: true }).click();
    await page.getByRole('button', { name: 'Export Crux', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => !!(window as unknown as { notebookExport?: Blob }).notebookExport),
      )
      .toBe(true);
    const encoded = await page.evaluate(async () => {
      const bytes = new Uint8Array(
        await (window as unknown as { notebookExport: Blob }).notebookExport.arrayBuffer(),
      );
      let text = '';
      for (let i = 0; i < bytes.length; i += 0x8000)
        text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(text);
    });
    writeFileSync(archivePath, Buffer.from(encoded, 'base64'));
    await page.getByRole('button', { name: 'Toggle export', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Export Crux', exact: true })).toHaveCount(0);
    await instance.app.close();
    instance = await launchApp({ dir });
    page = instance.page;
    await page.getByRole('button', { name: /enter/i }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(frame().getByRole('heading', { name: 'Welcome', exact: true })).toBeVisible({
      timeout: 60000,
    });
    await frame()
      .getByRole('button', { name: /Research\/Field journal/ })
      .click();
    await expect(editor()).toContainText('quiet place');
    await expect(editor().locator('img')).toHaveCount(1);
    await expect
      .poll(() =>
        editor()
          .locator('img')
          .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      )
      .toBe(true);
    await expect(frame().getByLabel('Include in public edition')).toBeChecked();

    // Same native build used by Publish, without sending anything to a public service.
    const built = await page.evaluate(
      async (folder) => window.electronAPI!.toolchain.build(folder),
      folder,
    );
    expect(built.code, built.log).toBe(0);
    const dist = join(folder, 'dist');
    const allText = (path: string): string =>
      readdirSync(path, { withFileTypes: true })
        .map((f) =>
          f.isDirectory() ? allText(join(path, f.name)) : readFileSync(join(path, f.name), 'utf8'),
        )
        .join('\n');
    expect(allText(dist)).not.toContain('PRIVATE_NOTE_SENTINEL');
    expect(allText(dist)).not.toContain('PRIVATE_FRONTMATTER_SENTINEL');
    expect(built.distFiles.some((p) => p.includes('notebook/Private'))).toBe(false);
    const server = createServer((req, res) => {
      const path =
        req.url === '/' ? 'index.html' : decodeURIComponent(req.url!.slice(1).split('?')[0]!);
      if (path.includes('..')) {
        res.writeHead(404);
        res.end();
        return;
      }
      try {
        res.setHeader(
          'Content-Type',
          path.endsWith('.js')
            ? 'text/javascript'
            : path.endsWith('.css')
              ? 'text/css'
              : path.endsWith('.txt')
                ? 'text/plain'
                : 'text/html',
        );
        res.end(readFileSync(join(dist, path)));
      } catch {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    try {
      const port = (server.address() as { port: number }).port;
      await page.locator('iframe[data-crux-id]').evaluate((element: HTMLIFrameElement, url) => {
        element.src = url;
      }, `http://127.0.0.1:${port}/`);
      await expect(frame().getByRole('heading', { name: 'My notebook' })).toBeVisible();
      await expect(frame().locator('article')).toContainText('quiet place');
      await expect(frame().locator('article img')).toHaveCount(1);
      await expect(frame().getByRole('button', { name: 'Save now' })).toHaveCount(0);
      await expect(frame().getByText('Private thoughts', { exact: true })).toHaveCount(0);
      await page.screenshot({ path: join(evidence, 'public-edition.png') });
      writeFileSync(
        join(evidence, 'evidence.json'),
        JSON.stringify(
          {
            growthCheckpoints: growth.count,
            buildCode: built.code,
            imageFiles: readdirSync(join(folder, 'notebook/assets')).length,
            privateContentExcluded: true,
          },
          null,
          2,
        ),
      );
    } finally {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
    const restored = await launchApp();
    try {
      await enterGarden(restored.page);
      await restored.page.getByRole('button', { name: 'Add Crux', exact: true }).click();
      const chooserReady = restored.page.waitForEvent('filechooser');
      await restored.page.getByRole('button', { name: 'Import .crux file', exact: true }).click();
      await (await chooserReady).setFiles(archivePath);
      await expect(restored.page.locator('[data-workspace-id]')).toBeVisible();
      const restoredId = (await restored.page
        .locator('[data-workspace-id]')
        .getAttribute('data-workspace-id'))!;
      const restoredFolder = (await storedCrux(restored.page, restoredId)).projectFolder as string;
      expect(
        readFileSync(join(restoredFolder, 'notebook/Research/Field journal.md'), 'utf8'),
      ).toContain('quiet place');
      expect(readFileSync(join(restoredFolder, 'notebook/Private thoughts.md'), 'utf8')).toContain(
        'PRIVATE_NOTE_SENTINEL',
      );
      expect(readdirSync(join(restoredFolder, 'notebook/assets'))).toHaveLength(1);
      const restoredFrame = restored.page.frameLocator('iframe[data-crux-id]');
      await expect(
        restoredFrame.getByRole('heading', { name: 'Welcome', exact: true }),
      ).toBeVisible({ timeout: 120000 });
      await restoredFrame.getByRole('button', { name: /Research\/Field journal/ }).click();
      await expect(restoredFrame.locator('.tiptap')).toContainText('quiet place');
      const restoredGrowth = (await restored.page.evaluate(
        async (id) =>
          window.electronAPI!.sqlite.get(
            "SELECT COUNT(*) AS count FROM dimensions WHERE source_id = ? AND type = 'growth'",
            [id],
          ),
        restoredId,
      )) as { count: number };
      expect(restoredGrowth.count).toBe(growth.count);
      const recorded = JSON.parse(readFileSync(join(evidence, 'evidence.json'), 'utf8'));
      writeFileSync(
        join(evidence, 'evidence.json'),
        JSON.stringify(
          {
            ...recorded,
            freshArchiveImport: true,
            restoredGrowthCheckpoints: restoredGrowth.count,
            immediateViewSwitchSaved: true,
            externalConflictRecovered: true,
            frontmatterPreserved: true,
          },
          null,
          2,
        ),
      );
    } finally {
      await restored.app.close();
    }
  } finally {
    await instance.app.close();
  }
});
