import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux, addArtifact } from './multi-crux-helpers';

for (const owner of ['0', '1']) {
  test(`shared avatar bytes survive editing the source file and restart (API owner ${owner})`, async () => {
    const env = { CRUX_API_OWNER: owner };
    let launch = await launchApp({ env });
    const dir = launch.dir;
    try {
      let page = launch.page;
      await enterGarden(page);
      const id = await createCrux(page, 'Avatar retention');
      await addArtifact(page, 'avatar.txt');
      await page.locator('.monaco-editor').click();
      await page.keyboard.type('Shared avatar fixture bytes');
      await page.keyboard.press('ControlOrMeta+s');
      await expect
        .poll(() =>
          page.evaluate(async (id) => {
            const file = (await window.electronAPI!.sqlite.get(
              "SELECT fingerprint FROM artifacts WHERE resource_id = ? AND path = 'avatar.txt'",
              [id],
            )) as { fingerprint: string } | undefined;
            return (
              file &&
              new TextDecoder().decode(await window.electronAPI!.sqlite.blobRead(file.fingerprint))
            );
          }, id),
        )
        .toBe('Shared avatar fixture bytes');
      const fingerprint = await page.evaluate(async (id) => {
        const file = (await window.electronAPI!.sqlite.get(
          "SELECT fingerprint, author_id FROM artifacts WHERE resource_id = ? AND path = 'avatar.txt'",
          [id],
        )) as { fingerprint: string; author_id: string };
        const updated = await window.electronAPI!.sqlite.run(
          "UPDATE authors SET meta = json_set(COALESCE(meta, '{}'), '$.avatarFingerprint', ?) WHERE id = (SELECT id FROM authors ORDER BY id LIMIT 1)",
          [file!.fingerprint],
        );
        if (updated.changes !== 1) throw new Error('The avatar fixture was not registered');
        return file!.fingerprint;
      }, id);
      await page.locator('.monaco-editor').click();
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.type('The file has different bytes now');
      await page.keyboard.press('ControlOrMeta+s');
      await expect
        .poll(() =>
          page.evaluate(async (id) => {
            const file = (await window.electronAPI!.sqlite.get(
              "SELECT fingerprint FROM artifacts WHERE resource_id = ? AND path = 'avatar.txt'",
              [id],
            )) as { fingerprint: string } | undefined;
            return (
              file &&
              new TextDecoder().decode(await window.electronAPI!.sqlite.blobRead(file.fingerprint))
            );
          }, id),
        )
        .toBe('The file has different bytes now');
      await launch.app.close();
      launch = await launchApp({ dir, env });
      page = launch.page;
      expect(
        await page.evaluate(
          async (fp) => new TextDecoder().decode(await window.electronAPI!.sqlite.blobRead(fp)),
          fingerprint,
        ),
      ).toBe('Shared avatar fixture bytes');
      expect(
        await page.evaluate(
          (fp) =>
            window.electronAPI!.sqlite.get(
              "SELECT COUNT(*) AS retained FROM authors WHERE json_extract(meta, '$.avatarFingerprint') = ?",
              [fp],
            ),
          fingerprint,
        ),
      ).toEqual({ retained: 1 });
    } finally {
      await launch.app.close();
    }
  });
}
