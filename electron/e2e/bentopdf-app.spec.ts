import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

/**
 * BentoPDF (the actual toolkit, Simple Mode) as a Crux Tool: a PDF loaded into
 * the real Rotate tool and the result it would download are both kept as
 * binary Artifacts listed in data/project.json; the scripted collaborator
 * names the project and rotates a document through App Tools; the list
 * survives a restart; a complete Crux archive imports into a clean Garden
 * with the folder gone, and the kept papers merge through the real Merge tool.
 */
const frameOf = (page: Page) => page.frameLocator('iframe[data-crux-id]');
const status = (page: Page) => frameOf(page).locator('#garden-project [role=status]');
async function ready(page: Page) {
  await expect(status(page)).toHaveText(/Saved (to|.* to) Garden/, { timeout: 180000 });
}
const documentsOf = (page: Page) =>
  frameOf(page)
    .locator('body')
    .evaluate(async () => {
      const g = (window as any).gardenBento;
      await g.whenIdle();
      return g.documents() as {
        name: string;
        pages: number | null;
        source: string;
        tool: string;
      }[];
    });
const openTool = async (page: Page, tool: string) => {
  await frameOf(page).locator(`#tool-grid a[href*="${tool}"]`).first().click();
  await expect(frameOf(page).locator('#file-input')).toBeAttached();
  await ready(page);
};

test('BentoPDF: real rotate and merge, kept papers and results, agent tools, restart and clean import', async () => {
  test.setTimeout(15 * 60_000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const evidence = resolve(__dirname, '../../docs/bentopdf');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'papers.crux');
  const sample = resolve(__dirname, 'fixtures/bentopdf/sample.pdf');
  let folder = '';
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const entries = () =>
    doc().project.documents as {
      name: string;
      pages: number | null;
      source: string;
      tool: string;
      file: { __cruxBinary: { path: string } };
    }[];
  const bytesOf = (entry: { file: { __cruxBinary: { path: string } } }) =>
    readFileSync(join(folder, 'data', entry.file.__cruxBinary.path));
  const errors: string[] = [];
  try {
    const { page } = first;
    page.setDefaultTimeout(60000);
    // Upstream's stylesheet declares cross-document view transitions (@view-transition), and Chromium
    // reports the one it skips on each page change; nothing of the app fails.
    page.on('pageerror', (e) => e.message !== 'Transition was skipped' && errors.push(e.message));
    await page.setViewportSize({ width: 1800, height: 1100 });
    await enterGarden(page);

    await test.step('create from the picker; the toolkit opens on its tool grid with an empty list', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^BentoPDF/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      console.log('BentoPDF folder', folder);
      await ready(page);
      await expect(frameOf(page).locator('#tool-grid a[href*="rotate-pdf"]').first()).toBeVisible();
      expect(entries()).toEqual([]);
      const html = readFileSync(join(folder, 'runtime/index.html'), 'utf8');
      expect(html).not.toMatch(/googletagmanager|plausible|cdn\.jsdelivr/);
      await page.screenshot({ path: join(evidence, 'bentopdf-initial.png') });
    });

    await test.step('a person rotates a PDF with the real tool; the paper and the result are kept', async () => {
      await openTool(page, 'rotate-pdf');
      await frameOf(page).locator('#file-input').setInputFiles(sample);
      await expect(frameOf(page).locator('#page-thumbnails canvas').first()).toBeVisible({
        timeout: 60000,
      });
      await expect.poll(() => entries().length).toBe(1);
      expect(entries()[0]).toMatchObject({
        name: 'sample.pdf',
        pages: 2,
        source: 'upload',
        tool: 'rotate-pdf',
      });
      expect(bytesOf(entries()[0])).toEqual(readFileSync(sample));
      await frameOf(page).locator('#rotate-all-right').click();
      await frameOf(page).locator('#process-btn').click();
      await expect.poll(() => entries().length, { timeout: 60000 }).toBe(2);
      await ready(page);
      const result = entries()[1];
      expect(result).toMatchObject({ pages: 2, source: 'tool', tool: 'rotate-pdf' });
      expect(result.name).toMatch(/\.pdf$/);
      expect(bytesOf(result).subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(bytesOf(result)).not.toEqual(readFileSync(sample));
      expect(existsSync(join(first.dir, result.name))).toBe(false); // saved, not downloaded
      await page.screenshot({ path: join(evidence, 'bentopdf-rotated.png') });
    });

    await test.step('the scripted collaborator names the project and rotates the sample', async () => {
      const collab = page.getByRole('button', { name: 'Toggle collaboration' });
      if ((await collab.getAttribute('aria-pressed')) !== 'true') await collab.click();
      const box = page.getByPlaceholder('Send a message...');
      await box.fill('Name the project and rotate the sample [bentopdf:edit]');
      await box.press('Enter');
      await expect(
        page.getByText('Named the project Garden papers and rotated sample.pdf by 90 degrees.', {
          exact: true,
        }),
      ).toBeVisible({ timeout: 150000 });
      await ready(page);
      expect(doc().project.name).toBe('Garden papers');
      expect(entries().length).toBe(3);
      expect(entries()[2]).toMatchObject({
        name: 'sample-rotated.pdf',
        pages: 2,
        source: 'agent',
        tool: 'rotate',
      });
      expect(bytesOf(entries()[2]).subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(await documentsOf(page)).toHaveLength(3);
      await collab.click();
      await page.screenshot({ path: join(evidence, 'bentopdf-agent.png') });
    });
    expect(errors).toEqual([]);
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ dir: first.dir });
  try {
    const { page } = second;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1800, height: 1100 });
    await test.step('restart: the toolkit reopens with the kept documents', async () => {
      await page.getByRole('button', { name: /enter/i }).click();
      await ready(page);
      expect((await documentsOf(page)).map((d) => d.name)).toEqual(entries().map((e) => e.name));
      expect(
        await frameOf(page)
          .locator('body')
          .evaluate(() => (window as any).gardenBento.name()),
      ).toBe('Garden papers');
      await page.screenshot({ path: join(evidence, 'bentopdf-reopened.png') });
      await exportNativeCrux(page, archive, second.app);
    });
  } finally {
    await second.app.close();
  }

  renameSync(folder, `${folder}-unavailable`);
  const third = await launchApp();
  try {
    const { page } = third;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1800, height: 1100 });
    await test.step('clean Garden: the complete Crux imports and the kept papers merge with the real tool', async () => {
      await enterGarden(page);
      await importNativeCrux(page, archive);
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      await ready(page);
      expect(entries().length).toBe(3);
      for (const entry of entries())
        expect(existsSync(join(folder, 'data', entry.file.__cruxBinary.path))).toBe(true);
      // The kept papers go back into a tool: the original and the agent's rotation, merged.
      await openTool(page, 'merge-pdf');
      await frameOf(page)
        .locator('#file-input')
        .setInputFiles([
          { name: 'sample.pdf', mimeType: 'application/pdf', buffer: bytesOf(entries()[0]) },
          {
            name: 'sample-rotated.pdf',
            mimeType: 'application/pdf',
            buffer: bytesOf(entries()[2]),
          },
        ]);
      // The merge list fills once the tool has read both files.
      await expect(frameOf(page).locator('#file-list li')).toHaveCount(2, { timeout: 60000 });
      await expect.poll(() => entries().length).toBe(3); // the same bytes are already kept
      await frameOf(page).locator('#process-btn').click();
      await expect.poll(() => entries().length, { timeout: 60000 }).toBe(4);
      await ready(page);
      expect(entries()[3]).toMatchObject({
        name: 'merged.pdf',
        pages: 4,
        source: 'tool',
        tool: 'merge-pdf',
      });
      await page.screenshot({ path: join(evidence, 'bentopdf-imported.png') });
    });
  } finally {
    await third.app.close();
  }
});
