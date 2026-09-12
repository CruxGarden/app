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
page.on('response', (response) => {
  if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`);
});
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
  const boardHash = await page.evaluate(() => location.hash);
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
  // --- Native controls added for the local adaptation ---
  // Comments: edit in place, then delete through the comment menu.
  await page.getByRole('button', { name: 'Comment options', exact: true }).click();
  await page.getByText('Edit comment', { exact: true }).click();
  const editing = page
    .locator('[contenteditable=true]')
    .filter({ hasText: 'Ready for the creative demo' });
  await editing.fill('Ready for the game demo');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Ready for the game demo', { exact: true }).waitFor();
  await page.getByText('(edited)').waitFor();
  await page.getByRole('button', { name: 'Comment options', exact: true }).click();
  await page.getByText('Delete comment', { exact: true }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByText('Ready for the game demo', { exact: true }).waitFor({ state: 'hidden' });
  console.log('STEP comment edited and deleted');
  // Checklist items: a second item is removed with the row's delete control.
  const addItem = page.getByRole('button', { name: 'Add checklist item', exact: true });
  if (await addItem.isVisible()) await addItem.click();
  const second = page.locator('[contenteditable=true][placeholder="Add an item..."]');
  await second.click();
  await second.fill('Remove me');
  await second.press('Enter');
  await page.getByText('Remove me', { exact: true }).first().waitFor();
  await page.keyboard.press('Escape');
  const row = page.locator('.group').filter({ hasText: 'Remove me' }).last();
  await row.hover();
  await row.locator('button').last().click({ force: true });
  // The activity log keeps the deleted title; the checklist row itself is gone.
  await page
    .locator('.group')
    .filter({ hasText: 'Remove me' })
    .filter({ has: page.locator('input[type=checkbox]') })
    .first()
    .waitFor({ state: 'hidden' });
  await page.getByText('deleted checklist item').waitFor();
  await page.getByText('Verify the soundtrack', { exact: true }).first().waitFor();
  console.log('STEP checklist item deleted');
  // Labels: rename, then delete; the card view follows the board label.
  await page.getByLabel('Labels', { exact: true }).click();
  const labelRow = page.locator('.group').filter({ has: page.locator('label', { hasText: 'Launch' }) }).last();
  await labelRow.hover();
  await labelRow.locator('button').click({ force: true });
  await page.getByText('Edit label', { exact: true }).waitFor();
  await page.getByPlaceholder('Name', { exact: true }).fill('Release');
  await page.getByRole('button', { name: 'Update label', exact: true }).click();
  await page.getByText('Edit label', { exact: true }).waitFor({ state: 'hidden' });
  await page.getByLabel('Labels', { exact: true }).filter({ hasText: 'Release' }).waitFor();
  await page.getByLabel('Labels', { exact: true }).click();
  const renamed = page.locator('.group').filter({ has: page.locator('label', { hasText: 'Release' }) }).last();
  await renamed.hover();
  await renamed.locator('button').click({ force: true });
  await page.getByText('Edit label', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByText('Are you sure you want to delete this label?').waitFor();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  // Wait for the outcome, not the dialog: the two stacked modals leave together.
  await page.getByLabel('Labels', { exact: true }).filter({ hasText: 'Release' }).waitFor({ state: 'hidden' });
  await page.getByText('Add label', { exact: true }).waitFor();
  console.log('STEP label renamed and deleted');
  // Duplicate from the card menu (immediate native copy), then from the board
  // context menu (native options modal); delete the copy from the board.
  await page.getByRole('button', { name: 'Card options', exact: true }).click();
  await page.getByText('Duplicate card', { exact: true }).click();
  await page.getByText('Card duplicated', { exact: true }).waitFor();
  await page.goto('http://127.0.0.1:4179/' + boardHash);
  await page.getByText('Make a launch video', { exact: true }).nth(1).waitFor();
  assert.equal(await page.getByText('Make a launch video', { exact: true }).count(), 2);
  await page.getByText('Make a launch video', { exact: true }).nth(1).click({ button: 'right' });
  await page.getByText('Duplicate card', { exact: true }).click();
  await page.getByText('Title (optional)', { exact: true }).waitFor();
  await page.getByText('Select a list', { exact: true }).click();
  await page.getByRole('option', { name: 'Ideas', exact: true }).click(); // the current list is disabled natively
  await page.getByPlaceholder('Make a launch video').fill('Make a launch video (copy)');
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await page.getByText('Make a launch video (copy)', { exact: true }).waitFor();
  await page.getByText('Make a launch video (copy)', { exact: true }).click({ button: 'right' });
  await page.getByText('Delete card', { exact: true }).click();
  await page.getByText('Are you sure you want to delete this card?').waitFor();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByText('Make a launch video (copy)', { exact: true }).waitFor({ state: 'hidden' });
  await page.getByText('Make a launch video', { exact: true }).nth(1).click({ button: 'right' });
  await page.getByText('Delete card', { exact: true }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByText('Make a launch video', { exact: true }).nth(1).waitFor({ state: 'hidden' });
  await page.getByText('Make a launch video', { exact: true }).waitFor();
  console.log('STEP card duplicated and copy deleted');
  // Due-date filters use the native ranges: the dated card disappears under "No dates".
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  // The native filter menu keeps a CSS transition on its items; click without the stability wait.
  await page.getByText('Due date', { exact: true }).click({ force: true });
  await page.getByText('No dates', { exact: true }).click({ force: true });
  await page.getByText('Make a launch video', { exact: true }).waitFor({ state: 'hidden' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByText('Clear filters', { exact: true }).click({ force: true }); // a native menuitem, not a button
  await page.getByText('Make a launch video', { exact: true }).waitFor();
  console.log('STEP due date filter');
  // Lists: delete the empty last list.
  await page.getByRole('button', { name: 'List options', exact: true }).last().click();
  await page.getByText('Delete list', { exact: true }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('textbox', { name: 'List name', exact: true }).filter({ hasText: '' }).first().waitFor();
  assert.deepEqual(
    await page.getByRole('textbox', { name: 'List name', exact: true }).evaluateAll((els) => els.map((el) => el.value)),
    ['Ideas', 'Making'],
  );
  console.log('STEP list deleted');
  // Templates: make one from this board, open it from the Templates page, then delete the board.
  await page.getByRole('button', { name: 'Board options', exact: true }).click();
  await page.getByText('Make template', { exact: true }).click();
  await page.getByText('New template', { exact: true }).waitFor();
  await page.getByPlaceholder('Name', { exact: true }).fill('Game plan template');
  await page.getByRole('button', { name: 'Create template', exact: true }).click();
  await page.getByText('Template created', { exact: true }).waitFor();
  await page.getByText('Template', { exact: true }).first().waitFor();
  assert.match(await page.evaluate(() => location.hash), /^#\/templates\//);
  await page.getByText('Make a launch video', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Templates', exact: true }).click();
  await page.getByText('Game plan template', { exact: true }).click();
  assert.match(await page.evaluate(() => location.hash), /^#\/templates\/[^/]+$/);
  await page.getByText('Make a launch video', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Kan · Boards', exact: true }).click();
  await page.getByText('Launch a creative project', { exact: true }).click();
  await page.getByRole('button', { name: 'Board options', exact: true }).click();
  await page.getByText('Delete board', { exact: true }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByText('No boards', { exact: true }).waitFor();
  console.log('STEP template made and board deleted');
  // Hosted-only controls are gone from the local edition.
  for (const text of ['Import', 'Edit board URL', 'Move to workspace', 'Copy card link']) {
    assert.equal(await page.getByText(text, { exact: true }).count(), 0, text);
  }
  await page.waitForTimeout(500);
  console.log('CARD', await page.locator('body').innerText());
  await page.screenshot({ path: '/private/tmp/crux-kan-card-proof.png' });
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(failedRequests, []);
  assert.deepEqual(externalRequests, []);
  console.log(
    'PASSED native board/list/card creation, movement, labels, due date, checklist completion, comment, and local edit/delete/duplicate/filter/template controls',
  );
} catch (error) {
  console.log('BODY', await page.locator('body').innerText());
  await page.screenshot({ path: '/private/tmp/crux-kan-proof-failure.png' });
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
