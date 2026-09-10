import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { launchApp } from './launch';
import { enterGarden, createCrux, switchCrux, storedCrux } from './multi-crux-helpers';

async function showHtml(page: Page, id: string, name: string) {
  const meta = await storedCrux(page, id);
  writeFileSync(
    join(meta.projectFolder, 'index.html'),
    `<h1>${name}</h1><input aria-label="Preview input"><script>
      const previous = localStorage.getItem('owner');
      if (previous && previous !== '${name}') localStorage.setItem('foreign-owner', previous);
      localStorage.setItem('owner', '${name}');
      document.body.dataset.foreignOwner = localStorage.getItem('foreign-owner') || '';
    </script>`,
  );
  const tree = page.getByRole('tree');
  const toggle = page.getByRole('button', { name: 'Toggle artifacts' });
  if ((await toggle.getAttribute('aria-pressed')) === 'false') await toggle.click();
  await tree.getByText('index.html', { exact: true }).click();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.frameLocator('iframe[data-crux-id]').getByRole('heading')).toHaveText(name);
  return (await page.locator('iframe[data-crux-id]').getAttribute('src'))!;
}
async function previewStore(page: Page, value?: string) {
  return page
    .frameLocator('iframe[data-crux-id]')
    .locator('body')
    .evaluate(async (_body, value) => {
      const id = crypto.randomUUID();
      const response = new Promise<unknown>((resolve) => {
        const receive = (e: MessageEvent) => {
          if (e.source === parent && e.data?.id === id) {
            window.removeEventListener('message', receive);
            resolve(e.data.value);
          }
        };
        window.addEventListener('message', receive);
      });
      if (value !== undefined)
        parent.postMessage(
          { type: 'crux:store:set', id: 'write', key: 'owner', value, mode: 'public' },
          '*',
        );
      parent.postMessage({ type: 'crux:store:get', id, key: 'owner' }, '*');
      return response;
    }, value);
}
test('static previews retain distinct ports and storage; shortcuts work from a preview frame', async () => {
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    const alpha = await createCrux(page, 'Alpha');
    const a = await showHtml(page, alpha, 'Alpha');
    await expect.poll(() => previewStore(page, 'Alpha')).toBe('Alpha');
    const beta = await createCrux(page, 'Beta');
    const b = await showHtml(page, beta, 'Beta');
    await expect.poll(() => previewStore(page, 'Beta')).toBe('Beta');
    // An unregistered frame on A's valid preview origin cannot write B's store.
    await page.evaluate((url) => {
      const frame = document.createElement('iframe');
      frame.id = 'unregistered-preview';
      frame.src = url;
      document.body.append(frame);
    }, a);
    await page
      .frameLocator('#unregistered-preview')
      .locator('body')
      .evaluate(() =>
        parent.postMessage(
          { type: 'crux:store:set', key: 'owner', value: 'WRONG', mode: 'public' },
          '*',
        ),
      );
    expect(await previewStore(page)).toBe('Beta');
    await page.locator('#unregistered-preview').evaluate((frame) => frame.remove());
    expect(new URL(a).origin).not.toBe(new URL(b).origin);
    // Clean/Advanced can reload a preview. Remember any foreign owner across reloads,
    // while allowing the same Crux to see its own previously saved browser state.
    await expect(page.frameLocator('iframe[data-crux-id]').locator('body')).toHaveAttribute(
      'data-foreign-owner',
      '',
    );
    expect(await (await fetch(a)).text()).toContain('<h1>Alpha</h1>');
    await page.frameLocator('iframe[data-crux-id]').getByRole('textbox').click();
    // Exercise Electron's host input seam with a cross-origin child focused.
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('crux-app://'),
      )!;
      w.focus();
      w.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Control', modifiers: ['control'] });
      w.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab', modifiers: ['control'] });
    });
    await expect(
      page.getByRole('status', { name: 'Recent Cruxes' }).locator('[aria-current=true]'),
    ).toHaveText('Alpha');
    // Native Tab exercises Electron's preview interception. Pair the modifier
    // in Playwright's newly focused renderer target before releasing it: CDP
    // suppresses an unmatched keyup after input moves out of the child frame.
    await page.keyboard.down('Control');
    await page.keyboard.up('Control');
    await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
      'Alpha',
    );
    await expect(page.frameLocator('iframe[data-crux-id]').getByRole('heading')).toHaveText(
      'Alpha',
    );
    expect(await previewStore(page)).toBe('Alpha');
    await expect(page.frameLocator('iframe[data-crux-id]').locator('body')).toHaveAttribute(
      'data-foreign-owner',
      '',
    );
    expect(new URL((await page.locator('iframe[data-crux-id]').getAttribute('src'))!).origin).toBe(
      new URL(a).origin,
    );
    await page.frameLocator('iframe[data-crux-id]').getByRole('textbox').click();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().startsWith('crux-app://'))!
        .webContents.sendInputEvent({
          type: 'keyDown',
          keyCode: 'K',
          modifiers: ['control', 'alt'],
        });
    });
    await expect(page.getByRole('textbox', { name: 'Find an open Crux' })).toBeFocused();
    await page.keyboard.press('Escape');
    await switchCrux(page, 'Beta');
    await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
    await page.getByRole('button', { name: 'Close Alpha workspace' }).click();
    await page.getByRole('button', { name: 'Discard edits and close' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(fetch(a)).rejects.toThrow();
    expect(await (await fetch(b)).text()).toContain('<h1>Beta</h1>');
  } finally {
    await app.close();
  }
});

test('two real Astro processes negotiate an occupied preferred port and serve their own files', async () => {
  test.setTimeout(240000);
  const { app, page } = await launchApp();
  const occupied = createServer((_q, r) => r.end('unrelated listener'));
  await new Promise<void>((resolve) => occupied.listen(0, '127.0.0.1', resolve));
  const preferred = (occupied.address() as { port: number }).port;
  try {
    await enterGarden(page);
    const folders: string[] = [];
    for (const title of ['Astro Alpha', 'Astro Beta']) {
      const id = await createCrux(page, title);
      const meta = await storedCrux(page, id);
      const folder = meta.projectFolder;
      folders.push(folder);
      mkdirSync(join(folder, 'src/pages'), { recursive: true });
      writeFileSync(join(folder, '.cruxignore'), 'node_modules/\n.astro/\ndist/\n');
      writeFileSync(
        join(folder, 'package.json'),
        JSON.stringify({
          name: 'crux-preview-fixture',
          type: 'module',
          dependencies: { astro: '^5.0.0' },
        }),
      );
      writeFileSync(join(folder, 'astro.config.mjs'), 'export default {};');
      writeFileSync(join(folder, 'src/pages/index.astro'), `<h1>${title}</h1>`);
    }
    const urls = await page.evaluate(
      async ({ folders, preferred }) =>
        Promise.all(
          folders.map(async (folder) => {
            const api = window.electronAPI!;
            const installed = await api.toolchain.install(folder);
            if (installed.code) throw new Error(installed.log);
            return api.devserver.start(folder, { port: preferred });
          }),
        ),
      { folders, preferred },
    );
    expect(new Set(urls).size).toBe(2);
    for (const [index, url] of urls.entries()) {
      expect(Number(new URL(url).port)).not.toBe(preferred);
      expect(await (await fetch(url)).text()).toContain(index === 0 ? 'Astro Alpha' : 'Astro Beta');
    }
    const next = await page.evaluate(
      (folder) => window.electronAPI!.devserver.restart(folder),
      folders[0],
    );
    expect(await (await fetch(next)).text()).toContain('Astro Alpha');
    expect(await (await fetch(urls[1])).text()).toContain('Astro Beta');
    await page.evaluate((folder) => window.electronAPI!.devserver.stop(folder), folders[0]);
    await expect(fetch(next)).rejects.toThrow();
    expect(await (await fetch(urls[1])).text()).toContain('Astro Beta');
    expect(await (await fetch(`http://127.0.0.1:${preferred}`)).text()).toBe('unrelated listener');
  } finally {
    await app.close();
    await new Promise<void>((r) => occupied.close(() => r()));
  }
});
