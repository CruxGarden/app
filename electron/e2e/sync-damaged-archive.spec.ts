import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden, createCrux, addArtifact, switchCrux } from './multi-crux-helpers';
import { togglePanel } from './panel-helpers';

test('damaged cloud archives fail without altering local files, shared blobs or other drafts', async () => {
  test.setTimeout(120_000);
  const api = await startMockApi();
  let instance = await launchApp({ env: { CRUX_API_URL: api.url } });
  const dir = instance.dir;
  try {
    let page = instance.page;
    await enterGarden(page);
    const id = await createCrux(page, 'Protected work');
    await addArtifact(page, 'safe.txt');
    await page.locator('.monaco-editor').click();
    await page.keyboard.type('Keep these original bytes');
    await page.keyboard.press('ControlOrMeta+s');
    await togglePanel(page, 'Toggle sync');
    await page.getByPlaceholder('email@example.com').fill('tester@example.com');
    await page.getByRole('button', { name: 'Send Code' }).click();
    await page.getByPlaceholder('Enter code').fill('123456');
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await page.getByRole('button', { name: 'Push to cloud', exact: true }).click();
    await expect(page.getByText('Pushed successfully')).toBeVisible();
    const original = api.state.sync.cruxes[id]!.data!;
    const archive = await JSZip.loadAsync(original);
    const version = JSON.parse(await archive.file('versions/current.json')!.async('text'));
    const fingerprint = version.artifacts['safe.txt'].fingerprint as string;
    await createCrux(page, 'Other draft');
    await page.getByPlaceholder('Send a message...').fill('Keep this unsent thought');
    await switchCrux(page, 'Protected work');

    const verifyBytes = async () => {
      const bytes = await page.evaluate(
        async ({ id, fingerprint }) => {
          const row = (await window.electronAPI!.sqlite.get(
            'SELECT meta FROM cruxes WHERE id = ?',
            [id],
          )) as { meta: string };
          const blob = await window.electronAPI!.sqlite.blobRead(fingerprint);
          return {
            folder: JSON.parse(row.meta).projectFolder as string,
            content: new TextDecoder().decode(blob),
          };
        },
        { id, fingerprint },
      );
      expect(bytes.content).toBe('Keep these original bytes');
      expect(readFileSync(join(bytes.folder, 'safe.txt'), 'utf8')).toBe(
        'Keep these original bytes',
      );
    };

    for (const damage of ['corrupt', 'missing', 'truncated']) {
      const damaged = await JSZip.loadAsync(original);
      if (damage === 'corrupt') damaged.file(`artifacts/${fingerprint}`, 'Corrupted cloud bytes');
      if (damage === 'missing') damaged.remove(`artifacts/${fingerprint}`);
      api.state.sync.cruxes[id]!.data =
        damage === 'truncated'
          ? original.subarray(0, Math.floor(original.length / 2))
          : await damaged.generateAsync({ type: 'nodebuffer' });
      await page.getByRole('button', { name: 'Pull from cloud', exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Pull from cloud' })
        .getByRole('button', { name: /^Pull(?: anyway)?$/, exact: true })
        .click();
      await expect(page.getByText('Pull failed', { exact: true })).toBeVisible();
      await verifyBytes();
      await switchCrux(page, 'Other draft');
      await expect(page.getByPlaceholder('Send a message...')).toHaveValue(
        'Keep this unsent thought',
      );
      await switchCrux(page, 'Protected work');
    }

    // A retry with the intact download uses the normal replacement path.
    api.state.sync.cruxes[id]!.data = original;
    await page.getByRole('button', { name: 'Pull from cloud', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Pull from cloud' })
      .getByRole('button', { name: /^Pull(?: anyway)?$/, exact: true })
      .click();
    await expect(page.getByText('Pull complete', { exact: true })).toBeVisible();
    await verifyBytes();
    await instance.app.close();
    instance = await launchApp({ dir, env: { CRUX_API_URL: api.url } });
    page = instance.page;
    await page.getByRole('button', { name: /enter/i }).click();
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', id);
    await verifyBytes();
  } finally {
    await instance.app.close();
    await api.close();
  }
});
