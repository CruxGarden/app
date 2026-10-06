import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, createCrux, storedCrux } from './multi-crux-helpers';
import { fileText } from './content-helpers';

/**
 * The composer's own way in for files (coverage audit, October 3): "Add a file"
 * opens the composer's hidden multiple file input; what is chosen there lands
 * in Artifacts (bytes on disk and in the store), the composer says so and
 * keeps the draft, and the message that follows can name those files and
 * reaches the collaborator. Uses the hidden input directly (setInputFiles),
 * the path a person's file dialog takes.
 */

// A 1×1 transparent PNG: a binary file must arrive byte for byte.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test('Add a file feeds the hidden multiple input; the files land in Artifacts and the next message names them', async () => {
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  try {
    await enterGarden(page);
    const id = await createCrux(page, 'Composer add file');
    const pane = page.getByTestId('pane-body-collaboration');
    const composer = pane.getByTestId('composer');
    const button = composer.getByRole('button', { name: 'Add a file', exact: true });
    const input = composer.locator('input[type="file"]');
    const textbox = pane.getByPlaceholder('Send a message...');

    // One hidden input that takes several files; the button is the visible way in.
    await expect(input).toHaveCount(1);
    await expect(input).toBeHidden();
    expect(await input.evaluate((el) => (el as HTMLInputElement).multiple)).toBe(true);
    await expect(button).toBeEnabled();

    // The button raises exactly this input's chooser (not some other picker).
    const chooserEvent = page.waitForEvent('filechooser');
    await button.click();
    const chooser = await chooserEvent;
    expect(chooser.isMultiple()).toBe(true);
    expect(
      await chooser.element().evaluate((node) => {
        const el = node as Element;
        return !!el.closest('[data-testid="composer"]') && el.matches('input[type=file]');
      }),
    ).toBe(true);
    // Dismissing the chooser adds nothing.
    await chooser.setFiles([]);
    await expect(pane.getByRole('status').filter({ hasText: 'Added' })).toHaveCount(0);

    await textbox.fill('Draft before the files.');
    await input.setInputFiles([
      { name: 'palette.txt', mimeType: 'text/plain', buffer: Buffer.from('moss, fern, loam') },
      { name: 'swatch.png', mimeType: 'image/png', buffer: PIXEL },
    ]);

    // The composer reports completion and keeps the draft.
    const status = pane.getByRole('status').filter({ hasText: 'Added 2 files to Artifacts.' });
    await expect(status).toBeVisible({ timeout: 30_000 });
    await expect(textbox).toHaveValue('Draft before the files.');
    // The input is emptied so the same file can be chosen again.
    expect(await input.evaluate((el) => (el as HTMLInputElement).value)).toBe('');

    // In the store and in the Project Folder, byte for byte.
    await expect.poll(() => fileText(page, id, 'palette.txt')).toBe('moss, fern, loam');
    const folder = (await storedCrux(page, id)).projectFolder as string;
    await expect
      .poll(() => {
        try {
          return readFileSync(join(folder, 'swatch.png')).equals(PIXEL);
        } catch {
          return false;
        }
      })
      .toBe(true);
    expect(readFileSync(join(folder, 'palette.txt'), 'utf8')).toBe('moss, fern, loam');

    // "Show files" brings Artifacts forward with both files listed.
    await status.getByRole('button', { name: 'Show files', exact: true }).click();
    const artifacts = page.getByTestId('pane-body-artifacts');
    await expect(artifacts).toBeVisible({ timeout: 30_000 });
    const tree = artifacts.getByRole('tree');
    await expect(tree.getByText('palette.txt', { exact: true })).toBeVisible();
    await expect(tree.getByText('swatch.png', { exact: true })).toBeVisible();

    // Choosing the same name again through the same input asks before replacing.
    await input.setInputFiles({
      name: 'palette.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('replacement'),
    });
    const confirm = page.getByRole('dialog', { name: 'Are you sure?' });
    await expect(confirm).toContainText('"palette.txt" already exists');
    await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await fileText(page, id, 'palette.txt')).toBe('moss, fern, loam');

    // The message that follows names the files and reaches the collaborator.
    await textbox.fill('Use palette.txt and swatch.png for the header.');
    await textbox.press('Enter');
    await expect(textbox).toHaveValue('');
    const messages = pane.getByRole('region', { name: 'Collaboration messages', exact: true });
    await expect(messages).toContainText('Use palette.txt and swatch.png for the header.');
    await expect(messages).toContainText(
      /Mock reply: .*Use palette\.txt and swatch\.png for the header\./,
      { timeout: 30_000 },
    );
    // Sending did not move or rename the files.
    expect(await fileText(page, id, 'palette.txt')).toBe('moss, fern, loam');
    expect(readFileSync(join(folder, 'swatch.png')).equals(PIXEL)).toBe(true);
  } finally {
    await app.close();
  }
});
