import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
test('JupyterLite native notebook runs Python, plots, agent cells, export and restart', async () => {
  test.setTimeout(240000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  let folder = '';
  const evidence = resolve(__dirname, '../../docs/jupyterlite');
  mkdirSync(evidence, { recursive: true });
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const notebook = () => {
    const f = doc().project.files.find((f: any) => f.type === 'notebook');
    return f
      ? JSON.parse(readFileSync(join(folder, 'data', f.content.__cruxBinary.path), 'utf8'))
      : null;
  };
  try {
    await first.app.evaluate(({ session }) => {
      session.defaultSession.webRequest.onBeforeRequest(
        { urls: ['http://*/*', 'https://*/*'] },
        (details, done) =>
          done({
            cancel: !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(details.url).hostname),
          }),
      );
    });
    const { page } = first;
    await page.setViewportSize({ width: 2000, height: 1200 });
    page.on('pageerror', (e) => console.log('JupyterLite error', e.message));
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^JupyterLite/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 90000,
    });
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder;
    console.log('JupyterLite folder', folder);
    await frame
      .locator('.jp-LauncherCard[data-category="Notebook"]')
      .filter({ hasText: 'Python (Pyodide)' })
      .click();
    const input = frame.locator('.jp-Notebook .cm-content').first();
    await input.fill(
      'import numpy as np\nimport matplotlib.pyplot as plt\nprint(np.mean([2, 4, 6]))\nplt.plot([1, 2, 3], [2, 4, 3])\nplt.show()',
    );
    await input.press('Shift+Enter');
    await expect(frame.locator('.jp-OutputArea-output').filter({ hasText: '4.0' })).toBeVisible({
      timeout: 60000,
    });
    await expect(frame.locator('.jp-OutputArea-output img')).toBeVisible();
    await expect
      .poll(() => notebook()?.cells[0]?.outputs?.some((o: any) => o.data?.['image/png']), {
        timeout: 30000,
      })
      .toBe(true);
    const chooser = page.waitForEvent('filechooser');
    await frame.locator('.jp-id-upload').click();
    await (
      await chooser
    ).setFiles({
      name: 'observations.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Group,Value\nControl,2\nExperiment,4\nReplication,6'),
    });
    await expect
      .poll(() => doc().project.files.some((f: any) => f.path === 'observations.csv'))
      .toBe(true);
    await frame
      .locator('.lm-TabBar-tabLabel')
      .filter({ hasText: /^Untitled\.ipynb$/ })
      .click();
    await input.fill(
      'import csv\nimport numpy as np\nwith open("observations.csv") as f:\n    values = [float(row["Value"]) for row in csv.DictReader(f)]\nmean = float(np.mean(values))\nprint("Dataset rows:", len(values))\nwith open("result.txt", "w") as f:\n    f.write(f"Research result {mean}")\nimport matplotlib.pyplot as plt\nplt.plot([1, 2, 3], values)\nplt.show()',
    );
    await input.press('Shift+Enter');
    await expect(
      frame.locator('.jp-OutputArea-output').filter({ hasText: 'Dataset rows: 3' }),
    ).toBeVisible({ timeout: 60000 });
    await expect
      .poll(() => doc().project.files.some((f: any) => f.path === 'result.txt'), { timeout: 30000 })
      .toBe(true);
    const chat = page.getByPlaceholder('Send a message...');
    await chat.fill('Document the findings [jupyterlite:cell]');
    await chat.press('Enter');
    await expect
      .poll(
        () =>
          notebook()?.cells?.some((c: any) =>
            String(c.source).includes('The measured mean is 4.0.'),
          ),
        { timeout: 45000 },
      )
      .toBe(true);
    const path = join(first.dir, 'analysis.ipynb');
    await first.app.evaluate(({ session }, path) => {
      (globalThis as any).__jupyterDownload = null;
      session.defaultSession.once('will-download', (_e, item) => {
        item.setSavePath(path);
        item.once('done', (_e, state) => {
          (globalThis as any).__jupyterDownload = state;
        });
      });
    }, path);
    await frame.getByRole('menuitem', { name: 'File', exact: true }).click();
    await frame.getByText('Download', { exact: true }).click();
    await expect
      .poll(() => first.app.evaluate(() => (globalThis as any).__jupyterDownload))
      .toBe('completed');
    const exported = JSON.parse(readFileSync(path, 'utf8'));
    expect(exported.cells[0].outputs.some((o: any) => o.data?.['image/png'])).toBe(true);
    const external = doc();
    external.project.files.find((f: any) => f.path === 'observations.csv').path =
      'renamed-observations.csv';
    external.project.open = external.project.open.map((p: string) =>
      p === 'observations.csv' ? 'renamed-observations.csv' : p,
    );
    writeFileSync(join(folder, 'data/project.json'), JSON.stringify(external));
    await frame.locator('.jp-MarkdownCell').last().dblclick();
    const findings = frame.locator('.jp-MarkdownCell .cm-content').last();
    await findings.fill('Uncommitted local draft');
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toContainText('changed elsewhere');
    expect(doc().project.files.some((f: any) => f.path === 'renamed-observations.csv')).toBe(true);
    page.once('dialog', (d) => d.accept());
    await frame.getByRole('button', { name: 'Reload saved project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 60000,
    });
    expect(
      notebook().cells.some((c: any) => String(c.source).includes('Uncommitted local draft')),
    ).toBe(false);
    await expect(frame.locator('.jp-OutputArea-output img')).toBeVisible();
    await page.screenshot({ path: join(evidence, 'jupyterlite-workshop.png') });
  } finally {
    await first.app.close();
  }
  const second = await launchApp({ dir: first.dir, env: { CRUX_AI_MOCK: '1' } });
  try {
    await second.app.evaluate(({ session }) => {
      session.defaultSession.webRequest.onBeforeRequest(
        { urls: ['http://*/*', 'https://*/*'] },
        (details, done) =>
          done({
            cancel: !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(details.url).hostname),
          }),
      );
    });
    await second.page.setViewportSize({ width: 2000, height: 1200 });
    await second.page.getByRole('button', { name: /enter/i }).click();
    const frame = second.page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 90000,
    });
    await expect(frame.locator('.jp-OutputArea-output img')).toBeVisible();
    expect(
      notebook().cells.some((c: any) => String(c.source).includes('The measured mean is 4.0.')),
    ).toBe(true);
    expect(doc().project.files.some((f: any) => f.path === 'renamed-observations.csv')).toBe(true);
    const input = frame.locator('.jp-Notebook .cm-content').first();
    await input.fill(
      'import matplotlib.pyplot as plt\nplt.plot([1,2,3],[2,4,3])\nplt.show()\nprint("Reopened notebook:", open("result.txt").read())',
    );
    await input.press('Shift+Enter');
    await expect(
      frame
        .locator('.jp-OutputArea-output')
        .filter({ hasText: 'Reopened notebook: Research result 4.0' }),
    ).toBeVisible({ timeout: 60000 });
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden');
    await second.page.screenshot({ path: join(evidence, 'jupyterlite-reopened.png') });
  } finally {
    await second.app.close();
  }
});
