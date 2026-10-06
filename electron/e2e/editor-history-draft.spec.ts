import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { addArtifact, createCrux, enterGarden, storedCrux } from './multi-crux-helpers';
import { togglePanel } from './panel-helpers';

test('reading history preserves the live editor draft and undo model without saving history', async () => {
  const { app, page } = await launchApp();
  try {
    // Editing local files must work without downloading the editor from a CDN.
    await page.context().setOffline(true);
    await enterGarden(page);
    const id = await createCrux(page, 'Draft and history');
    const meta = await storedCrux(page, id);
    await addArtifact(page, 'notes.txt');
    const editor = page.locator('.monaco-editor').first();
    await editor.click();
    await page.keyboard.type('Saved beginning');
    await page.keyboard.press('ControlOrMeta+s');
    const disk = () => readFileSync(join(meta.projectFolder, 'notes.txt'), 'utf8');
    await expect.poll(disk).toBe('Saved beginning');
    await togglePanel(page, 'Toggle growth');
    const history = page.getByTestId('pane-body-history');
    await history.getByRole('button', { name: 'Mark version', exact: true }).click();
    await history.getByPlaceholder('Label (optional)').fill('Saved checkpoint');
    await history.getByPlaceholder('Label (optional)').press('Enter');
    await expect(history.getByText('Saved checkpoint', { exact: true })).toBeVisible();
    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(' with an unsaved ending');
    await expect(editor).toContainText('with an unsaved ending');
    await history.getByRole('button').filter({ hasText: 'Saved checkpoint' }).first().click();
    await expect(page.getByText('read-only', { exact: true })).toBeVisible();
    await expect(editor).toContainText('Saved beginning');
    await expect(editor).not.toContainText('unsaved ending');
    await editor.click();
    await page.keyboard.type('must not change history');
    await page.keyboard.press('ControlOrMeta+s');
    expect(disk()).toBe('Saved beginning');
    await expect(editor).not.toContainText('must not change history');
    await history.getByRole('button', { name: 'Back to current' }).click();
    await expect(editor).toContainText('Saved beginning with an unsaved ending');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    // Undo acts on the retained live model, not the historical editor's model.
    await editor.click();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(editor).not.toContainText('unsaved ending');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(editor).toContainText('with an unsaved ending');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(disk).toBe('Saved beginning with an unsaved ending');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('JSON validation uses the bundled language worker while offline', async () => {
  const { app, page } = await launchApp();
  try {
    await page.context().setOffline(true);
    await enterGarden(page);
    const id = await createCrux(page, 'Offline JSON');
    const [worker] = await Promise.all([
      page.waitForEvent('worker', {
        predicate: (candidate) => candidate.url().includes('json.worker'),
      }),
      addArtifact(page, 'data.json'),
    ]);
    expect(worker.url()).toMatch(/^crux-app:/);
    const editor = page.locator('.monaco-editor').first();
    await editor.click();
    await page.keyboard.type('{"name": }');
    await expect(editor.locator('.squiggly-error').first()).toBeVisible();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('{"name": "local"}');
    await expect(editor.locator('.squiggly-error')).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+s');
    const meta = await storedCrux(page, id);
    await expect
      .poll(() => readFileSync(join(meta.projectFolder, 'data.json'), 'utf8'))
      .toBe('{"name": "local"}');
  } finally {
    await app.close();
  }
});
