import { test, expect, type Page } from '@playwright/test';
import { launchApp } from './launch';
import { startMockApi, type MockApi } from './api-mock';
import { enterGarden, createCrux } from './multi-crux-helpers';
import { openPanel, showPane } from './panel-helpers';
import { writeFirstFile, connectAccount } from './journeys/journey-helpers';

/**
 * Customer review — sharing (ROADMAP § "Customer review — subscription, usage
 * monitoring and sharing", CR06–CR08 and "Expected at v1").
 *
 * Fixtures: the shared mock API (`api-mock.ts`) as is — its profile is an
 * `author`, its Explore lists only what this run published, and it has no
 * `/admin/*` routes. The scripted model (CRUX_AI_MOCK=1) writes the
 * conversation. The Add Crux case needs a build where some tools are not
 * bundled (`CRUX_BUNDLE_TOOLS=bundled`); it skips itself otherwise.
 */
test.setTimeout(180_000);

/** Route the in-app router without reloading the shell. */
async function visit(page: Page, path: string) {
  await page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

/** One scripted Collaboration turn: a person message and the collaborator's reply. */
async function talk(page: Page, text: string) {
  const input = page.getByPlaceholder('Send a message...');
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill(text);
  await input.press('Enter');
  await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: /Stop/ })).toHaveCount(0, { timeout: 60_000 });
}

async function firstShare(page: Page, share: ReturnType<Page['getByTestId']>) {
  await share.getByRole('button', { name: 'Share', exact: true }).click();
  await connectAccount(page);
  await page
    .getByRole('dialog')
    .filter({ hasText: 'A published site is not a backup' })
    .getByRole('button', { name: 'Share without a backup' })
    .click();
  await expect(share).toContainText('Up to date', { timeout: 30_000 });
}

const sentMeta = (api: MockApi, id: string) =>
  (api.state.cruxes[id]?.meta ?? {}) as Record<string, unknown>;

test('a first share keeps the conversation private; a left-out message never leaves', async () => {
  const api = await startMockApi();
  const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url, CRUX_AI_MOCK: '1' } });
  try {
    await enterGarden(page);
    const id = await createCrux(page, 'Private making-of');
    await writeFirstFile(page, 'index.html', '<h1>Hello</h1>');
    await talk(page, 'My phone number is 555-0100, please add a footer');
    await talk(page, 'Thanks, that looks right');

    const share = await openPanel(page, 'publish', 'Toggle share');
    const include = share.getByRole('switch', { name: 'Include the conversation', exact: true });
    await expect(include).not.toBeChecked();
    await expect(share.getByTestId('conversation-share')).toContainText(
      'The creator kept the conversation private.',
    );

    // Preview as a visitor, before the first share: nothing is uploaded.
    await share.getByRole('button', { name: 'Preview as a visitor', exact: true }).click();
    const preview = page.getByTestId('visitor-preview');
    await expect(preview).toBeVisible();
    await expect(preview.getByTestId('public-conversation-private')).toBeVisible();
    expect(api.state.cruxes[id]).toBeUndefined();
    await page.keyboard.press('Escape');

    await firstShare(page, share);
    expect(sentMeta(api, id).conversationPublished).toBe(false);
    expect(sentMeta(api, id)).not.toHaveProperty('messages');

    // Include it, leave the first message out, and update.
    await include.click();
    await expect(include).toBeChecked();
    const first = page.locator('[data-role="user"]').first();
    await first.hover();
    await first.getByRole('button', { name: 'Leave out of shared conversation' }).click();
    await expect(first.getByTestId('message-excluded-marker')).toBeVisible();
    await expect(
      first.getByRole('button', { name: 'Include in shared conversation' }),
    ).toBeVisible();

    await share.getByRole('button', { name: 'Preview as a visitor', exact: true }).click();
    await expect(preview.getByTestId('public-conversation')).toBeVisible();
    await expect(preview).not.toContainText('555-0100');
    await page.keyboard.press('Escape');

    await share.getByRole('button', { name: 'Update', exact: true }).click();
    // Still no backup: the same honest prompt as the first share.
    await page
      .getByRole('dialog')
      .filter({ hasText: 'A published site is not a backup' })
      .getByRole('button', { name: 'Share without a backup' })
      .click();
    await expect(share).toContainText('Up to date', { timeout: 30_000 });
    const meta = sentMeta(api, id);
    expect(meta.conversationPublished).toBe(true);
    const messages = meta.messages as { content: string }[];
    expect(messages.length).toBeGreaterThan(0);
    expect(JSON.stringify(messages)).not.toContain('555-0100');
    expect(JSON.stringify(messages)).toContain('Thanks, that looks right');
    expect(meta).not.toHaveProperty('conversationExclusions');
  } finally {
    await app.close();
    await api.close();
  }
});

test('Add Crux does not send an uninstalled tool to an empty Explore', async () => {
  const api = await startMockApi();
  const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
  try {
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    const more = page.getByRole('checkbox', { name: /Include tools to install/ });
    test.skip(!(await more.count()), 'every tool is bundled in this build');
    await more.check();
    const row = page.locator('[data-template-id]').filter({ hasText: 'coming soon' }).first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.click();
    await expect(page.getByTestId('tool-not-bundled')).toContainText('coming soon');
    await expect(page.getByTestId('tool-not-bundled')).not.toContainText('Explore');
    await expect(
      page.getByRole('button', { name: 'Install from Explore', exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Explore → Tools says so honestly.
    const explore = await showPane(page, 'Explore');
    await explore.getByRole('tab', { name: 'Tools', exact: true }).click();
    await expect(page.getByTestId('explore-empty-tools')).toContainText('No community Tools yet');
  } finally {
    await app.close();
    await api.close();
  }
});

test('a Mood can be shared by link only', async () => {
  const api = await startMockApi();
  const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
  try {
    await enterGarden(page);
    await createCrux(page, 'Account holder');
    await writeFirstFile(page, 'index.html', '<h1>Hi</h1>');
    const share = await openPanel(page, 'publish', 'Toggle share');
    await firstShare(page, share);

    await showPane(page, 'Mood');
    await page.getByRole('button', { name: 'Save current as Mood' }).click();
    await page.getByRole('textbox', { name: 'Mood name' }).fill('Back Room');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Share Back Room' }).click();
    const ask = page.getByRole('dialog').filter({ hasText: 'Discoverable' });
    const listed = ask.getByRole('checkbox', { name: /Discoverable/ });
    await expect(listed).toBeChecked();
    await listed.uncheck();
    await ask.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'by link only' })).toBeVisible({
      timeout: 60_000,
    });
    const mood = Object.values(api.state.cruxes).find((c) => c.kind === 'mood');
    expect(mood?.discoverable).toBe(false);

    // Not listed in Explore → Moods.
    const explore = await showPane(page, 'Explore');
    await explore.getByRole('tab', { name: 'Moods', exact: true }).click();
    await expect(page.getByTestId(`explore-mood-${mood!.id as string}`)).toHaveCount(0);
  } finally {
    await app.close();
    await api.close();
  }
});

test('the operator screen refuses anyone who is not an admin', async () => {
  const api = await startMockApi();
  const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
  try {
    await enterGarden(page);
    const home = new URL(page.url());
    // Signed out.
    await visit(page, '/operator');
    await expect(page.getByTestId('operator-not-available')).toBeVisible({ timeout: 30_000 });

    // Signed in as an author: still refused, and no moderation data is asked for.
    await visit(page, home.pathname + home.search);
    await createCrux(page, 'Author account');
    await writeFirstFile(page, 'index.html', '<h1>Hi</h1>');
    const share = await openPanel(page, 'publish', 'Toggle share');
    await firstShare(page, share);
    const adminRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/admin/')) adminRequests.push(request.url());
    });
    await visit(page, '/operator');
    await expect(page.getByTestId('operator-not-available')).toBeVisible({ timeout: 30_000 });
    expect(adminRequests).toEqual([]);
  } finally {
    await app.close();
    await api.close();
  }
});

test('an operator resolves a report and suspends then restores an account', async () => {
  const api = await startMockApi();
  api.state.accountRole = 'admin';
  api.state.adminReports = [
    { id: 'report-1', cruxId: 'crux-reported', reason: 'spam', status: 'open' },
  ];
  const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
  try {
    await enterGarden(page);
    await createCrux(page, 'Operator account');
    await writeFirstFile(page, 'index.html', '<h1>Hi</h1>');
    const share = await openPanel(page, 'publish', 'Toggle share');
    await firstShare(page, share);

    await visit(page, '/operator');
    const summary = page.getByTestId('operator-summary');
    await expect(summary).toBeVisible({ timeout: 30_000 });
    await expect(summary).toContainText('1');
    const report = page.getByTestId('operator-report-report-1');
    await expect(report).toContainText('spam');
    await report.getByRole('button', { name: 'Resolve' }).click();
    await expect(report).toHaveCount(0, { timeout: 15_000 });
    expect(api.state.adminReports?.[0].status).toBe('resolved');

    await page.getByLabel('Email or username').fill('other');
    await page.getByRole('button', { name: 'Search' }).click();
    const account = page.getByTestId('operator-account-acct-2');
    await account.getByLabel('Reason').fill('Spam campaign');
    await account.getByRole('button', { name: 'Suspend' }).click();
    await expect(account).toContainText('Spam campaign');
    expect(api.state.suspended?.['acct-2']).toBe('Spam campaign');
    await account.getByRole('button', { name: 'Unsuspend' }).click();
    await expect(account.getByRole('button', { name: 'Suspend' })).toBeVisible();
    expect(api.state.suspended?.['acct-2']).toBeUndefined();
  } finally {
    await app.close();
    await api.close();
  }
});
