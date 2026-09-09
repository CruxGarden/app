import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';

/**
 * RESILIENCE-PLAN §2c: cruxes the account has and this machine does not.
 * A synced crux comes back whole (Restore); a published-only crux is rebuilt
 * from what its site serves (Recover); an orphaned site can be unshared.
 */
test.describe('recover (mocked API)', () => {
  test.setTimeout(180_000);

  test('delete a backed-up crux locally, keep the site → Restore brings it back with its file', async () => {
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await page.getByRole('button', { name: 'New file' }).click({ timeout: 30_000 });
      const nameInput = page.getByRole('tree').getByRole('textbox');
      await nameInput.fill('index.html');
      await nameInput.press('Enter');
      const monaco = page.locator('.monaco-editor').first();
      await expect(monaco).toBeVisible({ timeout: 30_000 });
      await monaco.click();
      await page.keyboard.type('<h1>Keep me</h1>');
      await page.keyboard.press('ControlOrMeta+s');

      // Share, backing up first
      await page.getByRole('button', { name: 'Toggle share' }).click();
      await page.getByRole('button', { name: 'Share', exact: true }).click();
      await page.getByPlaceholder('email@example.com').fill('tester@example.com');
      await page.getByRole('button', { name: 'Send Code' }).click();
      await page.getByPlaceholder('Enter code').fill('123456');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      const ask = page.getByRole('dialog').filter({ hasText: 'A published site is not a backup' });
      await expect(ask).toBeVisible({ timeout: 30_000 });
      await ask.getByRole('button', { name: 'Back up and share' }).click();
      await expect(page.getByText('Up to date')).toBeVisible({ timeout: 30_000 });
      const cruxId = Object.keys(api.state.published)[0]!;
      await expect.poll(() => !!api.state.sync.cruxes[cruxId], { timeout: 30_000 }).toBe(true);

      // Close the workspace (ADR 0018: an open workspace cannot be deleted), then
      // from the garden: card menu → Delete, keeping the published site up
      await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
      await page
        .getByRole('button', { name: /^Close .* workspace$/ })
        .first()
        .click();
      const closeDlg = page.getByRole('dialog', { name: 'Close workspace' });
      if (await closeDlg.isVisible().catch(() => false))
        await page.getByRole('button', { name: 'Save and close', exact: true }).click();
      await expect(page.getByText('Home Garden', { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('recover-section')).toHaveCount(0);
      await page.getByRole('button', { name: 'Crux actions' }).first().click();
      await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Delete Crux' })).toBeVisible();
      await page.getByRole('checkbox', { name: /Also take it offline/ }).uncheck(); // keep the site
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(page.getByTestId('recover-section')).toBeVisible({ timeout: 30_000 });
      expect(api.state.published[cruxId]).toBeTruthy(); // still published
      const row = page.getByTestId('recover-section').locator('li').first();
      await expect(row).toContainText('Backup');
      await expect(row).toContainText('published');

      // Restore: the crux is back with its file and the section empties
      await row.getByRole('button', { name: 'Restore' }).click();
      await expect(page.getByTestId('recover-section')).toHaveCount(0, { timeout: 30_000 });
      await page.getByRole('button', { name: 'Open My Crux' }).click();
      const tree = page.getByRole('tree');
      await expect(page.getByRole('button', { name: 'Toggle artifacts' })).toBeVisible({
        timeout: 30_000,
      });
      if (!(await tree.isVisible().catch(() => false)))
        await page.getByRole('button', { name: 'Toggle artifacts' }).click();
      await expect(tree.getByText('index.html')).toBeVisible({ timeout: 30_000 });
      // the archive was taken after the publish: the Share pane knows it is live
      const sharePane = page.getByTestId('pane-body-publish');
      if (!(await sharePane.isVisible().catch(() => false)))
        await page.getByRole('button', { name: 'Toggle share' }).click();
      await expect(sharePane.getByText('Shared', { exact: true })).toBeVisible({ timeout: 15_000 });
      expect(api.log.some((l) => l.startsWith('GET /sync/crux/'))).toBe(true);
    } finally {
      await app.close();
    }
  });

  test('a published-only crux in the account → Recover rebuilds it from the site; Unshare takes one down', async () => {
    const api = await startMockApi();
    // Seed the account with a crux that was published from another machine
    const id = '7d1f8e2a-5b3c-4e6f-9a1b-2c3d4e5f6a7b';
    api.state.cruxes[id] = {
      id,
      slug: 'from-elsewhere',
      title: 'From elsewhere',
      type: 'workspace',
      authorId: 'author-1',
      visibility: 'public',
      meta: {
        publishedAt: '2026-09-01T00:00:00.000Z',
        publishedVersion: 3,
        messages: [
          { role: 'user', content: 'make me a page', timestamp: '2026-09-01T00:00:00.000Z' },
          {
            role: 'assistant',
            content: 'Here is your page.',
            timestamp: '2026-09-01T00:00:01.000Z',
          },
        ],
      },
      created: '2026-09-01T00:00:00.000Z',
      updated: '2026-09-01T00:00:00.000Z',
    };
    api.state.published[id] = [
      {
        path: 'index.html',
        mime: 'text/html',
        bytes: Buffer.from('<h1>From elsewhere</h1>'),
      },
      {
        path: 'style.css',
        mime: 'text/css',
        bytes: Buffer.from('h1{color:green}'),
      },
    ];
    const other = 'a1b2c3d4-0000-4000-8000-000000000002';
    api.state.cruxes[other] = {
      id: other,
      slug: 'orphan-site',
      title: 'Orphan site',
      type: 'workspace',
      authorId: 'author-1',
      visibility: 'public',
      meta: { publishedAt: '2026-09-02T00:00:00.000Z', publishedVersion: 1, messages: [] },
      created: '2026-09-02T00:00:00.000Z',
      updated: '2026-09-02T00:00:00.000Z',
    };
    api.state.published[other] = [
      {
        path: 'index.html',
        mime: 'text/html',
        bytes: Buffer.from('<h1>Orphan</h1>'),
      },
    ];
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      // connect the account from Settings → Account (no crux to share yet)
      await page.getByRole('button', { name: 'Account menu' }).click();
      await page.getByRole('button', { name: /^Settings/ }).click();
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
      await page.getByPlaceholder('email@example.com').fill('tester@example.com');
      await page.getByRole('button', { name: 'Send Code' }).click();
      await page.getByPlaceholder('Enter code').fill('123456');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      await page.keyboard.press('Escape');

      const section = page.getByTestId('recover-section');
      await expect(section).toBeVisible({ timeout: 30_000 });
      await expect(section).toContainText('2 cruxes');
      const row = page.getByTestId('recover-from-elsewhere');
      await expect(row).toContainText('No backup · published');
      await row.getByRole('button', { name: 'Recover' }).click();
      await expect(row).toHaveCount(0, { timeout: 30_000 });

      // the recovered crux: same id, both files, the public conversation
      await page.getByRole('button', { name: 'Open From elsewhere' }).click();
      await expect(page.getByText('Here is your page.')).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: 'Toggle artifacts' }).click();
      const tree = page.getByRole('tree');
      await expect(tree.getByText('index.html')).toBeVisible({ timeout: 30_000 });
      await expect(tree.getByText('style.css')).toBeVisible();
      await expect(page.getByText('Here is your page.')).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/c/${id}`));

      // back home: Unshare the orphan
      await page.getByRole('banner').getByRole('button').first().click();
      const orphan = page.getByTestId('recover-orphan-site');
      await expect(orphan).toBeVisible({ timeout: 15_000 });
      await orphan.getByRole('button', { name: 'Unshare' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Unshare' }).click();
      await expect(page.getByTestId('recover-section')).toHaveCount(0, { timeout: 30_000 });
      expect(api.state.published[other]).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
