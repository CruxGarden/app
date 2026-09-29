import { togglePanel } from './panel-helpers';
import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { enterGarden, createCrux, storedCrux } from './multi-crux-helpers';

/**
 * A long paste into the composer becomes a file (MAKING-THE-AD-PARITY gap 8):
 * notes/<slug>-<stamp>.md lands in Artifacts and the composer says to read it.
 */
test('a long paste becomes a note the collaborator can read', async () => {
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    await createCrux(page, 'Brief');
    const composer = page.getByPlaceholder('Send a message...');
    await composer.fill('Make the spot from this.');
    const brief =
      '# The campaign brief\n\n' + 'Serious, deadpan, like a bank commercial. '.repeat(60);
    await composer.evaluate((el, text) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      );
    }, brief);
    await expect(composer).toHaveValue(
      /Read notes\/the-campaign-brief-[a-f0-9-]+\.md first \(pasted, 2,\d{3} characters\)/,
      {
        timeout: 15_000,
      },
    );
    await togglePanel(page, 'Toggle artifacts');
    const tree = page.getByRole('tree');
    await expect(tree.getByText('notes', { exact: true })).toBeVisible({ timeout: 30_000 });
    await tree.getByText('notes', { exact: true }).click();
    await expect(tree.getByText(/the-campaign-brief-[a-f0-9-]+\.md/)).toBeVisible();
    // A short paste stays in the composer.
    await composer.fill('');
    const prevented = await composer.evaluate((el) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'just a line');
      const event = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      });
      el.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(false);
    await expect(composer).not.toHaveValue(/Read notes/);
  } finally {
    await app.close();
  }
});

test('a refused long-paste save keeps the pasted text and existing draft', async () => {
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    const id = await createCrux(page, 'Refused paste');
    const folder = (await storedCrux(page, id)).projectFolder as string;
    await page.evaluate(() =>
      window.electronAPI!.sqlite.run(
        "CREATE TRIGGER refuse_paste BEFORE INSERT ON file_content_heads BEGIN SELECT RAISE(ABORT, 'paste refused'); END",
      ),
    );
    const composer = page.getByPlaceholder('Send a message...');
    await composer.fill('Keep my introduction.');
    const brief = '# Recover this brief\n\n' + 'Do not lose this text. '.repeat(90);
    await composer.evaluate((el, text) => {
      const data = new DataTransfer();
      data.setData('text/plain', text);
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    }, brief);
    await expect(composer).toHaveValue(`Keep my introduction.\n${brief}`);
    await expect(page.getByText(/Could not save the pasted file/)).toBeVisible();
    await page.evaluate(() => window.electronAPI!.sqlite.run('DROP TRIGGER refuse_paste'));
    // Retry from the recovered text, without changing the clipboard contents.
    await composer.fill('Retry this brief.');
    await composer.evaluate((el, text) => {
      const data = new DataTransfer();
      data.setData('text/plain', text);
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    }, brief);
    await expect(composer).toHaveValue(/^Retry this brief.\nRead notes\//);
    const path = (await composer.inputValue()).match(/Read (notes\/[^\n]+\.md) first/)![1];
    expect(readFileSync(join(folder, path), 'utf8')).toBe(brief);
  } finally {
    await app.close();
  }
});
