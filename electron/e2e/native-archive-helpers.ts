import { expect, type Page, type ElectronApplication } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import type { DownloadItem, Event } from 'electron';

/** Exercise the real complete-Crux export, capturing its browser download bytes. */
export async function exportNativeCrux(page: Page, path: string, app?: ElectronApplication) {
  if (app) {
    // Let Chromium stream large archives to disk instead of copying a Blob
    // through several renderer strings and one oversized DevTools message.
    await app.evaluate(({ session }, destination) => {
      const state = globalThis as unknown as { __nativeDownload?: string };
      state.__nativeDownload = undefined;
      const listener = (_event: Event, item: DownloadItem) => {
        if (!item.getFilename().endsWith('.crux')) return;
        session.defaultSession.removeListener('will-download', listener);
        item.setSavePath(destination);
        item.once('done', (_event, result) => {
          state.__nativeDownload = result;
        });
      };
      session.defaultSession.on('will-download', listener);
    }, path);
    await page.getByRole('button', { name: 'Export complete Crux', exact: true }).click();
    await page.getByRole('button', { name: 'Export Crux', exact: true }).click();
    await expect
      .poll(
        () =>
          app.evaluate(
            () => (globalThis as unknown as { __nativeDownload?: string }).__nativeDownload,
          ),
        { timeout: 180000 },
      )
      .toBe('completed');
    return;
  }
  await page.evaluate(() => {
    const state = window as unknown as { __nativeArchive?: Blob };
    const blobs = new Map<string, Blob>();
    const originalUrl = URL.createObjectURL.bind(URL);
    const originalClick = HTMLAnchorElement.prototype.click;
    state.__nativeArchive = undefined;
    URL.createObjectURL = (blob) => {
      const url = originalUrl(blob);
      if (blob instanceof Blob) blobs.set(url, blob);
      return url;
    };
    HTMLAnchorElement.prototype.click = function () {
      if (this.download.endsWith('.crux')) {
        state.__nativeArchive = blobs.get(this.href);
        URL.createObjectURL = originalUrl;
        HTMLAnchorElement.prototype.click = originalClick;
      } else originalClick.call(this);
    };
  });
  await page.getByRole('button', { name: 'Export complete Crux', exact: true }).click();
  await page.getByRole('button', { name: 'Export Crux', exact: true }).click();
  await expect
    .poll(
      () =>
        page.evaluate(() => !!(window as unknown as { __nativeArchive?: Blob }).__nativeArchive),
      {
        timeout: 90000,
      },
    )
    .toBe(true);
  const encoded = await page.evaluate(async () => {
    const bytes = new Uint8Array(
      await (window as unknown as { __nativeArchive: Blob }).__nativeArchive.arrayBuffer(),
    );
    let text = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(text);
  });
  writeFileSync(path, Buffer.from(encoded, 'base64'));
}

/** Call after entering an isolated, empty Garden. */
export async function importNativeCrux(page: Page, path: string) {
  await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import .crux file', exact: true }).click(),
  ]);
  await chooser.setFiles(path);
  await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 90000 });
}
