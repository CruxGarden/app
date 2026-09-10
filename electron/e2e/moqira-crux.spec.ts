import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createServer } from 'node:http';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';

test('Moqira: design → Mood → save on view switch → restart → public interactive edition', async () => {
  test.setTimeout(300000);
  let instance = await launchApp();
  const dir = instance.dir;
  const evidence = resolve(__dirname, '../../docs/app-integrations');
  mkdirSync(evidence, { recursive: true });
  try {
    let page = instance.page;
    await page.setViewportSize({ width: 1600, height: 1050 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Mockups/ }).click();
    await page.getByLabel('Name', { exact: true }).fill('A small idea');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const folder = (await storedCrux(page, id)).projectFolder as string;
    const projectPath = join(folder, 'mockups/project.json');
    const read = () => JSON.parse(readFileSync(projectPath, 'utf8'));
    const frame = () => page.frameLocator('iframe[data-crux-id]');
    await expect(frame().getByRole('status')).toHaveText('Saved', { timeout: 120000 });
    await frame().locator('.library-item').getByText('Button', { exact: true }).click();
    await expect(frame().locator('.canvas-node')).toHaveCount(1);
    await frame().getByRole('button', { name: 'Save project', exact: true }).click();
    await expect.poll(() => read().wireframes[0].nodes.length).toBe(1);
    const canvasAccent = await frame()
      .locator('.canvas')
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--accent'));
    const canvasFont = await frame()
      .locator('.canvas-node')
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily);
    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    await page.getByTestId('bundled-8-bit').getByRole('button', { name: 'Apply' }).click();
    await page
      .locator('[data-modal-open]')
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    await expect(page.locator('[data-modal-open]')).toHaveCount(0);
    await expect(frame().locator('html')).toHaveAttribute('data-garden-mood', 'true');
    expect(
      await frame()
        .locator('.canvas')
        .evaluate((el) => getComputedStyle(el).getPropertyValue('--accent')),
    ).toBe(canvasAccent);
    expect(
      await frame()
        .locator('.canvas-node')
        .first()
        .evaluate((el) => getComputedStyle(el).fontFamily),
    ).toBe(canvasFont);
    await frame().getByLabel('Include in public edition').check();
    await frame().getByRole('button', { name: 'Add wireframe', exact: true }).click();
    await frame().locator('.library-item').getByText('Label', { exact: true }).click();
    await page
      .getByTestId('workshop-view')
      .getByRole('button', { name: 'Advanced', exact: true })
      .click();
    await expect(page.getByTestId('workshop-view')).toHaveAttribute('data-view', 'advanced');
    expect(read().wireframes).toHaveLength(2);
    expect(read().wireframes[1].nodes).toHaveLength(1);
    await page
      .getByTestId('workshop-view')
      .getByRole('button', { name: 'Use app', exact: true })
      .click();
    await expect(frame().getByRole('status')).toHaveText('Saved');
    // Import a portable Moqira file with a public link and an excluded wireframe.
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
    project.wireframes[0].nodes.push({
      ...project.wireframes[1].nodes[0],
      id: 'intro',
      text: 'A space for small beginnings.',
      x: 48,
      y: 145,
      width: 450,
      height: 40,
      fontSize: 18,
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
    project.activeWireframeId = project.wireframes[1].id;
    await frame()
      .getByLabel('Import Moqira project')
      .setInputFiles({
        name: 'prototype.moq',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(project)),
      });
    await expect(frame().getByRole('button', { name: /Second screen/ })).toBeVisible();
    await frame().getByLabel('Include in public edition').check();
    await frame().getByRole('button', { name: 'Save project', exact: true }).click();
    await expect.poll(() => read().wireframes.length).toBe(3);
    await frame()
      .getByRole('button', { name: /Wireframe 1/ })
      .click();
    await page.screenshot({ path: join(evidence, 'moqira-editor.png') });
    const growth = (await page.evaluate(
      async (id) =>
        window.electronAPI!.sqlite.get(
          "SELECT COUNT(*) AS count FROM dimensions WHERE source_id = ? AND type = 'growth'",
          [id],
        ),
      id,
    )) as { count: number };
    expect(growth.count).toBeGreaterThan(2);
    await frame().getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(frame().getByRole('status')).toHaveText('Saved');
    await page.screenshot({ path: join(evidence, 'moqira-editor.png') });
    await page.evaluate(() => {
      const state = window as unknown as { demoExport?: Blob };
      const blobs = new Map<string, Blob>();
      const create = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        const url = create(blob);
        if (blob instanceof Blob) blobs.set(url, blob);
        return url;
      };
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download.endsWith('.crux')) state.demoExport = blobs.get(this.href);
        else click.call(this);
      };
    });
    await page.getByRole('button', { name: 'Toggle export', exact: true }).click();
    await page.getByRole('button', { name: 'Export Crux', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => !!(window as unknown as { demoExport?: Blob }).demoExport))
      .toBe(true);
    const encoded = await page.evaluate(async () => {
      const bytes = new Uint8Array(
        await (window as unknown as { demoExport: Blob }).demoExport.arrayBuffer(),
      );
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(binary);
    });
    writeFileSync(join(evidence, 'moqira-demo.crux'), Buffer.from(encoded, 'base64'));
    await page.getByRole('button', { name: 'Toggle export', exact: true }).click();
    // Publication-only changes must clear the close guard after acknowledgement.
    await frame().getByLabel('Include in public edition').uncheck();
    await expect(frame().getByRole('status')).toHaveText('Saved');
    await frame().getByLabel('Include in public edition').check();
    await expect(frame().getByRole('status')).toHaveText('Saved');
    const stopped = instance.app.waitForEvent('close');
    await instance.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
    await stopped;
    instance = await launchApp({ dir });
    page = instance.page;
    await page.setViewportSize({ width: 1600, height: 1050 });
    await page.getByRole('button', { name: /enter/i }).click();
    await expect(frame().getByRole('status')).toHaveText('Saved', { timeout: 60000 });
    await expect(frame().getByRole('button', { name: /Second screen/ })).toBeVisible();
    // Reject a disk edit ahead of watcher ingestion, preserving the draft.
    const external = read();
    external.name = 'Changed externally';
    writeFileSync(projectPath, JSON.stringify(external));
    await frame().locator('.library-item').getByText('Button', { exact: true }).click();
    await frame().getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(frame().getByRole('alert')).toContainText('changed elsewhere');
    expect(read().name).toBe('Changed externally');
    page.once('dialog', (d) => d.accept());
    await frame().getByRole('button', { name: 'Discard draft and reload', exact: true }).click();
    await expect(frame().getByRole('status')).toHaveText('Saved');
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
      await expect(frame().locator('[data-public-edition]')).toBeVisible();
      await expect(
        frame().getByRole('button', { name: 'Save project', exact: true }),
      ).not.toBeVisible();
      await expect(frame().getByText('PRIVATE_WIREFRAME_SENTINEL')).toHaveCount(0);
      await expect(frame().getByRole('button', { name: /Private sketch/ })).toHaveCount(0);
      await frame().locator('.canvas-node').getByText('Continue', { exact: true }).click();
      await expect(frame().locator('.wireframe-row.is-active')).toContainText('Second screen');
      await frame().locator('body').press('Escape');
      await expect(frame().locator('.app-shell')).toHaveClass(/is-interactive/);
      await frame()
        .getByRole('button', { name: /Wireframe 1/ })
        .click();
      await page.screenshot({ path: join(evidence, 'moqira-public.png') });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
  } finally {
    await instance.app.close();
  }
});
