const { chromium } = await import(
  new URL('../../electron/node_modules/playwright/index.mjs', import.meta.url)
);
import { preview } from 'vite';
import assert from 'node:assert/strict';
const server = await preview({ preview: { host: '127.0.0.1', port: 4179, strictPort: true } });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
const errors = [];
const consoleErrors = [];
const failedRequests = [];
const externalRequests = [];
page.on('requestfailed', (request) => failedRequests.push(request.url()));
page.on('request', (request) => {
  if (!request.url().startsWith('http://127.0.0.1:4179') && !/^(data|blob):/.test(request.url()))
    externalRequests.push(request.url());
});
page.on('pageerror', (error) => {
  errors.push(error.message);
  console.log('PAGE ERROR', error.message);
});
page.on('console', (message) => {
  if (message.type() === 'error') {
    consoleErrors.push(message.text());
    console.log('CONSOLE', message.text());
  }
});
try {
  await page.goto('http://127.0.0.1:4179');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByPlaceholder('Name', { exact: true }).fill('Launch a creative project');
  await page.getByRole('button', { name: 'Create board', exact: true }).click();
  await page.getByRole('button', { name: 'New list', exact: true }).waitFor();
  for (const name of ['Ideas', 'Making', 'Ready']) {
    await page.getByRole('button', { name: 'New list', exact: true }).click();
    await page.getByPlaceholder('List name').fill(name);
    await page.getByRole('button', { name: 'Create list', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'List name', exact: true })
      .filter({ visible: true })
      .last()
      .waitFor();
  }
  await page.getByRole('button', { name: 'Add card', exact: true }).first().click();
  await page.getByPlaceholder('Card title').fill('Make a launch video');
  await page.getByRole('button', { name: 'Create card', exact: true }).click();
  await page.getByText('Make a launch video', { exact: true }).click();
  await page.getByLabel('Current list', { exact: true }).click();
  await page.getByText('Making', { exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByLabel('Current list', { exact: true }).filter({ hasText: 'Making' }).waitFor();
  await page.getByLabel('Labels', { exact: true }).click();
  await page.getByText('Create new label', { exact: true }).click();
  await page.getByPlaceholder('Name', { exact: true }).fill('Launch');
  await page.getByRole('button', { name: 'Create label', exact: true }).click();
  await page.getByLabel('Labels', { exact: true }).filter({ hasText: 'Launch' }).waitFor();
  await page.getByRole('button', { name: 'Set due date', exact: true }).click();
  await page.locator('button:has(time)').filter({ hasText: '15' }).click();
  await page.locator('aside .fixed.inset-0.z-10').click({ position: { x: 100, y: 150 } });
  console.log('STEP label/date set');
  await page.getByRole('button', { name: 'Add checklist', exact: true }).click();
  await page.getByPlaceholder('Checklist name').fill('Release checks');
  await page.getByRole('button', { name: 'Create checklist', exact: true }).click();
  await page.locator('[role=dialog]').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Add checklist item', exact: true }).click();
  const item = page.locator('[contenteditable=true][placeholder="Add an item..."]');
  await item.click();
  await item.fill('Verify the soundtrack');
  await item.press('Enter');
  await page.getByText('Verify the soundtrack', { exact: true }).first().waitFor();
  await page.locator('input[type=checkbox]:not([disabled])').first().check();
  await page
    .locator('[contenteditable=true]')
    .filter({ has: page.locator('p[data-placeholder^="Add comment"]') })
    .fill('Ready for the creative demo');
  await page.getByRole('button', { name: 'Submit comment', exact: true }).click();
  await page.getByText('Ready for the creative demo', { exact: true }).waitFor();
  await page.waitForTimeout(500);
  console.log('CARD', await page.locator('body').innerText());
  await page.screenshot({ path: '/private/tmp/crux-kan-card-proof.png' });
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(failedRequests, []);
  assert.deepEqual(externalRequests, []);
  console.log(
    'PASSED native board/list/card creation, movement, labels, due date, checklist completion and comment',
  );
} catch (error) {
  console.log('BODY', await page.locator('body').innerText());
  await page.screenshot({ path: '/private/tmp/crux-kan-proof-failure.png' });
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
