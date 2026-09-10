import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

async function task(page: Page, title: string) {
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  await page.getByRole('textbox', { name: 'Task name', exact: true }).fill(title);
  await page.getByLabel('Maximum simultaneous turns', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'Save and start task' }).click();
  await expect(page.getByRole('dialog', { name: 'New task', exact: true })).toHaveCount(0);
  const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
  const row = (await page.evaluate(
    async (id) =>
      window.electronAPI!.sqlite.get('SELECT project_folder FROM working_copies WHERE id = ?', [
        id,
      ]),
    id,
  )) as { project_folder: string };
  return { id, folder: row.project_folder };
}
async function tend(page: Page) {
  await page
    .locator('header')
    .getByRole('link', { name: /^Tending/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Tending', exact: true })).toBeFocused();
}
async function say(page: Page, text: string) {
  const input = page.getByPlaceholder('Send a message...');
  await input.fill(text);
  await input.press('Enter');
}
test('Tending groups two Cruxes and independent Tasks; answer, queue, stop and restart stay scoped', async () => {
  test.setTimeout(180000);
  let { app, page, dir } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  try {
    await enterGarden(page);
    const main = await createCrux(page, 'Launch website');
    const alpha = await task(page, 'Checkout');
    writeFileSync(join(alpha.folder, 'shared.txt'), 'Keep the checkout safe\n');
    await page.getByTestId('task-bar').getByRole('link', { name: 'Main', exact: true }).click();
    const beta = await task(page, 'Accessibility');
    const docs = await createCrux(page, 'Field notes');
    await say(page, '[workspace:Docs]');
    await tend(page);
    const row = (id: string) => page.getByTestId(`tending-row-${id}`);
    await expect(page.getByRole('region', { name: 'Launch website', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Field notes', exact: true })).toBeVisible();
    await expect(row(main).getByRole('heading', { name: 'Main', exact: true })).toBeVisible();
    await row(alpha.id).getByRole('button', { name: 'Open Checkout', exact: true }).click();
    await say(page, '[workspace:Alpha:delete]');
    await tend(page);
    await row(beta.id).getByRole('button', { name: 'Open Accessibility', exact: true }).click();
    await say(page, '[workspace:Beta]');
    await tend(page);
    await expect(row(alpha.id).getByText('Working', { exact: true })).toBeVisible();
    await expect(row(beta.id).getByText('Queued', { exact: true })).toBeVisible();
    await expect(row(alpha.id).getByText('Needs approval', { exact: true })).toBeVisible({
      timeout: 30000,
    });
    await expect(row(docs).getByText('Ready to review', { exact: true })).toBeVisible({
      timeout: 30000,
    });
    await expect(row(docs).getByText('Not checked', { exact: true })).toBeVisible();
    // Ready to review is observed only after the per-turn capture has settled.
    const captured = await page.evaluate(
      async (id) =>
        window.electronAPI!.sqlite.all(
          "SELECT id FROM dimensions WHERE source_id = ? AND type = 'growth'",
          [id],
        ),
      docs,
    );
    expect(captured.length).toBeGreaterThan(0);
    await expect(row(beta.id).getByText('Queued', { exact: true })).toBeVisible();
    expect(readFileSync(join(alpha.folder, 'shared.txt'), 'utf8')).toBe('Keep the checkout safe\n');
    await page.screenshot({ path: '/private/tmp/crux-tending.png', fullPage: true });
    // Reading the overview neither approves a decision nor acknowledges a result.
    await row(alpha.id).getByRole('button', { name: 'Answer Checkout', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute(
      'data-workspace-id',
      alpha.id,
    );
    await expect(page.locator('[data-tending-request]')).toBeFocused();
    await page.getByRole('button', { name: 'Keep', exact: true }).click();
    await tend(page);
    await expect(row(beta.id).getByText('Working', { exact: true })).toBeVisible();
    await row(beta.id).getByRole('button', { name: 'Stop Accessibility', exact: true }).click();
    await page.getByRole('button', { name: 'Stop task', exact: true }).click();
    await expect(row(beta.id).getByText('Interrupted', { exact: true })).toBeVisible();
    await row(docs).getByRole('button', { name: 'Review Main', exact: true }).click();
    await expect(page.getByText('Completed workspace Docs.', { exact: true })).toBeVisible();
    await tend(page);
    await expect(row(docs).getByText('Ready to review', { exact: true })).toHaveCount(0);
    expect(readFileSync(join(alpha.folder, 'shared.txt'), 'utf8')).toBe('Keep the checkout safe\n');
    // Denied OS permission is recoverable; no actual system notification is sent by this test.
    await page.evaluate(() => {
      Notification.requestPermission = async () => 'denied';
    });
    await page
      .getByRole('checkbox', { name: 'Desktop notifications when work needs tending' })
      .click();
    await expect(page.getByText(/Desktop notifications are unavailable/)).toBeVisible();
    await expect(page.getByRole('checkbox')).not.toBeChecked();
    await app.close();
    ({ app, page } = await launchApp({ dir, env: { CRUX_AI_MOCK: '1' } }));
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await tend(page);
    await expect(row(beta.id).getByText('Interrupted', { exact: true })).toBeVisible();
    await expect(row(beta.id).getByText('Closed workspace', { exact: false })).toBeVisible();
    await expect(row(docs).getByText('Ready to review', { exact: true })).toHaveCount(0);
    await expect(page.locator('[data-workspace-id]')).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('Tending routes Claude Code permissions and refuses a stale desktop notification', async () => {
  test.setTimeout(120000);
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1', CRUX_AGENT_MOCK: '1' } });
  try {
    await enterGarden(page);
    const id = await createCrux(page, 'Agent decisions');
    await page
      .getByTestId('pane-body-collaboration')
      .getByRole('button', { name: /Claude Sonnet 5/ })
      .click();
    await page
      .getByTestId('model-group-claude-code')
      .getByRole('button', { name: 'Claude Code' })
      .click();
    await tend(page);
    // A notification fixture exercises delivery/click routing without notifying the real desktop.
    await page.evaluate(() => {
      const notices: { body: string; onclick?: () => void }[] = [];
      Object.assign(window, { tendingNotices: notices });
      Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: class {
          static permission = 'granted';
          static async requestPermission() {
            return 'granted';
          }
          body: string;
          onclick?: () => void;
          constructor(_title: string, options: { body: string }) {
            this.body = options.body;
            notices.push(this);
          }
          close() {
            /* fixture */
          }
        },
      });
    });
    await page
      .getByRole('checkbox', { name: 'Desktop notifications when work needs tending' })
      .check();
    const row = page.getByTestId(`tending-row-${id}`);
    await row.getByRole('button', { name: 'Open Main', exact: true }).click();
    await say(page, 'run a private command');
    await expect(page.getByTestId('agent-approvals')).toBeVisible();
    await tend(page);
    await expect(row.getByText('Claude Code needs permission', { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { tendingNotices: unknown[] }).tendingNotices.length,
        ),
      )
      .toBe(1);
    const bodies = await page.evaluate(() =>
      (window as unknown as { tendingNotices: { body: string }[] }).tendingNotices.map(
        (n) => n.body,
      ),
    );
    expect(bodies).toEqual(['Claude Code needs permission']);
    await page.evaluate(() =>
      (
        window as unknown as { tendingNotices: { onclick: () => void }[] }
      ).tendingNotices[0]!.onclick(),
    );
    await expect(page.locator('[data-tending-request]')).toBeFocused();
    await page.getByTestId('agent-approvals').getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByText(/Skipped the command, as you asked/)).toBeVisible();
    await say(page, 'run another private command');
    await expect(page.getByTestId('agent-approvals')).toBeVisible();
    await page.evaluate(() =>
      (
        window as unknown as { tendingNotices: { onclick: () => void }[] }
      ).tendingNotices[0]!.onclick(),
    );
    await expect(page.getByRole('heading', { name: 'Tending', exact: true })).toBeVisible();
    await expect(row.getByText('Needs approval', { exact: true })).toBeVisible();
    await row.getByRole('button', { name: 'Answer Main', exact: true }).click();
    await expect(page.getByTestId('agent-approvals')).toBeVisible();
    await page.getByTestId('agent-approvals').getByRole('button', { name: 'Not now' }).click();
  } finally {
    await app.close();
  }
});
