import { openPanel } from './panel-helpers';
import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { createCrux, enterGarden, storedCrux, storedFingerprint } from './multi-crux-helpers';
import { closeWorkspace } from './journeys/journey-helpers';

test('large workspace opens while the soundtrack and its level meter keep playing', async () => {
  test.setTimeout(420_000);
  const { app, page } = await launchApp({ sound: true });
  const debug = await page.context().newCDPSession(page);
  try {
    page.on('console', (m) => {
      if (m.type() === 'error') console.log(m.text());
    });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Play soundscape', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pause soundscape', exact: true })).toBeVisible();

    // Many paths, one tiny content: a real Project Folder with 2,000 files in
    // 20 sections, indexed by ingestion, then closed and reopened under CPU
    // throttling. (The old 20k-entry archive pointed every path at two blobs;
    // on disk each file is read, and a 20k burst outruns ingestion today.)
    const title = 'Large sounding workspace';
    const id = await createCrux(page, title);
    const folder = (await storedCrux(page, id)).projectFolder as string;
    const noteBytes = 'A portable note.\n';
    for (let section = 0; section < 20; section++) {
      mkdirSync(join(folder, 'notes', `section-${section}`), { recursive: true });
      for (let i = 0; i < 100; i++)
        writeFileSync(
          join(folder, 'notes', `section-${section}`, `note-${section * 100 + i}.txt`),
          noteBytes,
        );
    }
    writeFileSync(join(folder, 'index.html'), '<!doctype html><h1>Workspace is ready</h1>');
    // The head moves while ingestion commits; a read that lands between head and list retries.
    const stored = (path: string) => storedFingerprint(page, id, path).catch(() => undefined);
    await expect
      .poll(() => stored('notes/section-19/note-1999.txt'), { timeout: 180_000 })
      .toBe(createHash('sha256').update(noteBytes).digest('hex'));
    await expect.poll(() => stored('index.html'), { timeout: 60_000 }).toEqual(expect.any(String));
    await closeWorkspace(page, title);
    await expect(page.getByTestId('pane-body-home')).toBeVisible({ timeout: 30_000 });
    // Make the reopen span multiple meter frames, even on a fast machine.
    await debug.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.getByRole('button', { name: `Open ${title}`, exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 90_000 });
    await openPanel(page, 'workshop', 'Toggle workshop');
    await expect(page.getByTestId('workshop-view')).toBeVisible({ timeout: 30_000 });
    await expect(
      page
        .frameLocator('iframe[data-crux-id]')
        .getByRole('heading', { name: 'Workspace is ready' }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Pause soundscape', exact: true })).toBeVisible();
    await debug.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    console.log('Large workspace preview ready', folder);
    const exists = async (path: string) => typeof (await stored(path)) === 'string';
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
