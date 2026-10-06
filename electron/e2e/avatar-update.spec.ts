import { test, expect, type Page } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';
import { createHash } from 'node:crypto';

const original = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=',
  'base64',
);
const replacement = Buffer.concat([original, Buffer.from('replacement')]);
const fingerprint = createHash('sha256').update(original).digest('hex');
const replacementFingerprint = createHash('sha256').update(replacement).digest('hex');
async function currentPortrait(page: Page) {
  return page.evaluate(async () => {
    const author = (await window.electronAPI!.sqlite.get(
      "SELECT meta FROM authors WHERE id = (SELECT value FROM settings WHERE key = 'cruxgarden:localAuthorId')",
    )) as { meta: string };
    return JSON.parse(author.meta).avatarFingerprint as string | null;
  });
}
async function storedBytes(page: Page, fp: string) {
  return page.evaluate(async (fp) => [...(await window.electronAPI!.sqlite.blobRead(fp))], fp);
}

for (const owner of ['0', '1']) {
  test(`avatar failures retry without losing historical images through restart (API owner ${owner})`, async () => {
    const env = { CRUX_API_OWNER: owner };
    let launch = await launchApp({ env });
    const dir = launch.dir;
    try {
      let page = launch.page;
      await enterGarden(page);
      const cruxId = await createCrux(page, 'Portrait history');
      await page.keyboard.press('ControlOrMeta+,');
      // Settings is a workspace pane, not a dialog.
      const settings = () => page.getByTestId('pane-body-settings');
      await expect(settings()).toBeVisible({ timeout: 30_000 });
      const upload = (buffer: Buffer) =>
        settings()
          .locator('input[type=file][accept="image/*"]')
          .setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer });
      await upload(original);
      await expect.poll(() => currentPortrait(page)).toBe(fingerprint);
      await expect(settings().getByRole('img', { name: 'Avatar', exact: true })).toBeVisible();
      await page.evaluate(
        async ({ cruxId, fingerprint }) => {
          await window.electronAPI!.sqlite.run(
            "UPDATE cruxes SET meta = json_set(COALESCE(meta, '{}'), '$.authorSnapshots', json(?)) WHERE id = ?",
            [JSON.stringify({ previous: { avatarFingerprint: fingerprint } }), cruxId],
          );
          await window.electronAPI!.sqlite.run(
            "CREATE TRIGGER refuse_avatar BEFORE UPDATE ON authors BEGIN SELECT RAISE(ABORT, 'Avatar update refused'); END",
          );
        },
        { cruxId, fingerprint },
      );
      await upload(replacement);
      await expect(settings().getByRole('alert')).toHaveText(
        'Could not save your photo. Please try again.',
      );
      expect(await currentPortrait(page)).toBe(fingerprint);
      expect(await storedBytes(page, fingerprint)).toEqual([...original]);
      await settings().getByRole('button', { name: 'Remove', exact: true }).click();
      await expect(settings().getByRole('alert')).toHaveText(
        'Could not remove your photo. Please try again.',
      );
      expect(await currentPortrait(page)).toBe(fingerprint);
      expect(
        await settings()
          .getByRole('img', { name: 'Avatar', exact: true })
          .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      ).toBe(true);
      await launch.app.close();
      launch = await launchApp({ dir, env });
      page = launch.page;
      expect(await currentPortrait(page)).toBe(fingerprint);
      expect(await storedBytes(page, fingerprint)).toEqual([...original]);
      await page.evaluate(() => window.electronAPI!.sqlite.run('DROP TRIGGER refuse_avatar'));
      await page.getByRole('button', { name: /enter/i }).click();
      await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
      await page.keyboard.press('ControlOrMeta+,');
      await upload(replacement);
      await expect.poll(() => currentPortrait(page)).toBe(replacementFingerprint);
      await expect(settings().getByRole('alert')).toHaveCount(0);
      await settings().getByRole('button', { name: 'Remove', exact: true }).click();
      await expect.poll(() => currentPortrait(page)).toBeNull();
      await expect(
        settings().getByRole('button', { name: 'Upload photo', exact: true }),
      ).toBeVisible();
      await launch.app.close();
      launch = await launchApp({ dir, env });
      page = launch.page;
      expect(await currentPortrait(page)).toBeNull();
      expect(await storedBytes(page, fingerprint)).toEqual([...original]);
      expect(await storedBytes(page, replacementFingerprint)).toEqual([...replacement]);
      expect(
        await page.evaluate(async (cruxId) => {
          const crux = (await window.electronAPI!.sqlite.get(
            'SELECT meta FROM cruxes WHERE id = ?',
            [cruxId],
          )) as { meta: string };
          return JSON.parse(crux.meta).authorSnapshots.previous.avatarFingerprint;
        }, cruxId),
      ).toBe(fingerprint);
    } finally {
      await launch.app.close();
    }
  });
}
