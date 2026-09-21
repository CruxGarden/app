import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';

/**
 * The Business Page template (Foxi on Astro). Its claims are that the words
 * are **data, not markup** — the business is named in `src/config.json` and
 * what it does lives in JSON under `src/data/` — and that it carries **no
 * tracking** (ADR 0008). Both are tested here against the running site, not
 * against the files.
 */
const evidence = resolve(__dirname, '../../docs/business-page');

test('Business Page: the site runs, its words come from data, and it tracks nobody', async () => {
  test.setTimeout(20 * 60_000);
  mkdirSync(evidence, { recursive: true });
  const { app, page, dir } = await launchApp();
  try {
    page.setDefaultTimeout(60_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);

    let folder = '';
    await test.step('create from the picker', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Business Page/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 120_000 });
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder as string;
      await expect
        .poll(() => existsSync(join(folder, 'src/config.json')), { timeout: 120_000 })
        .toBe(true);
      for (const f of [
        'LICENSE',
        'UPSTREAM.md',
        'src/data/json-files/featuresData.json',
        'src/data/markdown-files/terms.md',
      ])
        expect(existsSync(join(folder, f)), f).toBe(true);
      // The upstream demo's fictional product must not have travelled.
      expect(readFileSync(join(folder, 'src/config.json'), 'utf8')).not.toMatch(/foxi/i);
    });

    const frame = () => page.frameLocator('iframe[src^="http://127.0.0.1"]');
    /**
     * Playwright's toBeVisible() accepts `opacity: 0`, and this theme starts
     * every block there until something reveals it — so a passing assertion
     * can sit in front of a blank page. It did, twice. Ask what is painted.
     */
    const painted = async (text: string) => {
      const el = frame().getByText(text).first();
      await expect(el).toBeVisible({ timeout: 5 * 60_000 });
      await expect
        .poll(
          () =>
            el
              .evaluate((node: Element) => {
                for (let e: Element | null = node; e; e = e.parentElement) {
                  if (Number(getComputedStyle(e).opacity) === 0) return 0;
                }
                return 1;
              })
              .catch(() => 0),
          { timeout: 60_000 },
        )
        .toBe(1);
      // ClientRouter cross-fades between pages; without this a screenshot taken
      // straight after catches the tail of it and looks washed out.
      await page.waitForTimeout(700);
    };
    /** The theme folds its nav behind a toggle at a pane's width. */
    const openMenu = async () => {
      const toggle = frame().locator('.nav-toggle, [aria-controls="primary-nav"]').first();
      if (!(await toggle.isVisible().catch(() => false))) return;
      if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    };

    await test.step('the site is live in the Workshop', async () => {
      // The Workshop's Clean view is the preview for a Site Crux: `astro dev`
      // starts with the Crux and the first run installs its dependencies.
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
              console.log(
                `[business-page] preview failed once; retrying. log: ${log.slice(-1500)}`,
              );
              retried = true;
              await page.getByRole('button', { name: 'Retry preview' }).click();
            }
            return status.status;
          },
          { timeout: 12 * 60_000, message: 'the business site preview never appeared' },
        )
        .toBe('ready');
      // The page below the header, not the brand in it. The theme reveals its
      // blocks with an IntersectionObserver and they start at opacity 0, so a
      // header-only assertion passes over a blank page — it did once.
      await expect(frame().locator('main h1').first()).toBeVisible({ timeout: 2 * 60_000 });
      await painted('What you do, in');
      await page.screenshot({ path: join(evidence, 'business-home.png') });
    });

    await test.step('it tracks nobody', async () => {
      // ADR 0008. The theme shipped Google Analytics, Tag Manager and Search
      // Console; none of it may reach the page a visitor loads.
      const html = await frame().locator('body').innerHTML();
      for (const trace of ['googletagmanager', 'google-analytics', 'gtag(', 'gtm.js'])
        expect(html.toLowerCase(), trace).not.toContain(trace);
      // Nor the theme author's upsell for their paid version.
      expect(html).not.toMatch(/foxi/i);
    });

    await test.step('the business is named in one file', async () => {
      const path = join(folder, 'src/config.json');
      const config = JSON.parse(readFileSync(path, 'utf8'));
      config.name = 'Harbour Joinery';
      writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
      // Written from outside the app: the watcher ingests it, Astro reloads,
      // and the name reaches the page it is supposed to reach.
      await painted('Harbour Joinery');
      await page.screenshot({ path: join(evidence, 'business-named.png') });
    });

    await test.step('what it does comes from a data file', async () => {
      const path = join(folder, 'src/data/json-files/featuresData.json');
      const features = JSON.parse(readFileSync(path, 'utf8'));
      features[0].title = 'Fitted kitchens';
      features[0].description = 'Measured, made and installed in your home.';
      writeFileSync(path, `${JSON.stringify(features, null, 2)}\n`);
      // featuresData feeds /features, not the home page — go and look there.
      await openMenu();
      await frame().getByRole('link', { name: 'Features' }).first().click();
      await painted('Fitted kitchens');
      await page.screenshot({ path: join(evidence, 'business-features.png') });
    });

    expect(dir).toBeTruthy();
  } finally {
    await app.close();
  }
});
