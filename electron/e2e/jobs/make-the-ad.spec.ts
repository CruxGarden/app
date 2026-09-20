import { test, expect, type Page } from '@playwright/test';
import type { ElectronApplication, DownloadItem } from 'playwright';
import { readFileSync, existsSync, mkdirSync, cpSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from '../launch';
import { enterGarden, createCrux } from '../multi-crux-helpers';

/**
 * Make the ad with Crux Garden (Daniel, 2026-09-20: "Use Crux Garden to make
 * the ad"). A real session: the desktop app in an isolated garden, Claude Code
 * as the collaborator in the Collaboration pane, the campaign brief as the
 * message, tools approved as they ask, a labelled snapshot, and the crux
 * exported so the conversation that made it travels with it. Opt-in:
 * CRUX_MAKE_AD=1. Needs `claude` on the machine and a signed-in Claude Code.
 */
test.skip(!process.env.CRUX_MAKE_AD, 'set CRUX_MAKE_AD=1');

const ROOT = join(__dirname, '..', '..', '..', '..');
const OUT = join(ROOT, 'ads', 'what-are-you-doing', 'made-with-crux-garden');

function cruxFolder(dir: string): string {
  const garden = join(dir, 'garden');
  const [first] = readdirSync(garden);
  if (!first) throw new Error('no crux folder yet');
  return join(garden, first);
}

async function ensurePane(page: Page, type: string, toggle: string) {
  const body = page.getByTestId(`pane-body-${type}`);
  if (!(await body.isVisible().catch(() => false)))
    await page.getByRole('button', { name: toggle }).click();
  await expect(body).toBeVisible({ timeout: 30_000 });
}

/** Approve whatever the agent asks for, until the composer is back to Send. */
async function runTurn(page: Page, message: string, minutes: number) {
  const composer = page.getByPlaceholder('Send a message...');
  await composer.fill(message);
  await composer.press('Enter');
  // Two Stops exist while a turn runs (the composer's and the job card's):
  // a strict locator would throw and read as "finished". Take the composer's.
  const stop = page.getByTestId('composer').getByRole('button', { name: 'Stop', exact: true });
  await expect(stop).toBeVisible({ timeout: 60_000 });
  const deadline = Date.now() + minutes * 60_000;
  let lastShot = 0;
  while (Date.now() < deadline) {
    // A picture every half minute: the only window into a turn nobody is watching.
    if (Date.now() - lastShot > 30_000) {
      lastShot = Date.now();
      await page.screenshot({ path: join(OUT, 'live.png') }).catch(() => {});
      const pending = await page.getByTestId('agent-approvals').count();
      console.log(`${new Date().toISOString()} approvals block: ${pending}`);
    }
    const allow = page
      .getByTestId('agent-approvals')
      .getByRole('button', { name: /^(Allow|Publish)$/ });
    if (
      await allow
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await allow.first().click();
      await page.waitForTimeout(500);
      continue;
    }
    if (!(await stop.isVisible().catch(() => false))) return;
    await page.waitForTimeout(2000);
  }
  throw new Error('the turn did not finish in time');
}

test('make the ad with Crux Garden', async () => {
  test.setTimeout(45 * 60_000);
  const brief = readFileSync(join(ROOT, 'WHAT-ARE-YOU-DOING-IN-YOUR-GARDEN.md'), 'utf8');
  const { app, page, dir } = await launchApp();
  mkdirSync(OUT, { recursive: true });
  try {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);
    const id = await createCrux(page, 'What are you doing in your Garden?');
    await ensurePane(page, 'collaboration', 'Toggle collaboration');

    // Claude Code is the collaborator.
    await page.getByTestId('pane-body-collaboration').getByTestId('model-selector').click();
    await page
      .getByTestId('model-group-claude-code')
      .getByRole('button', { name: 'Claude Code' })
      .click();
    await expect(
      page.getByTestId('pane-body-collaboration').getByRole('button', { name: /Claude Code/ }),
    ).toBeVisible();

    // The brief goes in as a file the collaborator reads, not as a wall in the
    // composer: a person would drop it into Artifacts the same way.
    writeFileSync(join(cruxFolder(dir), 'BRIEF.md'), brief);
    const message = [
      'Make our thirty-second spot as a web page in this crux — the ad is a Crux, so it can be published and "How was this made?" will show this conversation.',
      '',
      'Write index.html (self-contained, no build, no external requests) that plays a timeline of scenes with slow crossfades: the question "What are you doing in your Garden?" first, then one scene per answer below, each holding a beat too long (about 3 seconds), ending on Daniel\'s answer "Made this ad." with a small tail line "Crux Garden · build cool shit · crux.garden · How was this made?". No logo card after it.',
      'Register: serious, deadpan, like a bank commercial; dark mossy green background (#071a12) with a green accent (#5fd2a5), a serif for the lines (Cormorant Garamond, Georgia fallback), a small uppercase monospace caption naming who is speaking. Each answer has a simple line-drawn SVG face, deadpan, in a consistent style; give each its one identifying detail (a tie, headphones, glasses, a Batman cowl, a beard and an axe, a founder, and Daniel last with a green leaf).',
      'Add a play cover for people (tap to start) and start at once when the URL has ?auto=1; set document.body.dataset.done = "1" after the last scene so a renderer can stop recording. Add a short README.md saying what this is.',
      'Then take a snapshot labelled "Made this ad".',
      '',
      'The brief is BRIEF.md in this folder — read it first.',
    ].join('\n');

    await runTurn(page, message, 25);
    await page.screenshot({ path: join(OUT, '1-collaboration.png') });

    // Step 2 (MAKING-IT-POSSIBLE-STEPS): render it inside — frames, then the
    // crux's own run_ffmpeg tool (found with garden_search_tools) to exports/ad.mp4.
    await runTurn(
      page,
      [
        'Now render the spot to a video inside this crux. Make the frames (headless Chrome at 30 fps into frames/f%04d.png, ?auto=1, until document.body.dataset.done is "1"),',
        'then call the crux tool run_ffmpeg — find it with garden_search_tools("ffmpeg") and call it with garden_call_tool — to write exports/ad.mp4 (libx264, yuv420p, -y).',
        'Do not run ffmpeg yourself; the crux tool runs the bundled one inside this folder. Tell me the duration when it is done.',
      ].join(' '),
      25,
    );
    await page.screenshot({ path: join(OUT, '1b-rendered.png') });

    // The ad in the Workshop preview.
    await ensurePane(page, 'workshop', 'Toggle workshop');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: join(OUT, '2-workshop.png') });

    // History: the snapshot the agent took, or one we take now.
    await ensurePane(page, 'history', 'Toggle history');
    const history = page.getByTestId('pane-body-history');
    if (
      !(await history
        .getByText('Made this ad', { exact: true })
        .isVisible()
        .catch(() => false))
    ) {
      await history.getByRole('button', { name: 'Take snapshot', exact: true }).click();
      await history.getByPlaceholder('Label (optional)').fill('Made this ad');
      await history.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(history.getByText('Made this ad', { exact: true })).toBeVisible({
        timeout: 30_000,
      });
    }
    await page.screenshot({ path: join(OUT, '3-history.png') });

    // Keep the Project Folder as it is on disk.
    const garden = join(dir, 'garden');
    const folder = readdirSync(garden)
      .map((d) => join(garden, d))
      .find((d) => existsSync(join(d, 'index.html')));
    if (folder) cpSync(folder, join(OUT, 'crux-folder'), { recursive: true });

    // Export the crux with its conversation and history.
    const destination = join(OUT, 'what-are-you-doing.crux');
    await (app as ElectronApplication).evaluate(({ session }, path) => {
      const state = globalThis as unknown as { __cruxDownload?: string };
      state.__cruxDownload = undefined;
      const listener = (_event: Event, item: DownloadItem) => {
        if (!item.getFilename().endsWith('.crux')) return;
        session.defaultSession.removeListener('will-download', listener);
        item.setSavePath(path);
        item.once('done', (_event, result) => {
          state.__cruxDownload = result;
        });
      };
      session.defaultSession.on('will-download', listener);
    }, destination);
    await ensurePane(page, 'export', 'Toggle export');
    await page
      .getByTestId('pane-body-export')
      .getByRole('button', { name: /^Export/ })
      .first()
      .click();
    await expect
      .poll(
        () =>
          app.evaluate(() => (globalThis as unknown as { __cruxDownload?: string }).__cruxDownload),
        { timeout: 180_000 },
      )
      .toBe('completed');
    console.log(`made: crux ${id} in ${dir}; export ${destination}`);
  } finally {
    await app.close();
  }
});
