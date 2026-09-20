import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

/**
 * Native tools, step 1 (MAKING-THE-AD-PARITY gap 13): the bundled ffmpeg runs
 * inside a crux folder from the Artifacts pane — a folder of frames becomes
 * exports/frames.mp4 — and the seam refuses a path outside the folder.
 */
function cruxFolder(dir: string): string {
  const garden = join(dir, 'garden');
  const [first] = readdirSync(garden);
  if (!first) throw new Error('no crux folder');
  return join(garden, first);
}

test('a folder of frames becomes a video from the Artifacts pane', async () => {
  test.setTimeout(180_000);
  const { app, page, dir } = await launchApp();
  try {
    await enterGarden(page);
    await createCrux(page, 'Frames');
    const folder = cruxFolder(dir);
    // Thirty test-pattern frames, written by the shell's own ffmpeg (as a page or an agent would).
    const ffmpeg = join(__dirname, '..', 'node_modules', 'ffmpeg-static', 'ffmpeg');
    mkdirSync(join(folder, 'frames'), { recursive: true });
    execFileSync(ffmpeg, [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=320x240:rate=30',
      '-t',
      '1',
      join(folder, 'frames', 'f%04d.png'),
    ]);
    expect(readdirSync(join(folder, 'frames')).length).toBeGreaterThanOrEqual(30);

    // Artifacts: the watcher brings the frames in; select one; Convert → Folder to video.
    await page.getByRole('button', { name: 'Toggle artifacts' }).click();
    const tree = page.getByRole('tree');
    await expect(tree.getByText('frames', { exact: true })).toBeVisible({ timeout: 30_000 });
    await tree.getByText('frames', { exact: true }).click();
    await tree.getByText('f0001.png', { exact: true }).click();
    const pane = page.getByTestId('pane-body-artifacts');
    await pane.getByRole('button', { name: /frames\/f0001\.png/ }).click();
    const convert = pane.getByTestId('convert-actions');
    await expect(convert).toBeVisible();
    await convert.getByRole('button', { name: 'Folder to video' }).click();
    await expect(convert.getByRole('status')).toContainText(/Done in/, { timeout: 60_000 });
    const out = join(folder, 'exports', 'frames.mp4');
    await expect.poll(() => existsSync(out) && statSync(out).size > 1000).toBe(true);
    // …and it reached Artifacts through the watcher.
    await expect(tree.getByText('exports', { exact: true })).toBeVisible({ timeout: 30_000 });

    // The seam refuses to leave the folder.
    const refused = await page.evaluate(async () => {
      const id = new URL(location.href).pathname.split('/c/')[1]?.split('/')[0];
      try {
        await window.electronAPI!.native.run({
          cruxId: id!,
          tool: 'ffmpeg',
          args: ['-i', '../outside.png', 'x.mp4'],
        });
        return 'ran';
      } catch (e) {
        return (e as Error).message;
      }
    });
    expect(refused).toMatch(/outside the crux folder/);
  } finally {
    await app.close();
  }
});
