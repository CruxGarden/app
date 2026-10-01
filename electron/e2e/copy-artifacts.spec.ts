import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import {
  enterGarden,
  createCrux,
  addArtifact,
  storedCrux,
  switchCrux,
  reenterWorkspace,
} from './multi-crux-helpers';

const binary = Buffer.from([0, 255, 17, 42]);

test('with AI off, copy selected files to another Crux, refuse overwrite and retain both after restart', async ({}, info) => {
  test.setTimeout(150_000);
  const instance = await launchApp({ ai: false });
  let sourceFolder = '';
  let destinationFolder = '';
  try {
    const { page } = instance;
    await enterGarden(page);
    const target = await createCrux(page, 'Website');
    destinationFolder = (await storedCrux(page, target)).projectFolder;
    const source = await createCrux(page, 'My sketches');
    sourceFolder = (await storedCrux(page, source)).projectFolder;
    await addArtifact(page, 'caption.txt');
    await page.locator('.monaco-editor').first().click();
    await page.keyboard.type('A caption with a fresh edit');
    await expect(page.locator('.monaco-editor .view-lines').first()).toContainText(
      'A caption with a fresh edit',
    );
    // The copy command is responsible for saving the open text draft.
    await page.getByRole('button', { name: 'Copy selected to another Crux…', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Copy to another Crux', exact: true });
    await dialog.getByLabel('Receiving Crux', { exact: true }).selectOption({ label: 'Website' });
    await dialog.getByLabel('Receiving folder (optional)').fill('public/shared');
    await dialog.getByRole('button', { name: 'Copy files', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Copied 1 file to Website');
    expect(readFileSync(join(destinationFolder, 'public/shared/caption.txt'), 'utf8')).toBe(
      'A caption with a fresh edit',
    );
    expect(readFileSync(join(sourceFolder, 'caption.txt'), 'utf8')).toBe(
      'A caption with a fresh edit',
    );
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();

    // Keyboard-accessible selection action and right-click use the same operation.
    await page
      .getByRole('tree')
      .getByText('caption.txt', { exact: true })
      .click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Copy to another Crux…', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Copy to another Crux', exact: true });
    await dialog.getByLabel('Receiving Crux', { exact: true }).selectOption({ label: 'Website' });
    await dialog.getByLabel('Receiving folder (optional)').fill('public/shared');
    await dialog.getByRole('button', { name: 'Copy files', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('already exists');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(readFileSync(join(destinationFolder, 'public/shared/caption.txt'), 'utf8')).toBe(
      'A caption with a fresh edit',
    );

    await page
      .getByRole('region', { name: 'Artifacts', exact: true })
      .locator('input[type=file][multiple]:not([webkitdirectory])')
      .setInputFiles({ name: 'drawing.bin', mimeType: 'application/octet-stream', buffer: binary });
    await page.getByRole('tree').getByText('drawing.bin', { exact: true }).click();
    await page.getByRole('button', { name: 'Copy selected to another Crux…', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Copy to another Crux', exact: true });
    await dialog.getByLabel('Receiving Crux', { exact: true }).selectOption({ label: 'Website' });
    await dialog.getByLabel('Receiving folder (optional)').fill('public/shared');
    await dialog.getByRole('button', { name: 'Copy files', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Copied 1 file to Website');
    expect(readFileSync(join(destinationFolder, 'public/shared/drawing.bin'))).toEqual(binary);
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await switchCrux(page, 'Website');
    const tree = page.getByRole('tree');
    await expect(tree.getByText('public', { exact: true })).toBeVisible();
    await tree.getByText('public', { exact: true }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Copy to another Crux…', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Copy to another Crux', exact: true });
    await dialog
      .getByLabel('Receiving Crux', { exact: true })
      .selectOption({ label: 'My sketches' });
    await dialog.getByLabel('Receiving folder (optional)').fill('received');
    await dialog.getByRole('button', { name: 'Copy files', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Copied 2 files to My sketches');
    expect(readFileSync(join(sourceFolder, 'received/public/shared/drawing.bin'))).toEqual(binary);
    expect(readFileSync(join(sourceFolder, 'received/public/shared/caption.txt'), 'utf8')).toBe(
      'A caption with a fresh edit',
    );
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await page.screenshot({ path: info.outputPath('receiving-crux.png') });
  } finally {
    await instance.app.close();
  }
  const again = await launchApp({ ai: false, dir: instance.dir });
  try {
    await reenterWorkspace(again.page, 'Website');
    expect(readFileSync(join(destinationFolder, 'public/shared/caption.txt'), 'utf8')).toBe(
      'A caption with a fresh edit',
    );
    expect(readFileSync(join(destinationFolder, 'public/shared/drawing.bin'))).toEqual(binary);
    expect(readFileSync(join(sourceFolder, 'drawing.bin'))).toEqual(binary);
  } finally {
    await again.app.close();
  }
});
