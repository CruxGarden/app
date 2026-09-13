import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden, createCrux, storedCrux, switchCrux } from './multi-crux-helpers';

/**
 * Guestbook (V1-GAPS-PLAN.md §2.8): a block a site Crux carries; visitors of the
 * shared site sign in by email and leave a note, kept in the Crux's own Crux Store
 * under the public key `guestbook`. Added from the Share pane or by the scripted
 * collaborator (add_guestbook). In the Workshop preview the block reaches the
 * author's local store through the host frame; on the shared site it reaches the
 * API with the visitor's sign-in.
 */
const frameOf = (page: Page) => page.frameLocator('iframe[data-crux-id]');
const PAGE =
  '<!doctype html><html><head><title>Garden diary</title></head><body style="font:18px sans-serif;padding:32px"><h1>Garden diary</h1><p>What grew this year.</p></body></html>';

async function reloadPreview(page: Page) {
  await page
    .locator('iframe[data-crux-id]')
    .evaluate((el: HTMLIFrameElement) => (el.src = el.src.split('#')[0]!));
}

async function storeRows(page: Page, cruxId: string) {
  return page.evaluate(
    async (id) =>
      window.electronAPI!.sqlite.all(
        "SELECT key, value, mode FROM store WHERE crux_id = ? AND key = 'guestbook'",
        [id],
      ),
    cruxId,
  ) as Promise<{ key: string; value: string; mode: string }[]>;
}

test('Guestbook: added from the Share pane, signed in the preview, added by the collaborator, signed on the shared site', async () => {
  test.setTimeout(300000);
  const api = await startMockApi();
  const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url, CRUX_AI_MOCK: '1' } });
  const evidence = resolve(__dirname, '../../docs/guestbook');
  try {
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);
    const id = await createCrux(page, 'Garden diary');
    const folder = (await storedCrux(page, id)).projectFolder as string;
    writeFileSync(join(folder, 'index.html'), PAGE);
    await expect(frameOf(page).getByRole('heading', { name: 'Garden diary' })).toBeVisible();

    await test.step('Share pane: Add a guestbook writes the script and the block into index.html', async () => {
      await page.getByRole('button', { name: 'Toggle share', exact: true }).click();
      const share = page.getByTestId('pane-body-publish');
      await share.getByRole('button', { name: 'Add a guestbook', exact: true }).click();
      await expect(share.getByRole('status')).toHaveText('Added to index.html.');
      await expect(share.getByText('On index.html')).toBeVisible();
      await expect.poll(() => existsSync(join(folder, 'guestbook.js'))).toBe(true);
      await expect
        .poll(() => readFileSync(join(folder, 'index.html'), 'utf8'))
        .toMatch(
          /<section data-guestbook><\/section>\n<script src="guestbook.js" defer><\/script>\n<\/body>/,
        );
    });

    await test.step('the preview shows the block; a note signed there lands in the local Crux Store', async () => {
      await reloadPreview(page);
      const book = frameOf(page).getByRole('region', { name: 'Guestbook' });
      await expect(book.getByRole('heading', { name: 'Guestbook' })).toBeVisible();
      await expect(book.getByText('No one has signed yet.')).toBeVisible();
      await book.getByLabel('Name').fill('Ana');
      await book.getByLabel('Message').fill('Lovely garden, thank you.');
      await book.getByRole('button', { name: 'Sign the guestbook' }).click();
      await expect(book.getByRole('status')).toHaveText('Thank you, Ana.');
      await expect(
        book.getByRole('list', { name: 'Guestbook entries' }).getByRole('listitem'),
      ).toHaveCount(1);
      await expect(book.getByRole('listitem').first()).toContainText('Ana');
      await expect(book.getByRole('listitem').first()).toContainText('Lovely garden, thank you.');
      await expect.poll(async () => (await storeRows(page, id)).length).toBe(1);
      const row = (await storeRows(page, id))[0]!;
      expect(row.mode).toBe('public');
      expect(JSON.parse(row.value).entries).toMatchObject([
        { name: 'Ana', message: 'Lovely garden, thank you.' },
      ]);
      // A reload reads the book back.
      await reloadPreview(page);
      await expect(
        frameOf(page).getByRole('region', { name: 'Guestbook' }).getByRole('listitem'),
      ).toHaveCount(1);
      await page.screenshot({ path: join(evidence, 'guestbook-preview.png') });
    });

    await test.step('the Store pane lists the book; the Share pane knows the block is there', async () => {
      await page.getByRole('button', { name: 'Toggle store', exact: true }).click();
      await expect(
        page.getByTestId('pane-body-store').getByText('guestbook', { exact: true }),
      ).toBeVisible();
      await page.screenshot({ path: join(evidence, 'guestbook-store.png') });
      await page.getByRole('button', { name: 'Toggle store', exact: true }).click();
    });

    await test.step('the scripted collaborator adds a guestbook to another site', async () => {
      const second = await createCrux(page, 'Seed notes');
      const secondFolder = (await storedCrux(page, second)).projectFolder as string;
      writeFileSync(join(secondFolder, 'index.html'), PAGE.replace(/Garden diary/g, 'Seed notes'));
      await expect(frameOf(page).getByRole('heading', { name: 'Seed notes' })).toBeVisible();
      const collab = page.getByRole('button', { name: 'Toggle collaboration' });
      if ((await collab.getAttribute('aria-pressed')) !== 'true') await collab.click();
      const box = page.getByPlaceholder('Send a message...');
      await box.fill('Let visitors say hello [site:guestbook]');
      await box.press('Enter');
      await expect(
        page.getByText(
          'Added a guestbook at the end of the home page; entries will show in the Store pane.',
          { exact: true },
        ),
      ).toBeVisible({ timeout: 240000 });
      await expect.poll(() => existsSync(join(secondFolder, 'guestbook.js'))).toBe(true);
      await expect
        .poll(() => readFileSync(join(secondFolder, 'index.html'), 'utf8'))
        .toContain('data-guestbook');
      await page.screenshot({ path: join(evidence, 'guestbook-agent.png') });
      await collab.click();
      await switchCrux(page, 'Garden diary');
    });

    await test.step('the shared site carries the block; a visitor signs in by email and signs it through the API', async () => {
      const share = page.getByTestId('pane-body-publish');
      if (!(await share.isVisible()))
        await page.getByRole('button', { name: 'Toggle share', exact: true }).click();
      await share.getByRole('button', { name: 'Share', exact: true }).click();
      await page.getByPlaceholder('email@example.com').fill('tester@example.com');
      await page.getByRole('button', { name: 'Send Code', exact: true }).click();
      await page.getByPlaceholder('Enter code').fill('123456');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      const backupAsk = page
        .getByRole('dialog')
        .filter({ hasText: 'A published site is not a backup' });
      await expect(backupAsk).toBeVisible({ timeout: 60000 });
      await backupAsk.getByRole('button', { name: 'Share without a backup', exact: true }).click();
      await expect(share.getByText(/^(Up to date|Changes to share)$/)).toBeVisible({
        timeout: 6 * 60_000,
      });
      const published = api.state.published[id] ?? [];
      expect(published.map((f) => f.path)).toEqual(
        expect.arrayContaining(['index.html', 'guestbook.js']),
      );
      expect(published.find((f) => f.path === 'index.html')!.bytes.toString('utf8')).toContain(
        'data-guestbook',
      );

      // The mock API serves the shared site back with the publish injection stood in for; the
      // Workshop frame shows it as a visitor's browser would.
      await page
        .locator('iframe[data-crux-id]')
        .evaluate(
          (el: HTMLIFrameElement, url) => (el.src = url),
          `${api.url}/published/${id}/index.html`,
        );
      const site = frameOf(page).getByRole('region', { name: 'Guestbook' });
      await expect(site.getByText('Sign in with your email to sign the guestbook.')).toBeVisible();
      await expect(site.getByText('No one has signed yet.')).toBeVisible();
      await site.getByLabel('Email').fill('visitor@example.com');
      await site.getByRole('button', { name: 'Send code' }).click();
      await expect(site.getByRole('status')).toHaveText('Check your email for the code.');
      await site.getByLabel('Code').fill('123456');
      await site.getByRole('button', { name: 'Sign in' }).click();
      await expect(site.getByLabel('Name')).toHaveValue('tester');
      await site.getByLabel('Message').fill('Hello from afar.');
      await site.getByRole('button', { name: 'Sign the guestbook' }).click();
      await expect(site.getByRole('status')).toHaveText('Thank you, tester.');
      await expect(site.getByRole('listitem')).toHaveCount(1);
      const live = (api.state.store ?? []).find((e) => e.key === 'guestbook');
      expect(live?.mode).toBe('public');
      expect((live?.value as { entries: unknown[] }).entries).toMatchObject([
        { name: 'tester', message: 'Hello from afar.' },
      ]);
      // The note is there for the next visitor.
      await reloadPreview(page);
      await expect(
        frameOf(page).getByRole('region', { name: 'Guestbook' }).getByRole('listitem'),
      ).toHaveCount(1);
      await expect(
        frameOf(page).getByRole('region', { name: 'Guestbook' }).getByRole('listitem').first(),
      ).toContainText('Hello from afar.');
      await page.screenshot({ path: join(evidence, 'guestbook-published.png') });
    });
  } finally {
    await app.close();
    await api.close();
  }
});
