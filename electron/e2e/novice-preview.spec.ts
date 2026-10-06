import { test, expect } from '@playwright/test';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { togglePanel } from './panel-helpers';

test('Notes visitor preview builds only the selected public edition without publishing', async () => {
  test.setTimeout(180000);
  const { app, page } = await launchApp({ ai: false });
  const frameEvents: { at: number; url: string }[] = [];
  page.on('framenavigated', (frame) => frameEvents.push({ at: Date.now(), url: frame.url() }));
  try {
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    await page.getByRole('button', { name: /^Notes/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.getByLabel('Note title', { exact: true })).toHaveValue('Welcome');
    await frame.locator('.tiptap').first().fill('SELECTED_PUBLIC_PREVIEW');
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const folder = (await storedCrux(page, id)).projectFolder as string;
    await expect
      .poll(() => readFileSync(join(folder, 'notebook/Welcome.md'), 'utf8'))
      .toContain('SELECTED_PUBLIC_PREVIEW');
    writeFileSync(join(folder, 'notebook/Private.md'), 'PRIVATE_PREVIEW_SENTINEL');
    await togglePanel(page, 'Toggle share');
    const share = page.getByTestId('pane-body-publish');
    await share.getByRole('button', { name: 'Preview as a visitor' }).click();
    await expect(page.getByTestId('visitor-preview')).toContainText('Select at least one note', {
      timeout: 90000,
    });
    await page
      .getByRole('dialog', { name: 'Preview as a visitor' })
      .getByRole('button', { name: 'Back to editing', exact: true })
      .click();
    await frame.getByRole('button', { name: 'Public edition…' }).click();
    await frame.locator('input[data-note="Welcome.md"]').check();
    await frame.getByRole('button', { name: 'Done choosing' }).click();
    await page
      .getByTestId('pane-body-publish')
      .getByRole('button', { name: 'Preview as a visitor' })
      .click();
    const preview = page.getByTestId('visitor-preview');
    const reader = preview.frameLocator('iframe');
    await expect(reader.locator('body')).toContainText('SELECTED_PUBLIC_PREVIEW', {
      timeout: 90000,
    });
    await expect(reader.locator('body')).not.toContainText('PRIVATE_PREVIEW_SENTINEL');
    expect((await storedCrux(page, id)).meta?.publishedAt).toBeUndefined();
    await page.screenshot({ path: test.info().outputPath('notes-visitor-preview.png') });
    // Installation metadata must not restart the editor under a pending save.
    expect(frameEvents.filter((event) => event.url.includes('/runtime/index.html'))).toHaveLength(
      1,
    );
    await page.getByRole('button', { name: 'Back to editing', exact: true }).click();
    await expect(frame.locator('.tiptap').first()).toContainText('SELECTED_PUBLIC_PREVIEW');
  } finally {
    writeFileSync(
      test.info().outputPath('preview-frame-events.json'),
      JSON.stringify(frameEvents, null, 2),
    );
    await app.close();
  }
});
