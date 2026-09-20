import { test, expect } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

/**
 * A document becomes a PDF without a LaTeX install.
 *
 * Pandoc has no PDF engine of its own, so the app uses Typst when the machine
 * has it and otherwise prints a page Pandoc wrote with the browser it already
 * ships. Either way a real PDF lands in the Crux as an Artifact, and the
 * journey asserts the file itself — the bytes start with %PDF — rather than
 * anything the page said.
 */
function cruxFolder(dir: string): string {
  const garden = join(dir, 'garden');
  const [first] = readdirSync(garden);
  if (!first) throw new Error('no crux folder');
  return join(garden, first);
}

test('a document becomes a PDF, whichever engine this machine has', async () => {
  test.setTimeout(240_000);
  const { app, page, dir } = await launchApp();
  try {
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Media Tools/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible();
    const folder = cruxFolder(dir);

    const bench = page.frameLocator('iframe[data-crux-id]');
    await expect(bench.getByRole('heading', { name: 'Media bench' })).toBeVisible({
      timeout: 30_000,
    });

    // Pandoc does the conversion; without it there is no route at all.
    const pandoc = await bench
      .locator('.tool-chip')
      .filter({ hasText: 'Pandoc' })
      .getAttribute('class');
    test.skip(!pandoc?.includes('ok'), 'this machine has no Pandoc');

    mkdirSync(join(folder, 'documents'), { recursive: true });
    writeFileSync(
      join(folder, 'documents', 'brief.md'),
      '# A brief\n\nWhat this is for, in a sentence.\n\n## A section\n\n- one\n- two\n',
    );
    await expect
      .poll(
        async () =>
          await bench
            .locator('#files')
            .innerText()
            .catch(() => ''),
        { timeout: 30_000, intervals: [1000] },
      )
      .toContain('documents/brief.md');

    // Adding a file reloads the preview under the bench, so pick and run with
    // a retry and judge the outcome by the folder.
    const out = join(folder, 'exports', 'brief.pdf');
    for (let attempt = 0; attempt < 3; attempt++) {
      await bench
        .locator('#files button')
        .filter({ hasText: 'documents/brief.md' })
        .click({ timeout: 30_000 });
      try {
        await expect(bench.locator('#chosen-name')).toHaveText('documents/brief.md', {
          timeout: 5_000,
        });
        await bench.locator('#recipe').selectOption('to-pdf');
        await bench.getByRole('button', { name: 'Run', exact: true }).first().click();
        let last = -1;
        await expect
          .poll(
            () => {
              const size = existsSync(out) ? statSync(out).size : -1;
              const settled = size > 0 && size === last;
              last = size;
              return settled;
            },
            { timeout: 60_000, intervals: [1000] },
          )
          .toBe(true);
        break;
      } catch {
        if (attempt === 2) throw new Error('the PDF was never written');
        await page.waitForTimeout(1500);
      }
    }

    // A real PDF, and the words survived into it.
    const pdf = readFileSync(out);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);

    // The intermediate page the browser route writes is scaffolding under
    // .crux/, which is never ingested — and it does not outlive the run.
    expect(existsSync(join(folder, '.crux', 'print', 'brief.html'))).toBe(false);

    // It arrived as an Artifact like anything else the tools make.
    await expect
      .poll(
        async () =>
          await bench
            .locator('#files')
            .innerText()
            .catch(() => ''),
        { timeout: 60_000, intervals: [1000] },
      )
      .toContain('exports/brief.pdf');
  } finally {
    await app.close();
  }
});
