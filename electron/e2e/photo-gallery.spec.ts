import { test, expect } from '@playwright/test';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';

/**
 * The Photo Gallery template (astro-photo-folio on Astro): the claim the
 * template makes is that **a photograph is a file in a folder** — drop one in
 * and it is in the gallery, captioned from its name, with no index to edit.
 * This journey tests exactly that claim end to end: create from the picker,
 * see the seeded galleries live, copy a new file into `src/assets/digital/`
 * from outside the app, and watch it appear in the preview with the caption
 * its filename implies. Then the settings file names the gallery.
 */
const evidence = resolve(__dirname, '../../docs/photo-gallery');

test('Photo Gallery: the galleries render, a dropped file joins them, the settings name it', async () => {
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
      await page.getByRole('button', { name: /^Photo Gallery/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 120_000 });
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder as string;
      // The photographs arrive as real files, not as rows in a manifest.
      await expect
        .poll(() => existsSync(join(folder, 'src/assets/digital/digital-01.jpg')), {
          timeout: 120_000,
        })
        .toBe(true);
      expect(
        readdirSync(join(folder, 'src/assets/calendar')).filter((f) => f.endsWith('.jpg')),
      ).toHaveLength(12);
      expect(existsSync(join(folder, 'src/config.json'))).toBe(true);
      expect(existsSync(join(folder, 'LICENSE'))).toBe(true);
      expect(existsSync(join(folder, 'UPSTREAM.md'))).toBe(true);
    });

    const frame = () => page.frameLocator('iframe[src^="http://127.0.0.1"]');
    /**
     * Wait until a photograph has actually decoded. The tiles are lazily
     * loaded, so a screenshot taken on navigation catches empty boxes and
     * proves nothing about the gallery.
     */
    const photosLoaded = async () => {
      await expect
        .poll(
          () =>
            frame()
              .locator('img')
              .first()
              .evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)
              .catch(() => false),
          { timeout: 60_000 },
        )
        .toBe(true);
    };

    /**
     * The theme folds its nav behind a toggle at narrow widths, and a pane is
     * narrow. Located by class: the button's accessible name carries its icon
     * as well as the word, so matching on the name alone is unreliable.
     */
    const openMenu = async () => {
      const toggle = frame().locator('.nav-toggle');
      const nav = frame().locator('#primary-nav');
      if (!(await toggle.isVisible().catch(() => false))) return; // wide: always open
      if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
      await expect(nav).toBeVisible();
    };

    await test.step('the gallery is live in the Workshop', async () => {
      // The Workshop's Clean view is the preview for a Site Crux, so nothing
      // needs clicking: `astro dev` starts with the Crux, and the first run
      // installs the gallery's dependencies. On a timeout the dev server's own
      // log is the evidence, so the wait reads it rather than failing on a
      // bare locator.
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
              console.log(`[photo-gallery] preview failed once; retrying. log: ${log.slice(-1500)}`);
              retried = true;
              await page.getByRole('button', { name: 'Retry preview' }).click();
            }
            return status.status;
          },
          { timeout: 12 * 60_000, message: 'the gallery preview never appeared' },
        )
        .toBe('ready');
      await expect(frame().locator('img').first()).toBeVisible({ timeout: 2 * 60_000 });
      await photosLoaded();
      await page.screenshot({ path: join(evidence, 'gallery-home.png') });
      // At a pane's width the nav folds behind Menu, so open it to read it.
      await openMenu();
      await expect(frame().getByRole('link', { name: 'Analog' })).toBeVisible();
      await expect(frame().getByRole('link', { name: 'Calendar' })).toBeVisible();
      await expect(frame().getByRole('link', { name: 'Journal' })).toBeVisible();
      // The pages the template deliberately does not ship any more.
      await expect(frame().getByRole('link', { name: 'Privacy' })).toHaveCount(0);
      await expect(frame().getByRole('link', { name: 'Tech Blog' })).toHaveCount(0);
      await page.screenshot({ path: join(evidence, 'gallery-nav.png') });
    });

    await test.step('a photograph dropped into the folder joins the gallery', async () => {
      // Written from outside the app, the way a person would with Finder: the
      // watcher ingests it and Astro picks it up. The name is the caption.
      const source = join(folder, 'src/assets/digital/digital-01.jpg');
      copyFileSync(source, join(folder, 'src/assets/digital/harbour-lights.jpg'));
      const dropped = frame()
        .getByAltText(/harbour lights/i)
        .first();
      await expect(dropped).toBeVisible({ timeout: 5 * 60_000 });
      // Scrolled to, so the evidence shows the claim rather than the top of
      // the page: `toBeVisible` passes for an element below the fold.
      await dropped.scrollIntoViewIfNeeded();
      await expect(dropped).toBeInViewport({ timeout: 30_000 });
      // And decoded — the whole claim is that the file became a photograph on
      // the page. A tile in the viewport with nothing in it proves nothing:
      // it would look the same if Astro had never picked the file up.
      await expect
        .poll(
          () =>
            dropped
              .evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)
              .catch(() => false),
          { timeout: 2 * 60_000 },
        )
        .toBe(true);
      await page.screenshot({ path: join(evidence, 'gallery-dropped-photo.png') });
    });

    await test.step('the settings name the gallery', async () => {
      await page.getByRole('button', { name: 'Toggle metadata' }).click();
      const settings = page.getByTestId('pane-body-details');
      await expect(settings).toBeVisible();
      await page.screenshot({ path: join(evidence, 'gallery-settings.png') });
    });

    await test.step('the other galleries render', async () => {
      await openMenu();
      await frame().getByRole('link', { name: 'Calendar' }).click();
      await expect(
        frame()
          .getByRole('heading', { name: /calendar/i })
          .first(),
      ).toBeVisible({
        timeout: 2 * 60_000,
      });
      await photosLoaded();
      await page.screenshot({ path: join(evidence, 'gallery-calendar.png') });
      await openMenu();
      await frame().getByRole('link', { name: 'Journal' }).click();
      await expect(frame().getByText('A first walk').first()).toBeVisible({ timeout: 2 * 60_000 });
      await page.screenshot({ path: join(evidence, 'gallery-journal.png') });
    });

    expect(dir).toBeTruthy();
  } finally {
    await app.close();
  }
});
