import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';
import { outputs } from './game-cruxspace-helpers';

/**
 * The layout tool (the actual pdfme Designer, Viewer, generator and converter,
 * plus one page) as a Crux Tool: a name and a page chosen by a person reach
 * data/project.json, the scripted collaborator names the poster, adds text
 * blocks and saves the page as PDF and PNG outputs, Preview renders the page,
 * the layout survives a restart, and a complete Crux archive imports into a
 * clean Garden with the folder gone, where the person continues.
 */
const frameOf = (page: Page) => page.frameLocator('iframe[data-crux-id]');
const status = (page: Page) => frameOf(page).locator('#garden-project [role=status]');
async function ready(page: Page) {
  await expect(status(page)).toHaveText('Saved to Garden', { timeout: 180000 });
  await expect(frameOf(page).locator('#layout-name')).toBeVisible();
}

test('Layout: a named page, agent text blocks with PDF and PNG outputs, preview, restart and clean import', async () => {
  test.setTimeout(12 * 60_000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const evidence = resolve(__dirname, '../../docs/pdfme');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'layout.crux');
  let folder = '';
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const blocks = () =>
    (doc().project?.template?.schemas?.[0] ?? []) as {
      name: string;
      type: string;
      content?: string;
    }[];
  const errors: string[] = [];
  try {
    const { page } = first;
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);

    await test.step('create from the picker; the designer opens and the empty layout saves', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Layout\b/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      console.log('Layout folder', folder);
      await ready(page);
      await expect.poll(() => doc().project?.page ?? '').toBe('a4-portrait');
      expect(blocks()).toEqual([]);
      await page.screenshot({ path: join(evidence, 'pdfme-initial.png') });
    });

    await test.step('a person names the layout and picks a landscape page; both are saved', async () => {
      await frameOf(page).locator('#layout-name').fill('Open day');
      await frameOf(page).locator('#layout-page').selectOption('a4-landscape');
      await ready(page);
      await expect.poll(() => doc().project?.name).toBe('Open day');
      await expect.poll(() => doc().project?.page).toBe('a4-landscape');
      expect(doc().project.template.basePdf).toMatchObject({ width: 297, height: 210 });
    });

    await test.step('the scripted collaborator names the poster, adds two text blocks and saves PDF and PNG outputs', async () => {
      const collab = page.getByRole('button', { name: 'Toggle collaboration' });
      if ((await collab.getAttribute('aria-pressed')) !== 'true') await collab.click();
      const box = page.getByPlaceholder('Send a message...');
      await box.fill('Make the open day poster [layout:poster]');
      await box.press('Enter');
      await expect(
        page.getByText(
          'Named the poster, set the headline and the date, and saved the PDF and the image to the Cruxspace.',
          { exact: true },
        ),
      ).toBeVisible({ timeout: 240000 });
      await ready(page);
      expect(doc().project.name).toBe('Open day poster');
      expect(blocks().map((b) => b.name)).toEqual(['headline', 'when']);
      await expect(frameOf(page).getByText('Open day at the seed library')).toBeVisible();
      const outs = outputs(folder);
      expect(outs.map((o) => o.label).sort()).toEqual([
        'Open day poster',
        'Open day poster (image)',
      ]);
      const pdf = outs.find((o) => o.mimeType === 'application/pdf')!;
      const png = outs.find((o) => o.mimeType === 'image/png')!;
      expect(readFileSync(join(folder, pdf.path)).subarray(0, 4).toString()).toBe('%PDF');
      expect(readFileSync(join(folder, png.path)).subarray(1, 4).toString()).toBe('PNG');
      expect(readFileSync(join(folder, png.path)).length).toBeGreaterThan(5000);
      await collab.click();
      await page.waitForTimeout(800); // the Designer remounts to the wider pane
      await page.screenshot({ path: join(evidence, 'pdfme-agent.png') });
    });

    await test.step('a person saves an image from the bar with their own name; Preview renders the page', async () => {
      await frameOf(page).locator('#output-name').fill('Poster proof');
      await frameOf(page).locator('#save-image').click();
      await expect(status(page)).toContainText('Saved Poster proof as an image output', {
        timeout: 60000,
      });
      await expect.poll(() => outputs(folder).length).toBe(3);
      await frameOf(page).getByRole('tab', { name: 'Preview' }).click();
      await expect(
        frameOf(page).locator('#viewer').getByText('Saturday 3 October, 10 to 4'),
      ).toBeVisible();
      await page.screenshot({ path: join(evidence, 'pdfme-preview.png') });
      await frameOf(page).getByRole('tab', { name: 'Design' }).click();
      await ready(page);
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
    await test.step('restart: the poster comes back with its blocks and outputs', async () => {
      await ready(page);
      await expect(frameOf(page).locator('#layout-name')).toHaveValue('Open day poster');
      await expect(frameOf(page).getByText('Open day at the seed library')).toBeVisible();
      expect(outputs(folder).length).toBe(3);
      await page.screenshot({ path: join(evidence, 'pdfme-reopened.png') });
      await exportNativeCrux(page, archive, second.app);
    });
  } finally {
    await second.app.close();
    renameSync(folder, `${folder}-unavailable`);
  }

  const third = await launchApp();
  try {
    const { page } = third;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);
    await test.step('clean Garden: the complete Crux imports and the person renames the poster', async () => {
      await importNativeCrux(page, archive);
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      const importedId = (await page
        .locator('[data-workspace-id]')
        .getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, importedId)).projectFolder;
      await ready(page);
      await expect(frameOf(page).getByText('Open day at the seed library')).toBeVisible();
      await frameOf(page).locator('#layout-name').fill('Open day poster 2027');
      await ready(page);
      await expect.poll(() => doc().project.name).toBe('Open day poster 2027');
      expect(outputs(folder).length).toBe(3);
      await page.screenshot({ path: join(evidence, 'pdfme-imported.png') });
    });
  } finally {
    await third.app.close();
  }
});
