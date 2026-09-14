import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createServer } from 'node:http';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';

/**
 * The actual Moqira (upstream's app, believing it runs in Tauri while the
 * Garden stands in): a design edit and the app's own Save reach
 * mockups/project.json, the host's flush saves on a view switch, a Mood styles
 * the chrome but not the design, a Moqira file is opened through the app's own
 * Open, public-edition choices are kept, the project survives a restart, a
 * stale write is refused with the draft kept, and the published edition keeps
 * only the chosen wireframes and starts interactive.
 */
const frameOf = (page: Page) => page.frameLocator('iframe[data-crux-id]');
const status = (page: Page) => frameOf(page).locator('#garden-project [role=status]');

test('Moqira: the actual app — edit, save, Mood, open a file, public edition, restart, conflict, publish', async () => {
  test.setTimeout(10 * 60_000);
  let instance = await launchApp();
  const dir = instance.dir;
  const evidence = resolve(__dirname, '../../docs/moqira');
  mkdirSync(evidence, { recursive: true });
  let folder = '';
  const projectPath = () => join(folder, 'mockups/project.json');
  const read = () => JSON.parse(readFileSync(projectPath(), 'utf8'));
  const publication = () => JSON.parse(readFileSync(join(folder, 'mockups/publish.json'), 'utf8'));
  try {
    let page = instance.page;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1050 });
    await enterGarden(page);

    await test.step('create; the app starts as upstream does and its first save records the project', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Mockups/ }).click();
      await page.getByLabel('Name', { exact: true }).fill('A small idea');
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder as string;
      console.log('Moqira folder', folder);
      await expect(status(page)).toHaveText('Saved', { timeout: 120000 });
      await expect(frameOf(page).locator('.app-shell')).toBeVisible();
      await expect(frameOf(page).locator('.save-state')).toHaveAttribute('aria-label', 'Saved');
      expect(read().wireframes.length).toBeGreaterThan(0);
      expect(existsSync(join(folder, 'runtime/index.html'))).toBe(true);
      await page.screenshot({ path: join(evidence, 'moqira-initial.png') });
    });

    await test.step('a person places a control and saves with the app; the project file follows', async () => {
      await frameOf(page).locator('.library-item').getByText('Button', { exact: true }).click();
      await expect(frameOf(page).locator('.canvas-node')).toHaveCount(1);
      await expect(status(page)).toHaveText('Unsaved changes');
      await frameOf(page).getByRole('button', { name: 'Save project', exact: true }).click();
      await expect(status(page)).toHaveText('Saved');
      await expect.poll(() => read().wireframes[0].nodes.length).toBe(1);
    });

    let canvasAccent = '';
    let canvasFont = '';
    await test.step('a Garden Mood styles the chrome; the design keeps its own accent and type', async () => {
      canvasAccent = await frameOf(page)
        .locator('.canvas')
        .evaluate((el) => getComputedStyle(el).getPropertyValue('--accent'));
      canvasFont = await frameOf(page)
        .locator('.canvas-node')
        .first()
        .evaluate((el) => getComputedStyle(el).fontFamily);
      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      await page.getByTestId('bundled-raster-bars').getByRole('button', { name: 'Apply' }).click();
      await page
        .locator('[data-modal-open]')
        .getByRole('button', { name: 'Close', exact: true })
        .click();
      await expect(page.locator('[data-modal-open]')).toHaveCount(0);
      await expect(frameOf(page).locator('html')).toHaveAttribute('data-garden-mood', 'true');
      expect(
        await frameOf(page)
          .locator('.canvas')
          .evaluate((el) => getComputedStyle(el).getPropertyValue('--accent')),
      ).toBe(canvasAccent);
      expect(
        await frameOf(page)
          .locator('.canvas-node')
          .first()
          .evaluate((el) => getComputedStyle(el).fontFamily),
      ).toBe(canvasFont);
    });

    await test.step('a second wireframe with a label; switching the Workshop view flushes through the app’s Save', async () => {
      await frameOf(page).getByRole('button', { name: 'Add wireframe', exact: true }).click();
      await frameOf(page).locator('.library-item').getByText('Label', { exact: true }).click();
      await expect(status(page)).toHaveText('Unsaved changes');
      await page
        .getByTestId('workshop-view')
        .getByRole('button', { name: 'Advanced', exact: true })
        .click();
      await expect(page.getByTestId('workshop-view')).toHaveAttribute('data-view', 'advanced');
      await expect.poll(() => read().wireframes.length).toBe(2);
      expect(read().wireframes[1].nodes).toHaveLength(1);
      await page
        .getByTestId('workshop-view')
        .getByRole('button', { name: 'Use app', exact: true })
        .click();
      await expect(status(page)).toHaveText('Saved', { timeout: 120000 });
    });

    await test.step('a Moqira file with a link and a private wireframe opens through the app’s own Open', async () => {
      const project = read();
      project.wireframes[1].name = 'Second screen';
      project.wireframes[0].nodes[0].text = 'Continue';
      Object.assign(project.wireframes[0].nodes[0], { x: 48, y: 220, width: 180, height: 44 });
      project.wireframes[0].nodes.push({
        ...project.wireframes[1].nodes[0],
        id: 'hero',
        text: 'Grow your next idea',
        x: 48,
        y: 65,
        width: 520,
        height: 60,
        fontSize: 32,
      });
      project.wireframes[0].nodes[0].links = {
        whole: { kind: 'wireframe', wireframeId: project.wireframes[1].id },
      };
      project.wireframes.push({
        ...project.wireframes[1],
        id: 'private',
        name: 'Private sketch',
        nodes: [
          {
            ...project.wireframes[1].nodes[0],
            id: 'private-label',
            text: 'PRIVATE_WIREFRAME_SENTINEL',
          },
        ],
      });
      project.activeWireframeId = project.wireframes[0].id;
      const chooser = page.waitForEvent('filechooser');
      await frameOf(page).getByRole('button', { name: 'Open project file…', exact: true }).click();
      await (
        await chooser
      ).setFiles({
        name: 'prototype.moq',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(project)),
      });
      await expect(frameOf(page).getByRole('button', { name: /Second screen/ })).toBeVisible();
      await expect(frameOf(page).getByRole('button', { name: /Private sketch/ })).toBeVisible();
      await frameOf(page).getByRole('button', { name: 'Save project', exact: true }).click();
      await expect(status(page)).toHaveText('Saved');
      await expect.poll(() => read().wireframes.length).toBe(3);
      expect(read().wireframes[1].name).toBe('Second screen');
    });

    await test.step('public-edition choices are kept in publish.json', async () => {
      await frameOf(page).getByRole('button', { name: 'Public edition…' }).click();
      const boxes = frameOf(page).locator('#garden-publication input[type=checkbox]');
      await expect(boxes).toHaveCount(3);
      await boxes.nth(0).check();
      await boxes.nth(1).check();
      await expect.poll(() => publication().wireframes.length).toBe(2);
      await expect(status(page)).toHaveText('Saved');
      await frameOf(page).getByRole('button', { name: 'Public edition…' }).click();
      const growth = (await page.evaluate(
        async (id) =>
          window.electronAPI!.sqlite.get(
            "SELECT COUNT(*) AS count FROM dimensions WHERE source_id = ? AND type = 'growth'",
            [id],
          ),
        (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!,
      )) as { count: number };
      expect(growth.count).toBeGreaterThan(2);
      await page.screenshot({ path: join(evidence, 'moqira-editor.png') });
    });

    const stopped = instance.app.waitForEvent('close');
    // The visible window: a hidden thumbnail-capture window may exist at this moment.
    await instance.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.isVisible())!.close());
    await stopped;
    instance = await launchApp({ dir });
    page = instance.page;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1050 });

    await test.step('restart: the project reopens; a stale write is refused and the draft kept', async () => {
      await page.getByRole('button', { name: /enter/i }).click();
      await expect(status(page)).toHaveText('Saved', { timeout: 120000 });
      await expect(frameOf(page).getByRole('button', { name: /Second screen/ })).toBeVisible();
      const external = read();
      external.name = 'Changed externally';
      writeFileSync(projectPath(), JSON.stringify(external));
      await frameOf(page).locator('.library-item').getByText('Button', { exact: true }).click();
      await frameOf(page).getByRole('button', { name: 'Save project', exact: true }).click();
      await expect(frameOf(page).locator('#garden-project [role=alert]')).toContainText(
        'changed elsewhere',
      );
      expect(read().name).toBe('Changed externally');
      page.once('dialog', (d) => d.accept());
      await frameOf(page)
        .getByRole('button', { name: 'Discard draft and reload', exact: true })
        .click();
      await expect(status(page)).toHaveText('Saved', { timeout: 120000 });
      await expect(frameOf(page).getByRole('button', { name: /Second screen/ })).toBeVisible();
      await page.screenshot({ path: join(evidence, 'moqira-reopened.png') });
    });

    await test.step('the published edition keeps only the chosen wireframes and starts interactive', async () => {
      // As publishing does: install the project's own toolchain, then run its build.
      const installed = await page.evaluate(async (folder) => window.electronAPI!.toolchain.install(folder), folder);
      expect(installed.code, installed.log).toBe(0);
      const built = await page.evaluate(
        async (folder) => window.electronAPI!.toolchain.build(folder),
        folder,
      );
      expect(built.code, built.log).toBe(0);
      const dist = join(folder, 'dist');
      const allText = (path: string): string =>
        readdirSync(path, { withFileTypes: true })
          .map((f) =>
            f.isDirectory()
              ? allText(join(path, f.name))
              : readFileSync(join(path, f.name), 'utf8'),
          )
          .join('\n');
      expect(allText(dist)).not.toContain('PRIVATE_WIREFRAME_SENTINEL');
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
        await page.locator('iframe[data-crux-id]').evaluate((el: HTMLIFrameElement, url) => {
          el.src = url;
        }, `http://127.0.0.1:${port}/`);
        await expect(frameOf(page).locator('[data-public-edition]')).toBeVisible();
        await expect(frameOf(page).locator('#garden-project [data-open]')).toHaveCount(0);
        await expect(frameOf(page).getByText('PRIVATE_WIREFRAME_SENTINEL')).toHaveCount(0);
        await expect(frameOf(page).getByRole('button', { name: /Private sketch/ })).toHaveCount(0);
        await expect(frameOf(page).locator('.app-shell')).toHaveClass(/is-interactive/);
        await frameOf(page).locator('.canvas-node').getByText('Continue', { exact: true }).click();
        await expect(frameOf(page).locator('.wireframe-row.is-active')).toContainText(
          'Second screen',
        );
        await page.screenshot({ path: join(evidence, 'moqira-public.png') });
      } finally {
        server.closeAllConnections();
        await new Promise<void>((r) => server.close(() => r()));
      }
    });
  } finally {
    await instance.app.close();
  }
});
