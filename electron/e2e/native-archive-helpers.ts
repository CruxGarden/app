import { expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';

/** Exercise the real complete-Crux export, capturing its browser download bytes. */
export async function exportNativeCrux(page: Page, path: string) {
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
