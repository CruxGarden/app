import { expect, chromium, type Page, type Browser } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { storedCrux } from '../multi-crux-helpers';
import type { MockApi } from '../api-mock';

/**
 * Shared moves of the guide specs that drive Site Cruxes (Astro) and other
 * starters: create one from the picker, wait for its real `astro dev`
 * preview, read the served site from an outside browser, publish through the
 * Share pane against the mock API.
 */

/** Add Crux → the named choice → Create; returns the id and Project Folder. */
export async function createFromPicker(page: Page, choice: RegExp, name?: string) {
  await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Crux' });
  await dialog.getByRole('button', { name: choice }).first().click();
  if (name) {
    const label = dialog.getByLabel('Name', { exact: true });
    if (await label.count()) await label.fill(name);
    else await dialog.getByPlaceholder('My Crux').fill(name);
  }
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 120_000 });
  const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
  const folder = (await storedCrux(page, id)).projectFolder as string;
  return { id, folder };
}

/**
 * Wait for the Site Crux's preview (the first run installs its dependencies).
 * A preview that failed once is retried once; twice is a failure with the
 * dev server's log. Returns the iframe's URL.
 */
export async function waitForSitePreview(page: Page, folder: string, timeout = 12 * 60_000) {
  const preview = page.locator('iframe[src^="http://127.0.0.1"]');
  const failed = page.getByText('Preview could not start', { exact: true });
  let retried = false;
  await expect
    .poll(
      async () => {
        if (await preview.first().isVisible()) return 'ready';
        if (await failed.isVisible().catch(() => false)) {
          const log = await page.evaluate((f) => window.electronAPI!.devserver.log(f), folder);
          const astroLog = existsSync(join(folder, '.astro/dev.log'))
            ? readFileSync(join(folder, '.astro/dev.log'), 'utf8').slice(-2000)
            : '(no .astro/dev.log)';
          if (retried) throw new Error(`preview failed twice: ${log.slice(-2000)}\n${astroLog}`);
          retried = true;
          await page.getByRole('button', { name: 'Retry preview' }).click();
        }
        return 'waiting';
      },
      { timeout, message: 'the site preview never appeared' },
    )
    .toBe('ready');
  return (await preview.first().getAttribute('src'))!;
}

/** An outside browser on the served site, the way a visitor would read it. */
export async function openSite(viewport = { width: 1280, height: 900 }) {
  const browser: Browser = await chromium.launch();
  const site = await browser.newPage({ viewport });
  // Never wait on a visitor's page without a bound: a hidden control must fail, not hang.
  site.setDefaultTimeout(30_000);
  return { site, close: () => browser.close() };
}

/** Fetch a URL until it answers with the wanted status (astro dev reloads take a moment). */
export async function pollStatus(url: string, status: number, timeout = 120_000) {
  await expect
    .poll(
      async () =>
        (await fetch(url, { signal: AbortSignal.timeout(10_000) })
          .then((r) => r.status)
          .catch(() => 0)) as number,
      {
        timeout,
        intervals: [1000],
      },
    )
    .toBe(status);
}

/** Fetch a URL until its body contains the text. */
export async function pollBody(url: string, text: string | RegExp, timeout = 120_000) {
  await expect
    .poll(
      async () =>
        fetch(url, { signal: AbortSignal.timeout(10_000) })
          .then((r) => r.text())
          .catch(() => ''),
      {
        timeout,
        intervals: [1000],
      },
    )
    .toMatch(text);
}

/**
 * Share → connect the test account → publish without a backup → "Up to date".
 * Returns the paths the mock API received for the crux.
 */
export async function publishViaShare(page: Page, api: MockApi, cruxId: string) {
  const { togglePanel } = await import('../panel-helpers');
  await togglePanel(page, 'Toggle share');
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.getByPlaceholder('email@example.com').fill('tester@example.com');
  await page.getByRole('button', { name: 'Send Code', exact: true }).click();
  await page.getByPlaceholder('Enter code').fill('123456');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  const backupAsk = page
    .getByRole('dialog')
    .filter({ hasText: 'A published site is not a backup' });
  await expect(backupAsk).toBeVisible({ timeout: 60_000 });
  await backupAsk.getByRole('button', { name: 'Share without a backup', exact: true }).click();
  await expect(page.getByText('Up to date')).toBeVisible({ timeout: 10 * 60_000 });
  return (api.state.published[cruxId] ?? []).map((f) => f.path);
}

/** A 1×1 transparent PNG. */
export const PNG_DOT = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** Replace the open Monaco buffer with `content` and save. */
export async function replaceEditor(page: Page, content: string) {
  // A previewable file opens in its preview; the editor is behind "Source".
  const source = page.getByRole('button', { name: 'Source', exact: true });
  if (await source.isVisible().catch(() => false)) await source.click();
  const editor = page.locator('.monaco-editor').first();
  await expect(editor).toBeVisible({ timeout: 60_000 });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(content);
  await page.keyboard.press('ControlOrMeta+S');
}

/**
 * Text is painted, not merely in the DOM: toBeVisible() accepts `opacity: 0`,
 * and themes that reveal blocks on scroll start every block there.
 */
export async function painted(
  scope: Page | ReturnType<Page['frameLocator']>,
  text: string | RegExp,
) {
  const el = scope.getByText(text).first();
  await expect(el).toBeVisible({ timeout: 3 * 60_000 });
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
}
