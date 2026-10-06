import { expect, type Page, type ElectronApplication } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import type { DownloadItem, Event } from 'electron';

/** Exercise the real complete-Crux export, capturing its browser download bytes. */
export async function exportNativeCrux(
  page: Page,
  path: string,
  app?: ElectronApplication,
  /** How to reach the Export pane; embedded apps have the Workshop's "Export complete Crux" button. */
  open: () => Promise<void> = () =>
    page.getByRole('button', { name: 'Export complete Crux', exact: true }).click(),
  runtime: 'reference' | 'included' = 'included',
) {
  if (app) {
    // Let Chromium stream large archives to disk instead of copying a Blob
    // through several renderer strings and one oversized DevTools message.
    await app.evaluate(({ session }, destination) => {
      const state = globalThis as unknown as { __nativeDownload?: string; __downloads?: string[] };
      state.__nativeDownload = undefined;
      state.__downloads = [];
      const listener = (_event: Event, item: DownloadItem) => {
        state.__downloads!.push(item.getFilename());
        if (!item.getFilename().endsWith('.crux')) return;
        session.defaultSession.removeListener('will-download', listener);
        item.setSavePath(destination);
        item.once('done', (_event, result) => {
          state.__nativeDownload = result;
        });
      };
      session.defaultSession.on('will-download', listener);
    }, path);
    await open();
    const choice = page.getByRole('radio', {
      name: runtime === 'included' ? /^Include tools/ : /^By reference/,
    });
    if (await choice.count()) await choice.check();
    await page.getByRole('button', { name: 'Export Crux', exact: true }).click();
    const said = async () => {
      const pane = await page
        .getByTestId('pane-body-export')
        .innerText()
        .catch(() => '(no Export pane)');
      const seen = await app
        .evaluate(() => (globalThis as unknown as { __downloads?: string[] }).__downloads)
        .catch(() => undefined);
      return `downloads seen: ${JSON.stringify(seen)}; Export pane ends: …${pane.replace(/\s+/g, ' ').slice(-240)}`;
    };
    await expect
      .poll(
        // Packing a big archive keeps the main process busy; an evaluate that
        // lands then can be dropped ("promise was garbage collected"). Ask again.
        () =>
          app
            .evaluate(
              () => (globalThis as unknown as { __nativeDownload?: string }).__nativeDownload,
            )
            .catch(() => undefined),
        // A complete archive with a large tool runtime (BentoPDF, PlayCanvas)
        // streams for minutes; the spec's own timeout bounds the wait.
        { timeout: 480000 },
      )
      .toBe('completed')
      .catch(async (error: Error) => {
        throw new Error(`${error.message}\n${await said()}`);
      });
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
  await open();
  const choice = page.getByRole('radio', {
    name: runtime === 'included' ? /^Include tools/ : /^By reference/,
  });
  if (await choice.count()) await choice.check();
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
    page.getByRole('button', { name: 'Import Crux, tool or Mood', exact: true }).click(),
  ]);
  await chooser.setFiles(path);
  // A big tool Crux (GDevelop: 14,000 files) takes as long to import as to create.
  await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 300_000 });
  // An imported Crux may arrive without a Workshop layout: open the pane so the
  // tool's frame exists, and give the Tasks pane's width back to it.
  const frame = page.locator('iframe[data-crux-id]');
  if (!(await frame.count())) {
    const { openPanel } = await import('./panel-helpers');
    await openPanel(page, 'workshop', 'Toggle workshop');
  }
  const tasks = page.locator('header').getByRole('button', { name: 'Toggle tasks', exact: true });
  if ((await tasks.count()) && (await tasks.getAttribute('aria-pressed')) === 'true')
    await tasks.click();
  await expect(frame.first()).toBeVisible({ timeout: 90000 });
}
