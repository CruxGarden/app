import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
test('RAWGraphs native dataset mapping, agent, exports, conflict and restart', async () => {
  test.setTimeout(240000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  let folder = '';
  const evidence = resolve(__dirname, '../../docs/rawgraphs');
  mkdirSync(evidence, { recursive: true });
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const state = () => doc().project.snapshot.value;
  let dataRef = '';
  try {
    const { page } = first;
    page.on('pageerror', (e) => console.log('RAWGraphs error', e.message));
    await page.setViewportSize({ width: 2400, height: 1300 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^RAWGraphs/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 60000,
    });
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder;
    console.log('RAWGraphs folder', folder);
    await frame
      .locator('textarea')
      .first()
      .fill('Group,Value\nControl,2.5\nExperiment,4.25\nReplication,3.5');
    await expect(frame.getByText('2. Choose a chart', { exact: true })).toBeVisible();
    await frame.getByText('Bar chart', { exact: true }).click();
    const bars = frame
      .locator('[class*="chart-dimension"]')
      .filter({ has: frame.locator('span.text-capitalize').filter({ hasText: /^Bars$/ }) })
      .filter({ has: frame.locator('.dropzone') })
      .last()
      .locator('.dropzone');
    await frame
      .locator('.column-card')
      .filter({ hasText: /^Group$/ })
      .dragTo(bars);
    const size = frame
      .locator('[class*="chart-dimension"]')
      .filter({ has: frame.locator('span.text-capitalize').filter({ hasText: /^Size$/ }) })
      .filter({ has: frame.locator('.dropzone') })
      .last()
      .locator('.dropzone');
    await frame
      .locator('.column-card')
      .filter({ hasText: /^Value$/ })
      .dragTo(size);
    await expect.poll(() => state().mapping.bars?.value).toEqual(['Group']);
    await expect.poll(() => state().mapping.size?.value).toEqual(['Value']);
    dataRef = state().rawData.__cruxBinary.path;
    const chat = page.getByPlaceholder('Send a message...');
    await chat.fill('Resize the figure [rawgraphs:size]');
    await chat.press('Enter');
    await expect.poll(() => state().visualOptions.width, { timeout: 45000 }).toBe(900);
    expect(state().rawData.__cruxBinary.path).toBe(dataRef);
    async function download(type: string) {
      const path = join(first.dir, 'figure.' + type);
      await first.app.evaluate(({ session }, path) => {
        (globalThis as any).__rawDownload = null;
        session.defaultSession.once('will-download', (_e, item) => {
          item.setSavePath(path);
          item.once('done', (_e, state) => {
            (globalThis as any).__rawDownload = state;
          });
        });
      }, path);
      await frame.locator('#input-group-dropdown-1').click();
      await frame
        .getByRole('button', { name: '.' + type, exact: true })
        .last()
        .click();
      await frame.getByRole('button', { name: 'Download', exact: true }).click();
      await expect
        .poll(() => first.app.evaluate(() => (globalThis as any).__rawDownload))
        .toBe('completed');
      return readFileSync(path);
    }
    expect((await download('svg')).toString()).toContain('Experiment');
    expect((await download('png')).subarray(1, 4).toString()).toBe('PNG');
    const native = JSON.parse((await download('rawgraphs')).toString());
    expect(native.rawData).toEqual([
      ['Control', '2.5'],
      ['Experiment', '4.25'],
      ['Replication', '3.5'],
    ]);
    native.visualOptions.width = 1000;
    // The native reset action exposes its original project importer.
    await frame.getByText('Reset', { exact: true }).click();
    await frame.getByText('Open your project', { exact: true }).click();
    await frame.locator('input[type=file]').setInputFiles({
      name: 'figure.rawgraphs',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(native)),
    });
    await expect.poll(() => state().visualOptions.width).toBe(1000);
    await expect(frame.locator('.assigned-column')).toHaveCount(2);
    const external = doc();
    external.project.snapshot.value.visualOptions.width = 600;
    writeFileSync(join(folder, 'data/project.json'), JSON.stringify(external));
    // A real native edit must retain the externally saved document until explicit reload.
    const width = frame.getByLabel('Width (px)', { exact: true });
    await width.fill('1200');
    await width.press('Tab');
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toContainText('changed elsewhere');
    expect(state().visualOptions.width).toBe(600);
    page.once('dialog', (d) => d.accept());
    await frame.getByRole('button', { name: 'Reload saved project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden');
    await frame
      .getByText('4. Customize', { exact: true })
      .evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: join(evidence, 'rawgraphs-workshop.png') });
  } finally {
    await first.app.close();
  }
  const second = await launchApp({ dir: first.dir, env: { CRUX_AI_MOCK: '1' } });
  try {
    await second.page.setViewportSize({ width: 2400, height: 1300 });
    await second.page.getByRole('button', { name: /enter/i }).click();
    const frame = second.page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 60000,
    });
    expect(state().visualOptions.width).toBe(600);
    expect(state().rawData.__cruxBinary.path).toBe(dataRef);
    expect(state().mapping.bars.value).toEqual(['Group']);
    await expect(frame.locator('.assigned-column')).toHaveCount(2);
    await expect(frame.locator('.assigned-column').first()).toContainText('Group');
    await frame
      .getByText('4. Customize', { exact: true })
      .evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await expect(frame.locator('svg').filter({ hasText: 'Experiment' }).first()).toBeVisible();
    await second.page.screenshot({ path: join(evidence, 'rawgraphs-reopened.png') });
  } finally {
    await second.app.close();
  }
});

test('RAWGraphs retains unfinished JSON dataset selection across reload', async () => {
  test.setTimeout(90000);
  const app = await launchApp();
  try {
    const { page } = app;
    await page.setViewportSize({ width: 2400, height: 1300 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^RAWGraphs/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 60000,
    });
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const folder = (await storedCrux(page, id)).projectFolder;
    const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
    const source = JSON.stringify({
      observations: [
        { Group: 'Control', Value: 2.5 },
        { Group: 'Experiment', Value: 4.25 },
      ],
    });
    await frame.locator('textarea').first().fill(source);
    await expect(frame.locator('.json-nested.selectable')).toHaveCount(1);
    await expect
      .poll(() => {
        const snapshot = doc().project.snapshot;
        return snapshot.type === 'draft'
          ? JSON.parse(
              readFileSync(
                join(folder, 'data', snapshot.value.userInput.__cruxBinary.path),
                'utf8',
              ),
            )
          : null;
      })
      .toBe(source);
    await frame.getByRole('button', { name: 'Reload saved project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden');
    await expect(frame.locator('.json-nested.selectable')).toContainText('observations');
    await frame.locator('.json-nested.selectable > .property-name').click();
    await expect.poll(() => doc().project.snapshot.type).toBe('native');
    expect(doc().project.snapshot.value.dataTypes).toEqual({
      Group: 'string',
      Value: expect.objectContaining({ type: 'number', decimal: '.' }),
    });
    const rows = doc().project.snapshot.value.rawData.__cruxBinary.path;
    expect(JSON.parse(readFileSync(join(folder, 'data', rows), 'utf8'))).toEqual([
      ['Control', 2.5],
      ['Experiment', 4.25],
    ]);
  } finally {
    await app.app.close();
  }
});
