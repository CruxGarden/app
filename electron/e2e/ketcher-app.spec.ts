import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

test('Ketcher native chemistry, templates, agent, exports and clean-profile portability', async () => {
  test.setTimeout(240000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  let folder = '';
  const evidence = resolve(__dirname, '../../docs/ketcher');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'chemistry.crux');
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const state = (key: string) => {
    const ref = doc().project?.[key]?.__cruxBinary;
    return ref ? JSON.parse(readFileSync(join(folder, 'data', ref.path), 'utf8')) : null;
  };
  const atoms = () =>
    Object.values(state('structure') || {}).reduce(
      (count: number, value: any) => count + (value?.atoms?.length || 0),
      0,
    );
  let nativeRing: unknown;
  const ready = async (page: typeof first.page) => {
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 60000,
    });
    return frame;
  };
  try {
    const { page } = first;
    await page.setViewportSize({ width: 2000, height: 1200 });
    await page.context().route(/^https?:\/\//, (route) => {
      const url = new URL(route.request().url());
      return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort();
    });
    page.on('pageerror', (error) => console.log('Ketcher error', error.message));
    page.on('requestfailed', (request) =>
      console.log(
        'Ketcher request failed',
        request.url().slice(0, 300),
        request.failure()?.errorText,
      ),
    );
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Ketcher/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const frame = await ready(page);
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(page, id)).projectFolder;
    console.log('Ketcher folder', folder);
    const button = (id: string) => frame.locator(`button[data-testid="${id}"]:visible`);
    const canvas = frame.locator('div[class*="intermediateCanvas"] > svg');
    await button('template-0').click();
    await canvas.click({ position: { x: 270, y: 240 } });
    await expect.poll(atoms).toBe(6);
    nativeRing = state('structure');
    // Native personal template library is project data, not browser-only state.
    await button('save-file-button').click();
    await button('save-to-templates-button').click();
    await expect(frame.getByText('Each Crux keeps its own template library.')).toBeVisible();
    await frame.getByTestId('name-input').fill('Research ring');
    await button('template-save-button').click();
    await expect.poll(() => state('storage')?.['ketcher-tmpls']).toContain('Research ring');
    const chat = page.getByPlaceholder('Send a message...');
    await chat.fill('Replace this with ethanol [ketcher:structure]');
    await chat.press('Enter');
    await expect.poll(atoms, { timeout: 45000 }).toBe(3);
    await expect
      .poll(() => canvas.evaluate(async () => (window as any).ketcher.getSmiles()))
      .toBe('CCO');
    const download = async (name: string, format: string) => {
      const path = join(first.dir, name);
      await first.app.evaluate(({ session }, path) => {
        (globalThis as any).__chemistryDownload = null;
        session.defaultSession.once('will-download', (_e, item) => {
          item.setSavePath(path);
          item.once('done', (_e, state) => {
            (globalThis as any).__chemistryDownload = state;
          });
        });
      }, path);
      await button('save-file-button').click();
      await frame.locator('div.file-format-list').click();
      await frame.getByRole('option', { name: format, exact: true }).click();
      await frame.getByTestId('filename-input').fill('ethanol');
      await button('save-button').click();
      await expect
        .poll(() => first.app.evaluate(() => (globalThis as any).__chemistryDownload), {
          timeout: 30000,
        })
        .toBe('completed');
      return path;
    };
    const ket = await download('ethanol.ket', 'Ket Format');
    expect(JSON.parse(readFileSync(ket, 'utf8')).mol0.atoms).toHaveLength(3);
    const mol = await download('ethanol.mol', 'MDL Molfile V2000');
    expect(readFileSync(mol, 'utf8')).toContain('V2000');
    const png = await download('ethanol.png', 'PNG Image');
    expect(readFileSync(png).subarray(1, 4).toString()).toBe('PNG');
    expect(
      await first.app.evaluate(({ nativeImage }, path) => {
        const pixels = nativeImage.createFromPath(path).toBitmap();
        const colors = new Set<number>();
        for (let i = 0; i < pixels.length; i += 4) colors.add(pixels.readUInt32LE(i));
        return colors.size;
      }, png),
    ).toBeGreaterThan(20);
    await button('open-file-button').click();
    await frame.getByTestId('open-from-file-button').locator('input[type=file]').setInputFiles(ket);
    await frame.getByTestId('open-as-new-button').click();
    await expect(frame.getByTestId('open-dialog')).not.toBeVisible();
    await ready(page);
    await expect.poll(atoms).toBe(3);
    const external = doc();
    const bytes = Buffer.from(JSON.stringify(nativeRing));
    const hash = createHash('sha256').update(bytes).digest('hex');
    writeFileSync(join(folder, 'data/assets', hash + '.bin'), bytes);
    external.project.structure = {
      __cruxBinary: {
        path: `assets/${hash}.bin`,
        kind: 'buffer',
        type: 'application/json',
        size: bytes.length,
      },
    };
    writeFileSync(join(folder, 'data/project.json'), JSON.stringify(external));
    await button('template-2').click();
    await canvas.click({ position: { x: 470, y: 350 } });
    await frame.getByRole('button', { name: 'Save project', exact: true }).click();
    await expect(frame.locator('#garden-project [role=status]')).toContainText('changed elsewhere');
    expect(atoms()).toBe(6);
    page.once('dialog', (dialog) => dialog.accept());
    await frame.getByRole('button', { name: 'Reload saved project', exact: true }).click();
    await ready(page);
    await expect
      .poll(() =>
        canvas.evaluate(async () => {
          const ket = JSON.parse(await (window as any).ketcher.getKet());
          const mol = Object.values(ket).find((v: any) => v?.type === 'molecule') as any;
          return {
            atoms: mol?.atoms.length,
            bonds: mol?.bonds.length,
            double: mol?.bonds.filter((b: any) => b.type === 2).length,
          };
        }),
      )
      .toEqual({ atoms: 6, bonds: 6, double: 3 });
    await page.screenshot({ path: join(evidence, 'ketcher-workshop.png') });
  } finally {
    await first.app.close();
  }
  const second = await launchApp({ dir: first.dir });
  try {
    await second.page.setViewportSize({ width: 2000, height: 1200 });
    await second.page.getByRole('button', { name: /enter/i }).click();
    const frame = await ready(second.page);
    expect(atoms()).toBe(6);
    expect(state('storage')['ketcher-tmpls']).toContain('Research ring');
    await frame.locator('button[data-testid="template-lib"]:visible').click();
    await frame.getByTestId('template-search-input').fill('Research ring');
    const group = frame.getByTestId('User Templates-accordion-item');
    if ((await group.getAttribute('aria-expanded')) !== 'true') await group.click();
    await expect(frame.getByText('Research ring', { exact: true })).toBeVisible();
    await second.page.screenshot({
      path: join(evidence, 'ketcher-library.png'),
      animations: 'disabled',
    });
    await frame.locator('button[data-testid="close-window-button"]:visible').click();
    await second.page.screenshot({ path: join(evidence, 'ketcher-reopened.png') });
    await exportNativeCrux(second.page, archive);
  } finally {
    await second.app.close();
  }
  const oldFolder = folder;
  renameSync(oldFolder, oldFolder + '-unavailable');
  const third = await launchApp();
  try {
    await third.page.setViewportSize({ width: 2000, height: 1200 });
    await enterGarden(third.page);
    await importNativeCrux(third.page, archive);
    const frame = await ready(third.page);
    const id = (await third.page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    folder = (await storedCrux(third.page, id)).projectFolder;
    expect(folder).not.toBe(oldFolder);
    expect(atoms()).toBe(6);
    expect(state('storage')['ketcher-tmpls']).toContain('Research ring');
    await frame.locator('button[data-testid="template-2"]:visible').click();
    await frame
      .locator('div[class*="intermediateCanvas"] > svg')
      .click({ position: { x: 470, y: 350 } });
    await expect.poll(atoms).toBe(12);
    await ready(third.page);
    await third.page.screenshot({ path: join(evidence, 'ketcher-imported.png') });
  } finally {
    await third.app.close();
    renameSync(oldFolder + '-unavailable', oldFolder);
  }
});
