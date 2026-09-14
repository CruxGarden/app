import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';
import { outputs } from './game-cruxspace-helpers';

/**
 * The Font tool (the actual Glyphr Studio 2) as a Crux Tool: a new project
 * opens and saves; a person renames the font on the native Settings page; the
 * scripted collaborator names it, draws an A from SVG and saves an OTF output;
 * a person builds a WOFF2 from the bar; the font survives a restart; a complete
 * Crux archive imports into a clean Garden with the folder gone.
 */
const frameOf = (page: Page) => page.frameLocator('iframe[data-crux-id]');
const status = (page: Page) => frameOf(page).locator('#garden-project [role=status]');
const ready = (page: Page) =>
  expect(status(page)).toHaveText('Saved to Garden', { timeout: 120000 });

test('Font: Glyphr Studio opens and saves, a person renames it, the collaborator draws an A and saves an OTF, restart and clean import', async () => {
  test.setTimeout(10 * 60_000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const evidence = resolve(__dirname, '../../docs/glyphr');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'font.crux');
  let folder = '';
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const errors: string[] = [];
  try {
    const { page } = first;
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);

    await test.step('create from the picker; a new project opens and saves', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Font\b/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      await ready(page);
      await expect.poll(() => doc().project?.name ?? '').toBe('My Font');
      expect(doc().project.gs2.settings.project.name).toBe('My Font');
      await expect(frameOf(page).locator('#app__wrapper')).toBeVisible();
      await page.screenshot({ path: join(evidence, 'glyphr-initial.png') });
    });

    await test.step('a person renames the font on the native Settings page', async () => {
      const frame = frameOf(page);
      await frame.getByText('Edit project and font info', { exact: true }).click();
      const name = frame.locator('#settings-page-input__project-name');
      await expect(name).toBeVisible({ timeout: 30000 });
      await name.fill('Garden Sans');
      await name.press('Tab');
      await expect
        .poll(() => doc().project?.gs2?.settings?.project?.name ?? '', { timeout: 30000 })
        .toBe('Garden Sans');
      await ready(page);
      expect(doc().project.name).toBe('Garden Sans');
      await page.screenshot({ path: join(evidence, 'glyphr-settings.png') });
    });

    await test.step('the scripted collaborator names it, draws an A and saves an OTF', async () => {
      const collab = page.getByRole('button', { name: 'Toggle collaboration' });
      if ((await collab.getAttribute('aria-pressed')) !== 'true') await collab.click();
      const box = page.getByPlaceholder('Send a message...');
      await box.fill('Start the font [font:letter]');
      await box.press('Enter');
      await expect(
        page.getByText('Named the font Moss Sans, drew an A from SVG and saved the OTF.', {
          exact: true,
        }),
      ).toBeVisible({ timeout: 240000 });
      await ready(page);
      expect(doc().project.name).toBe('Moss Sans');
      const glyph = doc().project.gs2.glyphs['glyph-0x41'];
      expect(glyph?.shapes?.length ?? 0).toBeGreaterThan(0);
      await expect.poll(() => outputs(folder).length).toBe(1);
      const [otf] = outputs(folder);
      expect(otf!.mimeType).toBe('font/otf');
      expect(readFileSync(join(folder, otf!.path)).subarray(0, 4).toString()).toBe('OTTO');
      await collab.click();
      await page.screenshot({ path: join(evidence, 'glyphr-agent.png') });
    });

    await test.step('a person builds a WOFF2 from the bar', async () => {
      const frame = frameOf(page);
      await frame.locator('#font-format').selectOption('woff2');
      await frame.locator('#output-name').fill('Moss Sans web');
      await frame.locator('#save-font').click();
      await expect(status(page)).toContainText('Saved Moss Sans web as a font output', {
        timeout: 120000,
      });
      await expect.poll(() => outputs(folder).length).toBe(2);
      const woff2 = outputs(folder).find((o) => o.label === 'Moss Sans web')!;
      expect(woff2.mimeType).toBe('font/woff2');
      expect(readFileSync(join(folder, woff2.path)).subarray(0, 4).toString()).toBe('wOF2');
      await page.screenshot({ path: join(evidence, 'glyphr-outputs.png') });
    });
    expect(errors).toEqual([]);
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ dir: first.dir });
  try {
    const { page } = second;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.getByRole('button', { name: /enter/i }).click();
    await test.step('restart: the font comes back with its glyph and outputs', async () => {
      await ready(page);
      expect(doc().project.name).toBe('Moss Sans');
      await frameOf(page).getByText('Edit project and font info', { exact: true }).click();
      await expect(frameOf(page).locator('#settings-page-input__project-name')).toHaveValue(
        'Moss Sans',
        { timeout: 30000 },
      );
      expect(outputs(folder).length).toBe(2);
      await page.screenshot({ path: join(evidence, 'glyphr-reopened.png') });
      await exportNativeCrux(page, archive, second.app);
    });
  } finally {
    await second.app.close();
    renameSync(folder, `${folder}-unavailable`);
  }

  const third = await launchApp({});
  try {
    const { page } = third;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);
    await test.step('clean Garden: the complete Crux imports and the font opens', async () => {
      await importNativeCrux(page, archive);
      const importedId = (await page
        .locator('[data-workspace-id]')
        .getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, importedId)).projectFolder;
      await ready(page);
      expect(doc().project.name).toBe('Moss Sans');
      expect(doc().project.gs2.glyphs['glyph-0x41'].shapes.length).toBeGreaterThan(0);
      expect(outputs(folder).length).toBe(2);
      await page.screenshot({ path: join(evidence, 'glyphr-imported.png') });
    });
  } finally {
    await third.app.close();
  }
});
