import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, createCrux, reenterWorkspace, storedCrux } from './multi-crux-helpers';
import { fileText } from './content-helpers';

async function addFiles(page: Page, files: { name: string; text: string }[]) {
  const picker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add a file', exact: true }).click();
  await (
    await picker
  ).setFiles(
    files.map(({ name, text }) => ({
      name,
      mimeType: 'text/plain',
      buffer: Buffer.from(text),
    })),
  );
}

test('the composer adds multiple files with visible completion and preserves the draft and files after restart', async () => {
  let instance = await launchApp();
  try {
    await enterGarden(instance.page);
    const id = await createCrux(instance.page, 'Attachment review');
    const composer = instance.page.getByPlaceholder('Send a message...');
    await composer.fill('Use these references for my project.');
    await addFiles(instance.page, [
      { name: 'brief.txt', text: 'Project brief' },
      { name: 'notes.txt', text: 'Supporting notes' },
    ]);
    await expect.poll(() => fileText(instance.page, id, 'brief.txt')).toBe('Project brief');
    await expect.poll(() => fileText(instance.page, id, 'notes.txt')).toBe('Supporting notes');
    await expect(
      instance.page.getByRole('status').filter({ hasText: 'Added 2 files to Artifacts' }),
    ).toBeVisible();
    await expect(composer).toHaveValue('Use these references for my project.');
    await expect(composer).toBeFocused();
    const dir = instance.dir;
    await instance.app.close();
    instance = await launchApp({ dir });
    await reenterWorkspace(instance.page, 'Attachment review');
    await expect(instance.page.getByPlaceholder('Send a message...')).toHaveValue(
      'Use these references for my project.',
    );
    expect(await fileText(instance.page, id, 'brief.txt')).toBe('Project brief');
    expect(await fileText(instance.page, id, 'notes.txt')).toBe('Supporting notes');
  } finally {
    await instance.app.close();
  }
});

test('composer replacement requires consent and a concurrent edit survives a partial batch and explicit retry', async () => {
  const instance = await launchApp();
  const { page, app } = instance;
  try {
    await enterGarden(page);
    const id = await createCrux(page, 'Protected attachment');
    await addFiles(page, [{ name: 'brief.txt', text: 'Original brief' }]);
    await expect(
      page.getByRole('status').filter({ hasText: 'Added 1 file to Artifacts' }),
    ).toBeVisible();
    await addFiles(page, [{ name: 'brief.txt', text: 'Replacement' }]);
    const confirmation = page.getByRole('dialog', { name: 'Are you sure?' });
    await expect(confirmation).toContainText('already exists');
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await fileText(page, id, 'brief.txt')).toBe('Original brief');
    await page.getByPlaceholder('Send a message...').fill('Keep this draft');
    await addFiles(page, [
      { name: 'brief.txt', text: 'Replacement' },
      { name: 'new.txt', text: 'New file' },
    ]);
    await expect(confirmation).toContainText('already exists');
    const folder = (await storedCrux(page, id)).projectFolder;
    writeFileSync(join(folder, 'brief.txt'), 'Latest external work');
    await confirmation.getByRole('button', { name: 'Replace', exact: true }).click();
    const failure = page.getByRole('alertdialog', { name: 'Could not add files' });
    await expect(failure).toContainText('1 of 2 files added');
    await expect(failure).toContainText('brief.txt');
    expect(readFileSync(join(folder, 'brief.txt'), 'utf8')).toBe('Latest external work');
    expect(await fileText(page, id, 'new.txt')).toBe('New file');
    await page.screenshot({ path: test.info().outputPath('attachment-partial-refusal.png') });
    await failure.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(page.getByPlaceholder('Send a message...')).toHaveValue('Keep this draft');
    await expect.poll(() => fileText(page, id, 'brief.txt')).toBe('Latest external work');
    await addFiles(page, [{ name: 'brief.txt', text: 'Reviewed replacement' }]);
    await confirmation.getByRole('button', { name: 'Replace', exact: true }).click();
    await expect.poll(() => fileText(page, id, 'brief.txt')).toBe('Reviewed replacement');
    expect(await fileText(page, id, 'new.txt')).toBe('New file');
  } finally {
    await app.close();
  }
});
