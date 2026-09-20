import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

/**
 * Media Tools (MAKING-THE-AD-PARITY gap 13, the full form): the bench runs
 * the real binaries inside the crux folder. The tool chips say what this
 * machine has and where each came from; a video is probed and converted from
 * the page; a picture goes through ImageMagick; a run that asks for a file
 * outside the folder is refused; every output lands in exports/ as an
 * Artifact and the log records what happened.
 */
function cruxFolder(dir: string): string {
  const garden = join(dir, 'garden');
  const [first] = readdirSync(garden);
  if (!first) throw new Error('no crux folder');
  return join(garden, first);
}

test('the media bench converts with the real tools, and refuses what is outside the crux', async () => {
  test.setTimeout(420_000);
  const t0 = Date.now();
  const mark = (what: string) =>
    console.log(`[media] ${Math.round((Date.now() - t0) / 1000)}s ${what}`);
  const { app, page, dir } = await launchApp();
  try {
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Media Tools/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible();
    const folder = cruxFolder(dir);

    // A source of each kind, made by the bundled ffmpeg — as a person's drop would be.
    const ffmpeg = join(__dirname, '..', 'node_modules', 'ffmpeg-static', 'ffmpeg');
    mkdirSync(join(folder, 'video'), { recursive: true });
    mkdirSync(join(folder, 'images'), { recursive: true });
    execFileSync(ffmpeg, [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=320x240:rate=30',
      '-t',
      '2',
      '-pix_fmt',
      'yuv420p',
      join(folder, 'video', 'clip.mov'),
    ]);
    execFileSync(ffmpeg, [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=640x480:rate=1',
      '-frames:v',
      '1',
      join(folder, 'images', 'card.png'),
    ]);

    const bench = page.frameLocator('iframe[data-crux-id]');
    /**
     * Adding a file to the Crux reloads the Workshop preview under the bench,
     * so a click can land on a page that is about to go. Pick, then confirm,
     * and try once more if the reload took it.
     */
    const pick = async (path: string) => {
      for (let i = 0; i < 3; i++) {
        await bench.locator('#files button').filter({ hasText: path }).click({ timeout: 30_000 });
        try {
          await expect(bench.locator('#chosen-name')).toHaveText(path, { timeout: 5_000 });
          return;
        } catch {
          await page.waitForTimeout(1500);
        }
      }
      throw new Error(`could not pick ${path}`);
    };
    /** The output exists and has stopped growing — a run that is really over. */
    const settled = (output: string): number => {
      const at = join(folder, output);
      if (!existsSync(at)) return -1;
      const a = statSync(at).size;
      const b = statSync(at).size;
      return a === b && a > 0 ? a : -1;
    };
    const runRecipe = async (recipe: string, output: string) => {
      for (let i = 0; i < 3; i++) {
        await bench.locator('#recipe').selectOption(recipe);
        await bench.getByRole('button', { name: 'Run', exact: true }).first().click();
        try {
          let last = -1;
          await expect
            .poll(
              () => {
                const now = settled(output);
                const stable = now > 0 && now === last;
                last = now;
                return stable;
              },
              { timeout: 45_000, intervals: [1000] },
            )
            .toBe(true);
          return;
        } catch {
          await page.waitForTimeout(1500);
        }
      }
      throw new Error(`${recipe} never produced ${output}`);
    };
    await expect(bench.getByRole('heading', { name: 'Media bench' })).toBeVisible({
      timeout: 30_000,
    });

    // The tools this machine has, named with where each came from.
    const chips = bench.locator('.tool-chip');
    await expect(chips).toHaveCount(4, { timeout: 30_000 });
    await expect(chips.filter({ hasText: 'ffmpeg' }).first()).toHaveClass(/ok/);

    // The files arrive through the watcher, grouped by kind.
    const files = bench.locator('#files button');
    await expect(bench.locator('#files')).toContainText('video/clip.mov', { timeout: 30_000 });
    await expect(bench.locator('#files')).toContainText('images/card.png');

    // Pick the video: the bench probes it and says what it is.
    await pick('video/clip.mov');
    await expect(bench.locator('#about')).toContainText('320×240', { timeout: 30_000 });
    await expect(bench.locator('#command')).toContainText('ffmpeg -y -i video/clip.mov');

    // Convert it. The output appears in the folder, in the list, and in the log.
    await runRecipe('to-mp4', 'exports/clip.mp4');
    expect(statSync(join(folder, 'exports', 'clip.mp4')).size).toBeGreaterThan(1000);
    await expect
      .poll(
        async () =>
          await bench
            .locator('#files')
            .innerText()
            .catch(() => ''),
        {
          timeout: 60_000,
          intervals: [1000],
        },
      )
      .toContain('exports/clip.mp4');

    // A picture through ImageMagick, when this machine has it.
    const magick = await bench
      .locator('.tool-chip')
      .filter({ hasText: 'ImageMagick' })
      .getAttribute('class');
    if (magick?.includes('ok')) {
      await pick('images/card.png');
      await runRecipe('thumb', 'exports/card-thumb.jpg');
    }

    // A document through Pandoc, when this machine has it.
    const pandoc = await bench
      .locator('.tool-chip')
      .filter({ hasText: 'Pandoc' })
      .getAttribute('class');
    if (pandoc?.includes('ok')) {
      mkdirSync(join(folder, 'documents'), { recursive: true });
      writeFileSync(join(folder, 'documents', 'brief.md'), '# Brief\n\nWhat this is for.\n');
      await expect
        .poll(
          async () =>
            await bench
              .locator('#files')
              .innerText()
              .catch(() => ''),
          {
            timeout: 30_000,
            intervals: [1000],
          },
        )
        .toContain('documents/brief.md');
      await pick('documents/brief.md');
      await runRecipe('to-html', 'exports/brief.html');
      expect(readFileSync(join(folder, 'exports', 'brief.html'), 'utf8')).toContain('<h1');
    }

    // The seam refuses a path outside the crux, from the page as from anywhere.
    await bench.locator('#custom-details summary').click();
    await bench.locator('#custom-args').fill('-y -i video/clip.mov /tmp/escape.mp4');
    await bench.getByRole('button', { name: 'Run' }).last().click();
    await expect(bench.locator('#output')).toContainText('relative to the crux folder', {
      timeout: 30_000,
    });
    expect(existsSync('/tmp/escape.mp4')).toBe(false);

    // The log kept the record of what was made.
    await expect.poll(() => existsSync(join(folder, 'log.md'))).toBe(true);
    const log = readdirSync(join(folder, 'exports'));
    expect(log).toContain('clip.mp4');
    await page.screenshot({ path: 'e2e/.results/media-tools.png' });
  } finally {
    await app.close();
  }
});
