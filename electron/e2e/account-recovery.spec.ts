import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { fileText } from './content-helpers';
import { startMockApi } from './api-mock';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { connectAccount } from './journeys/journey-helpers';
import { showPane, openPanel } from './panel-helpers';

test('account recovery reads all pages and survives download/admission failure, restart and retry', async () => {
  test.setTimeout(180_000);
  const api = await startMockApi();
  const authorId = randomUUID();
  // Unpublished rows still consume pages. The only recovery candidate is on page two.
  for (let i = 0; i < 104; i++) {
    const id = randomUUID();
    api.state.cruxes[id] = { id, authorId, slug: `draft-${i}`, title: `Draft ${i}`, meta: {} };
  }
  const id = randomUUID();
  api.state.cruxes[id] = {
    id,
    authorId,
    slug: 'far-away',
    title: 'Far away',
    type: 'workspace',
    kind: 'webapp',
    visibility: 'public',
    meta: { publishedAt: '2026-09-29T00:00:00Z', publishedVersion: 1 },
  };
  api.state.published[id] = [
    {
      path: 'index.html',
      mime: 'text/html',
      bytes: Buffer.from('<h1>Recovered from another machine</h1>'),
    },
    { path: 'style.css', mime: 'text/css', bytes: Buffer.from('h1 { color: green; }') },
  ];
  api.state.failCruxPage = 2;
  const first = await launchApp({ env: { CRUX_API_URL: api.url } });
  let { app, page } = first;
  try {
    await enterGarden(page);
    await showPane(page, 'Settings');
    const account = page.getByTestId('account-settings');
    if (!(await account.getByPlaceholder('email@example.com').isVisible()))
      await page.locator('h2', { hasText: /^Account$/ }).click();
    await connectAccount(page, account);
    await expect(account.getByText(/Connected —/)).toContainText('tester@example.com');
    let section = page.getByTestId('recover-section');
    await expect(section.getByRole('alert')).toContainText('Could not check');
    await expect(section.getByRole('button', { name: 'Recover', exact: true })).toHaveCount(0);
    api.state.failCruxPage = undefined;
    await section.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(section).toContainText('1 crux');
    const localRows = () =>
      page.evaluate(
        (cruxId) => window.electronAPI!.sqlite.all('SELECT id FROM cruxes WHERE id = ?', [cruxId]),
        id,
      );
    api.state.failPublishedDownloadPath = 'style.css';
    await section.getByRole('button', { name: 'Recover', exact: true }).click();
    await expect(section.getByRole('alert')).toContainText('Download failed (503)');
    expect(await localRows()).toEqual([]);
    api.state.failPublishedDownloadPath = undefined;
    await page.evaluate(() =>
      window.electronAPI!.sqlite.run(
        "CREATE TRIGGER refuse_recovery BEFORE INSERT ON file_content_heads BEGIN SELECT RAISE(ABORT, 'Initial recovery save refused'); END",
      ),
    );
    await section.getByRole('button', { name: 'Recover', exact: true }).click();
    await expect(section.getByRole('alert')).toContainText('Initial recovery save refused');
    expect(await localRows()).toEqual([]);
    await page.evaluate(() => window.electronAPI!.sqlite.run('DROP TRIGGER refuse_recovery'));

    // Staged bytes and an interrupted attempt must not hide recovery after restart.
    await app.close();
    ({ app, page } = await launchApp({ dir: first.dir, env: { CRUX_API_URL: api.url } }));
    await page.getByRole('button', { name: /enter/i }).click();
    section = page.getByTestId('recover-section');
    await expect(section).toContainText('1 crux');
    await section.getByRole('button', { name: 'Recover', exact: true }).click();
    await expect(section).toHaveCount(0);
    expect(api.log).toContain(`GET /authors/${authorId}/cruxes/far-away/artifacts -> 200`);
    expect(api.log).toContain(
      `GET /authors/${authorId}/cruxes/far-away/artifacts/art-0/download -> 200`,
    );
    await page.getByRole('button', { name: 'Open Far away', exact: true }).click();
    await openPanel(page, 'artifacts', 'Toggle artifacts');
    await expect(page.getByRole('tree').getByText('style.css', { exact: true })).toBeVisible();
    expect(await fileText(page, id, 'style.css')).toBe('h1 { color: green; }');
    await page.getByRole('tree').getByText('index.html', { exact: true }).click();
    await expect
      .poll(() => fileText(page, id, 'index.html'))
      .toBe('<h1>Recovered from another machine</h1>');
    const folder = (await storedCrux(page, id)).projectFolder as string;
    expect(readFileSync(join(folder, 'index.html'), 'utf8')).toBe(
      '<h1>Recovered from another machine</h1>',
    );
    expect(readFileSync(join(folder, 'style.css'), 'utf8')).toBe('h1 { color: green; }');
    await expect(page.locator('.monaco-editor').first()).toContainText(
      'Recovered from another machine',
    );
  } finally {
    await app.close();
    await api.close();
  }
});
