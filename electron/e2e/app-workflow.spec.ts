import { test, expect, type Page } from '@playwright/test';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  mkdtempSync,
  existsSync,
  statSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux } from './native-archive-helpers';
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
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 2000, height: 1200 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Notes/ }).click();
    await page.getByLabel('Name', { exact: true }).fill('Novel workshop');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const main = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const folder = (await storedCrux(page, main)).projectFolder as string;
    const frame = () => page.frameLocator('iframe[data-crux-id]');
    const status = () => frame().locator('#garden-project [role=status]');
    await expect(status()).toHaveText('Saved', { timeout: 120000 });
    // The actual Tigrana (ADR 0040): the bar's Import notebook folder… takes the folder through
    // the host; the notebook reloads with Imported/<name> in its tree.
    const chooser = page.waitForEvent('filechooser');
    await frame().getByRole('button', { name: 'Import notebook folder…', exact: true }).click();
    await (await chooser).setFiles(vault);
    await expect
      .poll(() => existsSync(join(folder, 'notebook/Imported/Novel/Outline.md')), {
        timeout: 60000,
      })
      .toBe(true);
    await expect(status()).toHaveText('Saved', { timeout: 120000 });
    const openNote = async (folderPath: string, title: string) => {
      // Tigrana's Sections pane lists the top-level folders; choosing one shows its whole tree
      // (subfolders unfolded) in the middle pane, where the note is picked by title.
      await frame()
        .locator(`.folder-row[data-folder-path="${folderPath.split('/')[0]}"]`)
        .click();
      await frame().locator('.unified-tree-pane').getByText(title, { exact: true }).click();
      await expect(frame().locator('.tiptap').first()).toBeVisible();
    };
    const outline = 'Imported/Novel/Outline';
    await openNote('Imported/Novel', 'Outline');
    await page.screenshot({ path: join(evidence, 'import-review.png') });
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
    await frame().getByRole('button', { name: 'Public edition…' }).click();
    await frame()
      .locator('#garden-publication input[data-note="Imported/Novel/Outline.md"]')
      .check();
    await frame()
      .locator('#garden-publication input[data-note="Imported/Novel/Chapters/One.md"]')
      .check();
    await expect
      .poll(() => JSON.parse(readFileSync(join(folder, 'notebook/publish.json'), 'utf8')).pages)
      .toEqual(['Imported/Novel/Outline.md', 'Imported/Novel/Chapters/One.md']);
    await frame().getByRole('button', { name: 'Public edition…' }).click();
    await expect(status()).toHaveText('Saved');
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
    const cssPath = join(taskRow.project_folder, 'src/styles/app.css');
    writeFileSync(
      cssPath,
      readFileSync(cssPath, 'utf8') +
        '\n/* Novel customization */\n.note-editor h1 { color: rgb(171, 121, 231); }\n',
    );
    expect(readFileSync(join(folder, 'src/styles/app.css'), 'utf8')).not.toContain(
      'Novel customization',
    );
    // The task bar ignores a switch while the new task is still settling; ask again until it takes.
    await expect(async () => {
      await page.getByTestId('task-bar').getByRole('link', { name: 'Main', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', main, {
        timeout: 5000,
      });
    }).toPass({ timeout: 60000 });
    await page
      .getByTestId('workshop-view')
      .getByRole('button', { name: 'Use app', exact: true })
      .click();
    await expect(status()).toHaveText('Saved', { timeout: 120000 });
    await openNote('Imported/Novel/Chapters', 'One');
    await frame().locator('.tiptap').first().click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' NEWER_MAIN_CHAPTER');
    await expect
      .poll(() => readFileSync(join(folder, 'notebook/Imported/Novel/Chapters/One.md'), 'utf8'))
      .toContain('NEWER_MAIN_CHAPTER');
    await page
      .getByTestId('task-bar')
      .getByRole('link', { name: /^Customize app/ })
      .click();
    // The task's own Tigrana reloads behind the source view and records the note it reopened;
    // review once its metadata has settled, as a person would after the switch.
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', taskId);
    const taskMetadata = join(taskRow.project_folder, 'notebook/.tigrana/metadata.json');
    const mtime = () => statSync(taskMetadata).mtimeMs;
    await expect
      .poll(
        async () => {
          const before = mtime();
          await page.waitForTimeout(4000);
          return mtime() === before;
        },
        { timeout: 60000 },
      )
      .toBe(true);
    await page.getByRole('button', { name: 'Review changes', exact: true }).click();
    const merge = page.getByRole('dialog', { name: 'Review changes for Main' });
    // The first check installs the toolchain into the task (pnpm-lock.yaml appears as a source
    // change) and asks for a second look; the second check verifies the settled result.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await merge.getByRole('button', { name: 'Check combined result' }).click();
      await expect(merge.getByRole('button', { name: 'Check combined result' })).toBeEnabled({
        timeout: 300000,
      });
      if (await merge.getByRole('checkbox').isEnabled()) break;
    }
    await expect(merge.getByRole('checkbox')).toBeEnabled({ timeout: 120000 });
    await merge.getByRole('checkbox').check();
    await merge.getByRole('button', { name: 'Merge into Main', exact: true }).click();
    await expect(merge).toHaveCount(0, { timeout: 60000 });
    expect(readFileSync(join(folder, 'src/styles/app.css'), 'utf8')).toContain(
      'Novel customization',
    );
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
    await expect(status()).toHaveText('Saved', { timeout: 120000 });
    await openNote('Imported/Novel', 'Outline');
    await expect(frame().locator('.tiptap').first()).toContainText('First chapter');
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
    const archivePath = join(evidence, 'novel-workshop.crux');
    await exportNativeCrux(page, archivePath, instance.app, async () => {
      // The Export pane opens from the Workshop; a click that lands while another pane is
      // still closing can be swallowed, so ask again until the pane is there.
      await expect(async () => {
        await page
          .getByTestId('workshop-view')
          .getByRole('button', { name: 'Export complete Crux', exact: true })
          .click();
        await expect(page.getByRole('button', { name: 'Export Crux', exact: true })).toBeVisible({
          timeout: 5000,
        });
      }).toPass({ timeout: 60000 });
    });
    await expect(page.getByText(/Complete editable Crux: includes app code/)).toBeVisible();
    await page.screenshot({ path: join(evidence, 'export-explanation.png') });
    await page.getByRole('button', { name: 'Toggle export', exact: true }).click();
    const installed = await page.evaluate(
      async (folder) => window.electronAPI!.toolchain.install(folder),
      folder,
    );
    expect(installed.code, installed.log).toBe(0);
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
      const site = frame();
      await expect(site.locator('article').first()).toBeVisible();
      await expect(site.locator('article img').first()).toBeVisible();
      await expect(site.locator('body')).toContainText('NEWER_MAIN_CHAPTER');
      await expect(site.locator('body')).not.toContainText('PRIVATE_NOVEL_ENDING');
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
      expect(readFileSync(join(importedFolder, 'src/styles/app.css'), 'utf8')).toContain(
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
        restored.page.frameLocator('iframe[data-crux-id]').locator('#garden-project [role=status]'),
      ).toHaveText('Saved', { timeout: 120000 });
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
