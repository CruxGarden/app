import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';

/**
 * The Resume template (astro-resume on Astro). Its claim is that the whole
 * resume is one Markdown file — so that is what this edits, from outside the
 * app, and then reads back off the running page.
 */
const evidence = resolve(__dirname, '../../docs/resume');

test('Resume: one Markdown file is the whole resume', async () => {
  test.setTimeout(20 * 60_000);
  mkdirSync(evidence, { recursive: true });
  const { app, page } = await launchApp();
  try {
    page.setDefaultTimeout(60_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);

    let folder = '';
    await test.step('create from the picker', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Resume/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 120_000 });
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder as string;
      await expect
        .poll(() => existsSync(join(folder, 'src/pages/index.md')), { timeout: 120_000 })
        .toBe(true);
      expect(existsSync(join(folder, 'UPSTREAM.md'))).toBe(true);
      // Upstream's fictional person must not have travelled.
      expect(readFileSync(join(folder, 'src/pages/index.md'), 'utf8')).not.toMatch(/hendri/i);
      // Nor the Playwright postinstall, which would fetch a browser per crux.
      expect(readFileSync(join(folder, 'package.json'), 'utf8')).not.toContain('playwright');
    });

    const frame = () => page.frameLocator('iframe[src^="http://127.0.0.1"]');
    /** toBeVisible() accepts opacity: 0 — ask what is actually painted. */
    const painted = async (text: string | RegExp) => {
      const el = frame().getByText(text).first();
      await expect(el).toBeVisible({ timeout: 5 * 60_000 });
      await expect
        .poll(
          () =>
            el
              .evaluate((node: Element) => {
                for (let e: Element | null = node; e; e = e.parentElement)
                  if (Number(getComputedStyle(e).opacity) === 0) return 0;
                return 1;
              })
              .catch(() => 0),
          { timeout: 60_000 },
        )
        .toBe(1);
    };

    await test.step('the resume is live in the Workshop', async () => {
      const preview = page.locator('iframe[src^="http://127.0.0.1"]');
      const failed = page.getByText('Preview could not start', { exact: true });
      let retried = false;
      await expect
        .poll(
          async () => {
            if (await preview.isVisible()) return 'ready';
            const status = await page.evaluate(
              (f) => window.electronAPI!.devserver.status(f),
              folder,
            );
            if (await failed.isVisible().catch(() => false)) {
              const log = await page.evaluate((f) => window.electronAPI!.devserver.log(f), folder);
              if (retried) throw new Error(`preview failed twice; log: ${log}`);
              console.log(`[resume] preview failed once; retrying. log: ${log.slice(-1500)}`);
              retried = true;
              await page.getByRole('button', { name: 'Retry preview' }).click();
            }
            return status.status;
          },
          { timeout: 12 * 60_000, message: 'the resume preview never appeared' },
        )
        .toBe('ready');
      await painted('Work Experience');
      await painted(/Save as PDF|Your Name/);
      await page.screenshot({ path: join(evidence, 'resume-home.png') });
    });

    await test.step('editing the one file changes the page', async () => {
      const path = join(folder, 'src/pages/index.md');
      const md = readFileSync(path, 'utf8').replace('# Your Name', '# Rosa Albright');
      writeFileSync(path, md);
      await painted('Rosa Albright');
      await page.screenshot({ path: join(evidence, 'resume-edited.png') });
    });
  } finally {
    await app.close();
  }
});
