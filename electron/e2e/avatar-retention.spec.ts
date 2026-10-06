import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux, addArtifact } from './multi-crux-helpers';
import { fileText, indexedFiles } from './content-helpers';

/**
 * A blob shared by a file and the author's avatar outlives the file's next
 * edit and a restart: the Blob Store keeps every referenced fingerprint
 * (api/src/local/desktop-reference-sql.ts), and files are read through the
 * API's content heads rather than per-file rows.
 */
test('shared avatar bytes survive editing the source file and restart', async () => {
  let launch = await launchApp();
  const dir = launch.dir;
  try {
    let page = launch.page;
    await enterGarden(page);
    const id = await createCrux(page, 'Avatar retention');
    await addArtifact(page, 'avatar.txt');
    await page.locator('.monaco-editor').click();
    await page.keyboard.type('Shared avatar fixture bytes');
    await page.keyboard.press('ControlOrMeta+s');
    await expect.poll(() => fileText(page, id, 'avatar.txt')).toBe('Shared avatar fixture bytes');
    const fingerprint = (await indexedFiles(page, id))['avatar.txt']!;
    expect(fingerprint).toBeTruthy();
    await page.evaluate(async (fp) => {
      const author = await window.electronAPI!.sqlite.get<{ id: string }>(
        'SELECT id FROM authors ORDER BY id LIMIT 1',
      );
      if (!author) throw new Error('The local author is missing');
      await window.electronAPI!.sqlite.installation.updateAuthor(author.id, {
        meta: { avatarFingerprint: fp },
      });
    }, fingerprint);
    await page.locator('.monaco-editor').click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('The file has different bytes now');
    await page.keyboard.press('ControlOrMeta+s');
    await expect
      .poll(() => fileText(page, id, 'avatar.txt'))
      .toBe('The file has different bytes now');
    await launch.app.close();
    launch = await launchApp({ dir });
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
