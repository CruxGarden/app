import { test, expect } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { importNativeCrux } from './native-archive-helpers';

test('large workspace opens while the soundtrack and its level meter keep playing', async () => {
  test.setTimeout(180000);
  const { app, page, dir } = await launchApp();
  const debug = await page.context().newCDPSession(page);
  try {
    page.on('console', (m) => {
      if (m.type() === 'error') console.log(m.text());
    });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);
    await expect(page.getByRole('button', { name: 'Pause soundscape', exact: true })).toBeVisible();

    // Many paths, just two tiny blobs: exercise the real archive/import/render
    // path without installing a particular native editor or fetching any media.
    const zip = new JSZip();
    const id = randomUUID();
    const crux = {
      id,
      title: 'Large sounding workspace',
      type: 'workspace',
      kind: 'webapp',
      meta: { settings: { entryFile: 'index.html' } },
    };
    const files: Record<string, { fingerprint: string; mimeType: string; size: number }> = {};
    const record = (content: string, mimeType: string) => {
      const fingerprint = createHash('sha256').update(content).digest('hex');
      zip.file(`artifacts/${fingerprint}`, content);
      return { fingerprint, mimeType, size: Buffer.byteLength(content) };
    };
    const note = record('A portable note.\n', 'text/plain');
    for (let i = 0; i < 20000; i++)
      files[`notes/section-${Math.floor(i / 100)}/note-${i}.txt`] = note;
    files['index.html'] = record('<!doctype html><h1>Workspace is ready</h1>', 'text/html');
    zip.file(
      'manifest.json',
      JSON.stringify({ version: '1.0', artifactCount: 2, snapshotCount: 0 }),
    );
    zip.file('crux.json', JSON.stringify(crux));
    zip.file('dimensions.json', '[]');
    zip.file(
      'versions/current.json',
      JSON.stringify({ index: 'current', parentIndex: null, crux, artifacts: files, messages: [] }),
    );
    const archive = join(dir, 'large.crux');
    writeFileSync(archive, await zip.generateAsync({ type: 'nodebuffer' }));
    await importNativeCrux(page, archive);
    // Make initial rendering span multiple meter frames, even on a fast machine.
    await debug.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.getByRole('button', { name: 'Toggle workshop', exact: true }).click();
    await expect(page.getByTestId('workshop-view')).toBeVisible({ timeout: 15000 });
    await expect(
      page
        .frameLocator('iframe[data-crux-id]')
        .getByRole('heading', { name: 'Workspace is ready' }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Pause soundscape', exact: true })).toBeVisible();
    await debug.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const owner = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const folder = (await storedCrux(page, owner)).projectFolder;
    console.log('Large workspace preview ready', folder);
    const exists = (path: string) =>
      page.evaluate(
        async ({ owner, path }) =>
          !!(await window.electronAPI!.sqlite.get(
            'SELECT id FROM artifacts WHERE resource_id = ? AND path = ?',
            [owner, path],
          )),
        { owner, path },
      );
    writeFileSync(join(folder, '.cruxignore'), 'ignored/\n');
    await expect.poll(() => exists('.cruxignore'), { timeout: 60000 }).toBe(true);
    mkdirSync(join(folder, 'ignored'));
    writeFileSync(join(folder, 'ignored', 'private.txt'), 'Ignored by the Project Folder rules.');
    const nested = join(folder, 'external', 'nested');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, 'draft.txt'), 'A new external draft.');
    await expect.poll(() => exists('external/nested/draft.txt')).toBe(true);
    expect(await exists('ignored/private.txt')).toBe(false);
    renameSync(join(nested, 'draft.txt'), join(nested, 'renamed.txt'));
    await expect.poll(() => exists('external/nested/renamed.txt')).toBe(true);
    await expect.poll(() => exists('external/nested/draft.txt')).toBe(false);
    rmSync(join(folder, 'external'), { recursive: true });
    await expect.poll(() => exists('external/nested/renamed.txt')).toBe(false);
    // Atomic replacement must reload the entry file after its final bytes land.
    writeFileSync(
      join(folder, 'replacement.html'),
      '<!doctype html><h1>External edit arrived</h1>',
    );
    renameSync(join(folder, 'replacement.html'), join(folder, 'index.html'));
    await expect(
      page
        .frameLocator('iframe[data-crux-id]')
        .getByRole('heading', { name: 'External edit arrived' }),
    ).toBeVisible();
    const bars = page
      .getByRole('region', { name: 'Mood Bar' })
      .locator('.react-accent-bars > span');
    await expect(bars).toHaveCount(4);
    const tallest = bars.nth(2);
    await expect
      .poll(() => tallest.evaluate((el) => parseFloat((el as HTMLElement).style.height)))
      .toBeGreaterThan(7);
    await page.getByRole('button', { name: 'Pause soundscape', exact: true }).click();
    await expect
      .poll(() => tallest.evaluate((el) => parseFloat((el as HTMLElement).style.height)))
      .toBeLessThan(3);
  } finally {
    await debug.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {});
    await debug.detach();
    await app.close();
  }
});
