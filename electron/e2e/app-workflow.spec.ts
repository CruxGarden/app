import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
const evidence = resolve(__dirname, '../../docs/app-workflow');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);
const header = '---\nid: PRIVATE_TIGRANA_ID\ncreated_at: 2026-09-10\n---\n';
async function checkpointMeta(page: Page, id: string) {
  return page.evaluate(
    async (id) =>
      (
        await window.electronAPI!.sqlite.all(
          "SELECT meta FROM dimensions WHERE source_id = ? AND type = 'growth' ORDER BY weight",
          [id],
        )
      ).map((r) => JSON.parse(r.meta as string)),
    id,
  );
}
test('import a Tigrana folder, customize in a Task, keep Main notes, Share selected content and reopen the complete Crux', async () => {
  test.setTimeout(420000);
  const instance = await launchApp();
  mkdirSync(evidence, { recursive: true });
  const vault = join(mkdtempSync(join(tmpdir(), 'crux-vault-fixture-')), 'Novel');
  for (const dir of ['Chapters', '.assets', '.tigrana'])
    mkdirSync(join(vault, dir), { recursive: true });
  const original =
    header + '# Outline\n\n[First chapter](Chapters/One.md)\n\n![Sketch](.assets/sketch.png)\n';
  writeFileSync(join(vault, 'Outline.md'), original);
  writeFileSync(join(vault, 'Chapters/One.md'), '# One\n\nThe garden gate opened.\n');
  writeFileSync(join(vault, 'Private.md'), 'PRIVATE_NOVEL_ENDING');
  writeFileSync(join(vault, '.tigrana/metadata.json'), '{"pinnedNotes":["PRIVATE_TIGRANA_ID"]}');
  writeFileSync(join(vault, '.assets/sketch.png'), png);
  writeFileSync(join(vault, 'unsupported.txt'), 'Not imported');
  try {
    const page = instance.page;
    await page.setViewportSize({ width: 1600, height: 1050 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Notes/ }).click();
    await page.getByLabel('Name', { exact: true }).fill('Novel workshop');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const main = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const folder = (await storedCrux(page, main)).projectFolder as string;
    const frame = () => page.frameLocator('iframe[data-crux-id]');
    await expect(frame().getByRole('heading', { name: 'Welcome', exact: true })).toBeVisible({
      timeout: 120000,
    });
    await frame().getByLabel('Choose notebook folder').setInputFiles(vault);
    const reviewImport = frame().getByRole('dialog', { name: 'Import notebook', exact: true });
    await expect(reviewImport).toContainText('3 notes · 1 images · 1 unsupported files skipped');
    await page.screenshot({ path: join(evidence, 'import-review.png') });
    await reviewImport.getByRole('button', { name: 'Import notes', exact: true }).click();
    await expect(reviewImport).toHaveCount(0, { timeout: 60000 });
    const outline = 'Imported/Novel/Outline';
    await frame()
      .getByRole('button', { name: new RegExp(outline) })
      .click();
    await expect(frame().locator('.tiptap img')).toHaveCount(1);
    await expect
      .poll(() =>
        frame()
          .locator('.tiptap img')
          .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      )
      .toBe(true);
    expect(readFileSync(join(folder, 'notebook', outline + '.md'), 'utf8')).toBe(original);
    expect(readFileSync(join(folder, 'notebook/Imported/Novel/.assets/sketch.png'))).toEqual(png);
    expect(
      readFileSync(join(folder, 'notebook/Imported/Novel/.tigrana/metadata.json'), 'utf8'),
    ).toContain('PRIVATE_TIGRANA_ID');
    expect(JSON.parse(readFileSync(join(folder, 'notebook/publish.json'), 'utf8')).pages).toEqual(
      [],
    );
    await frame().getByLabel('Include in public edition').check();
    await frame()
      .getByRole('button', { name: /Imported\/Novel\/Chapters\/One/ })
      .click();
    await frame().getByLabel('Include in public edition').check();
    await page
      .getByTestId('workshop-view')
      .getByRole('button', { name: 'Customize app', exact: true })
      .click();
    await page
      .getByLabel('App changes', { exact: true })
      .fill('Make the editor headings purple. Keep my novel notes intact.');
    await page.getByRole('button', { name: 'Save and customize', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Customize app', exact: true })).toHaveCount(0, {
      timeout: 60000,
    });
    await expect(page.getByTestId('workshop-view')).toHaveAttribute('data-view', 'advanced');
    const taskId = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    expect(taskId).not.toBe(main);
    const taskRow = (await page.evaluate(
      async (id) =>
        window.electronAPI!.sqlite.get('SELECT project_folder FROM working_copies WHERE id = ?', [
          id,
        ]),
      taskId,
    )) as { project_folder: string };
    const cssPath = join(taskRow.project_folder, 'src/notebook.css');
    writeFileSync(
      cssPath,
      readFileSync(cssPath, 'utf8') +
        '\n/* Novel customization */\n.notebook-main h1 { color: rgb(171, 121, 231); }\n',
    );
    expect(readFileSync(join(folder, 'src/notebook.css'), 'utf8')).not.toContain(
      'Novel customization',
    );
    await page.getByTestId('task-bar').getByRole('link', { name: 'Main', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', main);
    await page
      .getByTestId('workshop-view')
      .getByRole('button', { name: 'Use app', exact: true })
      .click();
    await frame()
      .getByRole('button', { name: /Imported\/Novel\/Chapters\/One/ })
      .click();
    await frame()
      .locator('.tiptap[contenteditable=true]')
      .first()
      .fill('The garden gate opened. NEWER_MAIN_CHAPTER');
    await frame().getByRole('button', { name: 'Save now', exact: true }).click();
    await expect
      .poll(() => readFileSync(join(folder, 'notebook/Imported/Novel/Chapters/One.md'), 'utf8'))
      .toContain('NEWER_MAIN_CHAPTER');
    await page
      .getByTestId('task-bar')
      .getByRole('link', { name: /^Customize app/ })
      .click();
    await page.getByRole('button', { name: 'Review changes', exact: true }).click();
    const merge = page.getByRole('dialog', { name: 'Review changes for Main' });
    await merge.getByRole('button', { name: 'Check combined result' }).click();
    await expect(merge.getByRole('checkbox')).toBeEnabled({ timeout: 120000 });
    await merge.getByRole('checkbox').check();
    await merge.getByRole('button', { name: 'Merge into Main', exact: true }).click();
    await expect(merge).toHaveCount(0, { timeout: 60000 });
    expect(readFileSync(join(folder, 'src/notebook.css'), 'utf8')).toContain('Novel customization');
    expect(readFileSync(join(folder, 'notebook/Imported/Novel/Chapters/One.md'), 'utf8')).toContain(
      'NEWER_MAIN_CHAPTER',
    );
    expect(readFileSync(join(vault, 'Outline.md'), 'utf8')).toBe(original);
    const growth = await checkpointMeta(page, main);
    expect(growth.some((m) => m.appChanges?.content > 0)).toBe(true);
    expect(growth.some((m) => m.appChanges?.app > 0)).toBe(true);
    await page
      .getByTestId('workshop-view')
      .getByRole('button', { name: 'Use app', exact: true })
      .click();
    await expect(frame().getByRole('heading', { name: 'Welcome', exact: true })).toBeVisible({
      timeout: 120000,
    });
    await frame()
      .getByRole('button', { name: new RegExp(outline) })
      .click();
    await expect(frame().locator('.tiptap')).toContainText('First chapter');
    await page.screenshot({ path: join(evidence, 'customized-notebook.png') });
    await page.getByRole('button', { name: 'Toggle history', exact: true }).click();
    await expect(
      page.getByTestId('growth-app-changes').filter({ hasText: 'Content changed' }).first(),
    ).toBeVisible();
    await page.getByRole('button').filter({ hasText: 'Imported notebook: Novel' }).first().click();
    await page.getByRole('button', { name: 'Revert', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText(
      'Restore the app code and all its content',
    );
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: 'Toggle history', exact: true }).click();
    await page
      .getByTestId('workshop-view')
      .getByRole('button', { name: 'Share selected content', exact: true })
      .click();
    await expect(
      page.getByText(
        'Not shared yet. Share selected content as a read-only website at its own address. Private content and Collaboration stay here.',
        { exact: true },
      ),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Toggle share', exact: true }).click();
    await page.evaluate(() => {
      const state = window as unknown as { exportedCrux?: Blob };
      const blobs = new Map<string, Blob>();
      const original = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        const url = original(blob);
        if (blob instanceof Blob) blobs.set(url, blob);
        return url;
      };
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download.endsWith('.crux')) state.exportedCrux = blobs.get(this.href);
        else click.call(this);
      };
    });
    await page
      .getByTestId('workshop-view')
      .getByRole('button', { name: 'Export complete Crux', exact: true })
      .click();
    await expect(page.getByText(/Complete editable Crux: includes app code/)).toBeVisible();
    await page.getByRole('button', { name: 'Export Crux', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => !!(window as unknown as { exportedCrux?: Blob }).exportedCrux),
      )
      .toBe(true);
    const encoded = await page.evaluate(async () => {
      const bytes = new Uint8Array(
        await (window as unknown as { exportedCrux: Blob }).exportedCrux.arrayBuffer(),
      );
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000)
        s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    });
    const archivePath = join(evidence, 'novel-workshop.crux');
    writeFileSync(archivePath, Buffer.from(encoded, 'base64'));
    await page.screenshot({ path: join(evidence, 'export-explanation.png') });
    await page.getByRole('button', { name: 'Toggle export', exact: true }).click();
    const built = await page.evaluate(
      async (folder) => window.electronAPI!.toolchain.build(folder),
      folder,
    );
    expect(built.code, built.log).toBe(0);
    const dist = join(folder, 'dist');
    const text = (dir: string): string =>
      readdirSync(dir, { withFileTypes: true })
        .map((f) =>
          f.isDirectory() ? text(join(dir, f.name)) : readFileSync(join(dir, f.name), 'utf8'),
        )
        .join('\n');
    expect(text(dist)).not.toContain('PRIVATE_NOVEL_ENDING');
    expect(text(dist)).not.toContain('PRIVATE_TIGRANA_ID');
    const server = createServer((req, res) => {
      const path = decodeURIComponent(req.url!.split('?')[0]!).slice(1) || 'index.html';
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
      await page.locator('iframe[data-crux-id]').evaluate(
        (el: HTMLIFrameElement, url) => {
          el.src = url;
        },
        `http://127.0.0.1:${(server.address() as { port: number }).port}/`,
      );
      await expect(frame().locator('article')).toBeVisible();
      await frame().getByRole('link', { name: outline, exact: true }).click();
      await expect(frame().locator('article img')).toHaveCount(1);
      await frame().getByRole('link', { name: 'First chapter', exact: true }).click();
      await expect(frame().locator('article')).toContainText('NEWER_MAIN_CHAPTER');
      await page.screenshot({ path: join(evidence, 'shared-notebook.png') });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
    const restored = await launchApp();
    try {
      await enterGarden(restored.page);
      await restored.page.getByRole('button', { name: 'Add Crux', exact: true }).click();
      const chooser = restored.page.waitForEvent('filechooser');
      await restored.page.getByRole('button', { name: 'Import .crux file', exact: true }).click();
      await (await chooser).setFiles(archivePath);
      await expect(restored.page.locator('[data-workspace-id]')).toBeVisible();
      const id = (await restored.page
        .locator('[data-workspace-id]')
        .getAttribute('data-workspace-id'))!;
      const importedFolder = (await storedCrux(restored.page, id)).projectFolder as string;
      expect(readFileSync(join(importedFolder, 'src/notebook.css'), 'utf8')).toContain(
        'Novel customization',
      );
      expect(
        readFileSync(join(importedFolder, 'notebook/Imported/Novel/Private.md'), 'utf8'),
      ).toContain('PRIVATE_NOVEL_ENDING');
      expect(
        readFileSync(join(importedFolder, 'notebook/Imported/Novel/Chapters/One.md'), 'utf8'),
      ).toContain('NEWER_MAIN_CHAPTER');
      expect((await checkpointMeta(restored.page, id)).map((m) => m.appChanges)).toEqual(
        growth.map((m) => m.appChanges),
      );
      await expect(
        restored.page
          .frameLocator('iframe[data-crux-id]')
          .getByRole('heading', { name: 'Welcome', exact: true }),
      ).toBeVisible({ timeout: 120000 });
      writeFileSync(
        join(evidence, 'evidence.json'),
        JSON.stringify(
          {
            importedNotes: 3,
            metadataPreserved: true,
            originalUnchanged: true,
            taskMergePreservedNewerMainContent: true,
            growthCheckpoints: growth.length,
            buildCode: built.code,
            publicContentFiltered: true,
            archiveReopened: true,
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
