import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { outputs } from './game-cruxspace-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

test('chart authoring: data, two chart families, manual layout preservation, four outputs, restart and portable editing', async () => {
  test.setTimeout(360000);
  let instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const dir = instance.dir,
    archive = join(dir, 'charts.crux');
  const evidence = resolve(__dirname, '../../docs/rawgraphs-depth');
  mkdirSync(evidence, { recursive: true });
  let folder = '';
  const frame = () => instance.page.frameLocator('iframe[data-crux-id]');
  const state = () =>
    JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8')).project.snapshot.value;
  const rows = () =>
    JSON.parse(readFileSync(join(folder, 'data', state().rawData.__cruxBinary.path), 'utf8'));
  const collaborator = async (page: typeof instance.page, message: string, closing: string) => {
    const toggle = page.getByRole('button', { name: 'Toggle collaboration' });
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
    const box = page.getByPlaceholder('Send a message...');
    await box.fill(message);
    await box.press('Enter');
    // The pane can close after an output refresh; completion must be durable even when hidden.
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    await expect
      .poll(
        async () =>
          (await storedCrux(page, id)).messages.some(
            (m: any) => m.role === 'assistant' && m.content === closing,
          ),
        { timeout: 150000 },
      )
      .toBe(true);
  };
  const ready = () =>
    expect(frame().locator('#garden-project [role=status]')).toHaveText(
      /Saved to Garden|Figure saved to Cruxspace/,
      { timeout: 90000 },
    );
  const save = async () => {
    await frame().getByRole('button', { name: 'Save project', exact: true }).click();
    await ready();
  };
  const manualWidth = async (value: string) => {
    const toggle = instance.page.getByRole('button', { name: 'Toggle collaboration' });
    if ((await toggle.getAttribute('aria-pressed')) === 'true') await toggle.click();
    const width = frame().getByLabel('Width (px)', { exact: true });
    await width.fill(value);
    await width.press('Tab');
    await save();
    await expect.poll(() => state().visualOptions.width).toBe(Number(value));
  };
  try {
    let page = instance.page;
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => console.log('Chart page error:', e.message));
    await page.setViewportSize({ width: 2200, height: 1250 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^RAWGraphs/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await ready();
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder;
    console.log('Chart depth folder', folder);
    await collaborator(
      page,
      'Create a sales chart [rawgraphs:depth-create]',
      'Created the editable sales chart.',
    );
    await save();
    const noErrors = async () =>
      expect(
        (await storedCrux(page, id)).messages
          .flatMap((m: any) => m.toolCalls ?? [])
          .filter((c: any) => c.result?.startsWith('Error')),
      ).toEqual([]);
    await noErrors();
    expect(state().mapping.bars.value).toEqual(['Channel']);
    expect(rows()).toEqual([
      ['Shop', '24', '120'],
      ['Market', '42', '210'],
      ['Online', '35', '170'],
    ]);
    const overview = outputs(folder).find((o) => o.label === 'Sales overview')!;
    expect(readFileSync(join(folder, overview.path), 'utf8')).toContain('Market');
    await manualWidth('1030');
    const before = state();
    await collaborator(
      page,
      'Update market sales [rawgraphs:depth-revise]',
      'Updated market sales and kept your manual layout.',
    );
    await save();
    await noErrors();
    expect(state().visualOptions).toEqual(before.visualOptions);
    expect(state().mapping).toEqual(before.mapping);
    expect(rows()).toEqual([
      ['Shop', '24', '120'],
      ['Market', '48', '210'],
      ['Online', '35', '170'],
    ]);
    const png = readFileSync(
      join(folder, outputs(folder).find((o) => o.label === 'Revised sales')!.path),
    );
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(2060);
    expect(png.readUInt32BE(20)).toBe(1100);
    const native = outputs(folder).find((o) => o.label === 'Editable sales')!;
    expect(native.path).toMatch(/\.rawgraphs$/);
    const editable = JSON.parse(readFileSync(join(folder, native.path), 'utf8'));
    expect(editable.rawData).toEqual(rows());
    expect(editable.visualOptions.width).toBe(1030);
    const jpeg = readFileSync(
      join(folder, outputs(folder).find((o) => o.label === 'Sales photograph')!.path),
    );
    expect([...jpeg.subarray(0, 3)]).toEqual([255, 216, 255]);
    copyFileSync(
      join(folder, outputs(folder).find((o) => o.label === 'Revised sales')!.path),
      join(evidence, 'sales.png'),
    );
    const dataRef = state().rawData;
    await collaborator(
      page,
      'Compare visits and sales [rawgraphs:depth-scatter]',
      'Compared sales and visits in a second chart.',
    );
    await save();
    await noErrors();
    expect(state().rawData).toEqual(dataRef);
    expect(state().mapping.x.value).toEqual(['Visits']);
    expect(state().mapping.y.value).toEqual(['Sales']);
    const scatter = outputs(folder).find((o) => o.label === 'Sales and visits')!;
    const svg = readFileSync(join(folder, scatter.path));
    expect(svg.toString()).toContain('<circle');
    copyFileSync(join(folder, scatter.path), join(evidence, 'sales-and-visits.svg'));
    await manualWidth('1000');
    await frame()
      .getByText('4. Customize', { exact: true })
      .evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: join(evidence, 'native-charts.png') });
    await instance.app.close();
    instance = await launchApp({ dir, env: { CRUX_AI_MOCK: '1' } });
    page = instance.page;
    await page.getByRole('button', { name: /enter/i }).click();
    await ready();
    expect(state().visualOptions.width).toBe(1000);
    expect(state().rawData).toEqual(dataRef);
    await exportNativeCrux(page, archive, instance.app);
    await instance.app.close();
    renameSync(folder, folder + '.source-offline');
    instance = await launchApp();
    page = instance.page;
    await page.setViewportSize({ width: 2200, height: 1250 });
    await enterGarden(page);
    await importNativeCrux(page, archive);
    await ready();
    folder = (
      await storedCrux(
        page,
        (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!,
      )
    ).projectFolder;
    expect(state().visualOptions.width).toBe(1000);
    expect(state().rawData).toEqual(dataRef);
    expect(rows()[1][1]).toBe('48');
    expect(
      readFileSync(join(folder, outputs(folder).find((o) => o.label === 'Sales and visits')!.path)),
    ).toEqual(svg);
    await manualWidth('1100');
    await frame()
      .getByText('4. Customize', { exact: true })
      .evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: join(evidence, 'portable-charts.png') });
  } finally {
    await instance.app.close().catch(() => {});
  }
});
