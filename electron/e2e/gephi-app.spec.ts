import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';
test('Gephi Lite native graph edits, agent title, exports, conflicts and restart', async () => {
  test.setTimeout(240000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  let folder = '';
  let savedLayout: unknown;
  const evidence = resolve(__dirname, '../../docs/gephi');
  const archive = join(first.dir, 'network.crux');
  mkdirSync(evidence, { recursive: true });
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const dataset = () => {
    const ref = doc().project?.dataset;
    return ref
      ? JSON.parse(JSON.parse(readFileSync(join(folder, 'data', ref.__cruxBinary.path), 'utf8')))
      : null;
  };
  try {
    const { page } = first;
    await page.setViewportSize({ width: 2000, height: 1200 });
    page.on('pageerror', (e) => console.log('Gephi error', e.message));
    page.on('requestfailed', (request) =>
      console.log(
        'Gephi request failed',
        request.url().slice(0, 300),
        request.failure()?.errorText,
      ),
    );
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Gephi Lite/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeHidden({
      timeout: 30000,
    });
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 90000,
    });
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder;
    console.log('Gephi folder', folder);
    await frame.getByRole('button', { name: 'Open a local file', exact: true }).click();
    await frame.locator('input[type=file]').setInputFiles({
      name: 'connections.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          options: { type: 'undirected', multi: false },
          attributes: {},
          nodes: [
            { key: 'a', attributes: { label: 'Ideas', x: 0, y: 0 } },
            { key: 'b', attributes: { label: 'Experiments', x: 500, y: 500 } },
            { key: 'c', attributes: { label: 'Findings', x: 1000, y: 0 } },
          ],
          edges: [
            { key: 'ab', source: 'a', target: 'b' },
            { key: 'bc', source: 'b', target: 'c' },
          ],
        }),
      ),
    });
    await frame.getByRole('button', { name: 'Open', exact: true }).click();
    await expect.poll(() => dataset()?.fullGraph?.nodes?.length).toBe(3);
    await expect(frame.locator('canvas.sigma-nodes')).toBeVisible();
    await expect
      .poll(() =>
        frame
          .locator('canvas.sigma-labels')
          .evaluate((c: HTMLCanvasElement) =>
            Array.from(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data).some(
              (v, i) => i % 4 === 3 && v > 0,
            ),
          ),
      )
      .toBe(true);
    const initialLayout = JSON.stringify(dataset().layout);
    await frame.getByRole('button', { name: 'Layout', exact: true }).click();
    await frame.getByRole('button', { name: 'Circular', exact: true }).click();
    await frame.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect.poll(() => JSON.stringify(dataset()?.layout)).not.toBe(initialLayout);
    savedLayout = dataset().layout;
    await frame.locator('#graph-title-btn').click();
    await frame.locator('#graph-title').fill('Manual network');
    await frame.locator('#graph-description').fill('Ideas become experiments and findings.');
    await frame.locator('button[form=graph-metadata]').click();
    await expect.poll(() => dataset()?.metadata?.title).toBe('Manual network');
    const chat = page.getByPlaceholder('Send a message...');
    await chat.fill('Name this network [gephi:title]');
    await chat.press('Enter');
    await expect
      .poll(() => dataset()?.metadata?.title, { timeout: 45000 })
      .toBe('Research connections');
    const download = async (name: string, action: () => Promise<void>) => {
      const path = join(first.dir, name);
      await first.app.evaluate(({ session }, path) => {
        (globalThis as any).__gephiDownload = null;
        session.defaultSession.once('will-download', (_e, item) => {
          item.setSavePath(path);
          item.once('done', (_e, state) => {
            (globalThis as any).__gephiDownload = state;
          });
        });
      }, path);
      await action();
      await expect
        .poll(() => first.app.evaluate(() => (globalThis as any).__gephiDownload))
        .toBe('completed');
      return path;
    };
    const workspace = () =>
      frame.getByRole('button', { name: 'Workspace', exact: true }).last().click();
    const jsonPath = await download('network.json', async () => {
      await workspace();
      await frame.getByText('Save as...', { exact: true }).click();
      await frame.getByRole('button', { name: 'Download', exact: true }).click();
    });
    expect(JSON.parse(readFileSync(jsonPath, 'utf8')).graphDataset.fullGraph.nodes).toHaveLength(3);
    const gexf = await download('network.gexf', async () => {
      await workspace();
      await frame.getByText('Export graph file', { exact: true }).click();
    });
    expect(readFileSync(gexf, 'utf8')).toContain('Findings');
    const png = await download('network.png', async () => {
      await workspace();
      await frame.getByText('Export image', { exact: true }).click();
      await frame.getByRole('button', { name: 'Save', exact: true }).click();
    });
    expect(readFileSync(png).subarray(1, 4).toString()).toBe('PNG');
    expect(
      await first.app.evaluate(({ nativeImage }, path) => {
        const pixels = nativeImage.createFromPath(path).toBitmap();
        const colors = new Set<number>();
        for (let i = 0; i < pixels.length; i += 4) colors.add(pixels.readUInt32LE(i));
        return colors.size;
      }, png),
    ).toBeGreaterThan(20);
    await workspace();
    await frame.getByText('Open...', { exact: true }).click();
    await frame.locator('input[type=file]').setInputFiles(jsonPath);
    await frame.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(frame.locator('.graph-title')).toContainText('Research connections');
    await expect.poll(() => dataset()?.layout).toEqual(savedLayout);
    const external = doc();
    const externalDataset = dataset();
    externalDataset.metadata.title = 'Externally saved network';
    const bytes = Buffer.from(JSON.stringify(JSON.stringify(externalDataset)));
    const hash = createHash('sha256').update(bytes).digest('hex');
    writeFileSync(join(folder, 'data/assets', hash + '.bin'), bytes);
    external.project.dataset = {
      __cruxBinary: {
        path: 'assets/' + hash + '.bin',
        kind: 'buffer',
        type: 'application/json',
        size: bytes.length,
      },
    };
    writeFileSync(join(folder, 'data/project.json'), JSON.stringify(external));
    await frame.locator('#graph-title-btn').click();
    await frame.locator('#graph-title').fill('Uncommitted draft');
    await frame.locator('button[form=graph-metadata]').click();
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toContainText('changed elsewhere');
    expect(dataset().metadata.title).toBe('Externally saved network');
    page.once('dialog', (d) => d.accept());
    await frame.getByRole('button', { name: 'Reload saved project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 30000,
    });
    await expect(frame.locator('.graph-title')).toContainText('Externally saved network');
    await page.screenshot({ path: join(evidence, 'gephi-workshop.png') });
  } finally {
    await first.app.close();
  }
  const second = await launchApp({ dir: first.dir, env: { CRUX_AI_MOCK: '1' } });
  try {
    await second.page.setViewportSize({ width: 2000, height: 1200 });
    await second.page.getByRole('button', { name: /enter/i }).click();
    const frame = second.page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 60000,
    });
    await expect(frame.locator('.graph-title')).toContainText('Externally saved network');
    await expect(frame.locator('canvas.sigma-nodes')).toBeVisible();
    await expect
      .poll(() =>
        frame
          .locator('canvas.sigma-labels')
          .evaluate((c: HTMLCanvasElement) =>
            Array.from(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data).some(
              (v, i) => i % 4 === 3 && v > 0,
            ),
          ),
      )
      .toBe(true);
    expect(dataset().fullGraph.nodes).toHaveLength(3);
    expect(dataset().layout).toEqual(savedLayout);
    expect(dataset().metadata.description).toBe('Ideas become experiments and findings.');
    const bounds = await frame.locator('.sigma-container').evaluate((el) => {
      const canvas = el.getBoundingClientRect(),
        stage = el.closest('.filler')!.getBoundingClientRect();
      return { canvas: canvas.toJSON(), stage: stage.toJSON() };
    });
    expect(bounds.canvas.width).toBeLessThanOrEqual(bounds.stage.width + 1);
    expect(bounds.canvas.height).toBeLessThanOrEqual(bounds.stage.height + 1);
    expect(bounds.canvas.left).toBeGreaterThanOrEqual(bounds.stage.left - 1);
    expect(bounds.canvas.top).toBeGreaterThanOrEqual(bounds.stage.top - 1);
    expect(
      await frame.locator('canvas.sigma-labels').evaluate((c: HTMLCanvasElement) => {
        const edge = c.getContext('2d')!.getImageData(c.width - 12, 0, 12, c.height).data;
        return Array.from(edge).some((v, i) => i % 4 === 3 && v > 0);
      }),
    ).toBe(false);
    await second.page.screenshot({ path: join(evidence, 'gephi-reopened.png') });
    await exportNativeCrux(second.page, archive);
  } finally {
    await second.app.close();
  }
  // The imported editor cannot depend on its original profile or source path.
  const oldFolder = folder;
  renameSync(oldFolder, oldFolder + '-unavailable');
  const third = await launchApp();
  try {
    await third.page.setViewportSize({ width: 2000, height: 1200 });
    await enterGarden(third.page);
    await importNativeCrux(third.page, archive);
    const frame = third.page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 60000,
    });
    const id = (await third.page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(third.page, id)).projectFolder;
    expect(folder).not.toBe(oldFolder);
    expect(dataset().fullGraph.nodes).toHaveLength(3);
    expect(dataset().layout).toEqual(savedLayout);
    await frame.locator('#graph-title-btn').click();
    await frame.locator('#graph-title').fill('Portable network');
    await frame.locator('button[form=graph-metadata]').click();
    await expect.poll(() => dataset()?.metadata?.title).toBe('Portable network');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden');
    await third.page.screenshot({ path: join(evidence, 'gephi-imported.png') });
  } finally {
    await third.app.close();
    renameSync(oldFolder + '-unavailable', oldFolder);
  }
});
