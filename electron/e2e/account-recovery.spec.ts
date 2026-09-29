import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { fileText } from './content-helpers';
import { startMockApi } from './api-mock';
import { enterGarden } from './multi-crux-helpers';
import { connectAccount } from './journeys/journey-helpers';
import { showPane, openPanel } from './panel-helpers';

test('recovery reads all account pages, reports a refused page and retries using the published author', async () => {
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
  ];
  api.state.failCruxPage = 2;
  const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
  try {
    await enterGarden(page);
    await showPane(page, 'Settings');
    const account = page.getByTestId('account-settings');
    if (!(await account.getByPlaceholder('email@example.com').isVisible()))
      await page.locator('h2', { hasText: /^Account$/ }).click();
    await connectAccount(page, account);
    await expect(account.getByText(/Connected —/)).toContainText('tester@example.com');
    const section = page.getByTestId('recover-section');
    await expect(section.getByRole('alert')).toContainText('Could not check');
    await expect(section.getByRole('button', { name: 'Recover', exact: true })).toHaveCount(0);
    api.state.failCruxPage = undefined;
    await section.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(section).toContainText('1 crux');
    await section.getByRole('button', { name: 'Recover', exact: true }).click();
    await expect(section).toHaveCount(0);
    expect(api.log).toContain(`GET /authors/${authorId}/cruxes/far-away/artifacts -> 200`);
    expect(api.log).toContain(
      `GET /authors/${authorId}/cruxes/far-away/artifacts/art-0/download -> 200`,
    );
    await page.getByRole('button', { name: 'Open Far away', exact: true }).click();
    await openPanel(page, 'artifacts', 'Toggle artifacts');
    await page.getByRole('tree').getByText('index.html', { exact: true }).click();
    await expect
      .poll(() => fileText(page, id, 'index.html'))
      .toBe('<h1>Recovered from another machine</h1>');
    await expect(page.locator('.monaco-editor').first()).toContainText(
      'Recovered from another machine',
    );
  } finally {
    await app.close();
    await api.close();
  }
});
