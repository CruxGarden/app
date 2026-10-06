import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import {
  enterGarden,
  createCrux,
  goHome,
  storedCrux,
  storedFingerprint,
} from './multi-crux-helpers';

test('Duplicate creates an independent Crux with files and visitor-owned Store values, surviving restart', async () => {
  test.setTimeout(120_000);
  const { app, page, dir } = await launchApp({ ai: false });
  let copyId = '';
  try {
    await enterGarden(page);
    const sourceId = await createCrux(page, 'My original');
    const source = await storedCrux(page, sourceId);
    writeFileSync(join(source.projectFolder, 'note.txt'), 'Original note');
    writeFileSync(join(source.projectFolder, 'bytes.bin'), Buffer.from([0, 255, 128, 1]));
    await expect.poll(() => storedFingerprint(page, sourceId, 'bytes.bin')).toBeTruthy();
    await page.evaluate(async (cruxId) => {
      for (const [visitorId, value] of [
        ['visitor-a', 'red'],
        ['visitor-b', 'blue'],
      ]) {
        await window.electronAPI!.sqlite.installation!.storeSet({
          cruxId,
          key: 'color',
          visitorId,
          value: JSON.stringify(value),
          mode: 'protected',
        });
      }
    }, sourceId);
    await goHome(page);
    const card = page.getByRole('button', { name: 'Open My original', exact: true }).locator('..');
    await card.getByRole('button', { name: 'Crux actions', exact: true }).click();
    await card.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
      'My original — copy',
    );
    copyId = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    expect(copyId).not.toBe(sourceId);
    const copy = await storedCrux(page, copyId);
    expect(copy.projectFolder).not.toBe(source.projectFolder);
    expect(readFileSync(join(copy.projectFolder, 'bytes.bin'))).toEqual(
      Buffer.from([0, 255, 128, 1]),
    );
    expect(readFileSync(join(copy.projectFolder, 'note.txt'), 'utf8')).toBe('Original note');
    const entries = await page.evaluate(
      async (id) =>
        window.electronAPI!.sqlite.all(
          'SELECT visitor_id, value FROM store WHERE crux_id = ? ORDER BY visitor_id',
          [id],
        ),
      copyId,
    );
    expect(entries).toEqual([
      { visitor_id: 'visitor-a', value: '"red"' },
      { visitor_id: 'visitor-b', value: '"blue"' },
    ]);
    writeFileSync(join(copy.projectFolder, 'note.txt'), 'Independent copy');
    await expect
      .poll(() => storedFingerprint(page, copyId, 'note.txt'))
      .not.toBe(await storedFingerprint(page, sourceId, 'note.txt'));
    expect(readFileSync(join(source.projectFolder, 'note.txt'), 'utf8')).toBe('Original note');
  } finally {
    await app.close();
  }
  const again = await launchApp({ dir, ai: false });
  try {
    await again.page.getByRole('button', { name: /enter/i }).click();
    await expect(
      again.page.getByRole('button', { name: 'Open My original — copy', exact: true }),
    ).toBeVisible();
    const copy = await storedCrux(again.page, copyId);
    expect(readFileSync(join(copy.projectFolder, 'note.txt'), 'utf8')).toBe('Independent copy');
  } finally {
    await again.app.close();
  }
});
