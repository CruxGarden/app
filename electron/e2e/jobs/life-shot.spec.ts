import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from '../launch';
import { enterGarden, createCrux } from '../multi-crux-helpers';

/**
 * The garden warming up: the background is drained of colour when nothing has
 * happened (--signal-activity 0) and comes back to the Mood's own colour as
 * you work. Two stills of the two resting states, side by side.
 * Opt-in: CRUX_LIFE_SHOT=1. Writes to app/docs/motion/.
 */
test.skip(!process.env.CRUX_LIFE_SHOT, 'set CRUX_LIFE_SHOT=1');

const OUT = join(process.cwd(), '..', 'docs', 'motion');

test('the garden drains when quiet and warms up as you work', async () => {
  test.setTimeout(3 * 60_000);
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    await createCrux(page, 'Life');

    // Pin the signal by hand: the two ends of the range, held still, so a
    // still frame can show what a slow fade otherwise hides.
    const pin = (v: number) =>
      page.evaluate((n) => {
        document.documentElement.style.setProperty('--signal-activity', String(n));
      }, v);

    // An unregistered custom property computes to its token stream, not a
    // number, so read the filter the background actually ended up with.
    const saturation = () =>
      page.evaluate(() => {
        const el = document.querySelector(
          'canvas.plasma-ground, .mood-bg-image, .bloom-background',
        );
        if (!el) throw new Error('no background layer on the page');
        const f = getComputedStyle(el).filter;
        const sat = /saturate\(([\d.]+)\)/.exec(f);
        const dim = /brightness\(([\d.]+)\)/.exec(f);
        if (!sat || !dim) throw new Error(`background filter is missing a part: ${f}`);
        return { sat: Number(sat[1]), dim: Number(dim[1]) };
      });

    // Both shots have to be of the same loaded workspace, or the pair shows
    // the panes filling in rather than the colour changing.
    await page.getByPlaceholder('Send a message...').waitFor();
    await expect(page.getByText('Your creation will appear here')).toBeVisible();

    mkdirSync(OUT, { recursive: true });

    await pin(0);
    await page.waitForTimeout(400);
    const quiet = await saturation();
    await page.screenshot({ path: join(OUT, 'life-quiet.png') });

    await pin(1);
    await page.waitForTimeout(400);
    const busy = await saturation();
    await page.screenshot({ path: join(OUT, 'life-busy.png') });

    // Both have to actually move, or the stills are two of the same thing.
    expect(quiet.sat).toBeLessThan(busy.sat);
    expect(quiet.dim).toBeLessThan(busy.dim);
    expect(busy.sat).toBeCloseTo(1, 2);
    expect(busy.dim).toBeCloseTo(1, 2);
    writeFileSync(
      join(OUT, 'life.txt'),
      `quiet saturate=${quiet.sat} brightness=${quiet.dim}\n` +
        `busy  saturate=${busy.sat} brightness=${busy.dim}\n`,
    );
  } finally {
    await app.close();
  }
});
