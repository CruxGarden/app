import { test, expect, chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden } from './multi-crux-helpers';
import {
  home,
  frame,
  nativeReady,
  member,
  open,
  openWorkshop,
  collaborator,
  snapshot,
  outputs,
  nativeRecord,
  kanBoards,
  tone,
  importPiskelArt,
} from './game-cruxspace-helpers';

/**
 * Glow Garden — a 2D pixel game made across Crux Tools in one Cruxspace by a
 * person and the scripted collaborator (GAME-CRUXSPACE-PLAN.md §7).
 * Phases A–B: members, plan, board, sprites, sound, the game on Main and on a
 * Task, the web export and the site files. Publish, history and the package
 * follow in later phases.
 */
test('Glow Garden: plan, board, sprites, sound, game, export and site across one Cruxspace', async () => {
  test.setTimeout(1800000);
  const api = await startMockApi();
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1', CRUX_API_URL: api.url } });
  const evidence = resolve(__dirname, '../../docs/game-cruxspace');
  mkdirSync(evidence, { recursive: true });
  const shot = (name: string) => first.page.screenshot({ path: join(evidence, `${name}.png`) });
  const pageErrors: string[] = [];
  const chime = join(first.dir, 'chime.wav');
  const art = (name: string) => resolve(__dirname, 'fixtures/glow-garden', name);
  writeFileSync(chime, tone());
  const members: Record<string, { id: string; folder: string; title: string }> = {};
  try {
    const { page } = first;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 2000, height: 1200 });
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') console.log('APP:', m.text());
    });
    await enterGarden(page);

    await test.step('1. Members and the Cruxspace', async () => {
      members.plan = await member(page, /^Notes/, 'Glow Garden plan');
      await expect(frame(page).getByRole('heading', { name: 'Welcome', exact: true })).toBeVisible(
        { timeout: 120000 },
      );
      members.board = await member(page, /^Kan/, 'Glow Garden board');
      await nativeReady(page);
      members.sprites = await member(page, /^Piskel/, 'Glow Garden sprites');
      await nativeReady(page);
      members.seed = await member(page, /^Piskel/, 'Glow Garden seed');
      await nativeReady(page);
      members.ground = await member(page, /^Piskel/, 'Glow Garden ground');
      await nativeReady(page);
      members.sound = await member(page, /^AudioMass/, 'Glow Garden sound');
      await nativeReady(page);
      members.game = await member(page, /^GDevelop/, 'Glow Garden game');
      await nativeReady(page);
      members.site = await member(page, /^Empty \(Astro\)/, 'Glow Garden site');
      await home(page);
      await page.getByRole('button', { name: 'Create Cruxspace', exact: true }).click();
      await page.getByLabel('Cruxspace name').fill('Glow Garden');
      await page
        .getByLabel('Shared brief')
        .fill(
          'A one-room top-down pixel game: the gardener collects glowing seeds. Plan in Tigrana, break it down in Kan, sprites in Piskel, chime in AudioMass, game in GDevelop, page in Astro.',
        );
      for (const m of Object.values(members))
        await page.getByRole('checkbox', { name: m.title, exact: true }).check();
      await page.getByRole('button', { name: 'Save Cruxspace', exact: true }).click();
      await expect(page.getByLabel('Cruxspace', { exact: true })).toContainText('Glow Garden');
      await shot('01-cruxspace');
    });

    await test.step('2. Plan', async () => {
      await open(page, 'Glow Garden plan');
      await collaborator(
        page,
        'Write the plan for our game [game:plan]',
        'Wrote the plan: rules, assets and milestones.',
      );
      await expect
        .poll(() => existsSync(join(members.plan.folder, 'notebook/Glow Garden plan.md')))
        .toBe(true);
      expect(readFileSync(join(members.plan.folder, 'notebook/Glow Garden plan.md'), 'utf8')).toContain(
        '## Milestones',
      );
      await snapshot(page, 'Plan');
      await shot('02-plan');
    });

    await test.step('3. Board', async () => {
      await open(page, 'Glow Garden board');
      const kan = await nativeReady(page);
      await kan.getByRole('button', { name: 'New', exact: true }).click();
      await kan.getByPlaceholder('Name', { exact: true }).fill('Glow Garden');
      await kan.getByRole('button', { name: 'Create board', exact: true }).click();
      for (const name of ['Art', 'Sound', 'World', 'Logic', 'Website', 'Done']) {
        await kan.getByRole('button', { name: 'New list', exact: true }).click();
        await kan.getByPlaceholder('List name').fill(name);
        await kan.getByRole('button', { name: 'Create list', exact: true }).click();
        await kan
          .getByRole('textbox', { name: 'List name', exact: true })
          .filter({ visible: true })
          .last()
          .waitFor();
      }
      await kan.getByRole('button', { name: 'Save project', exact: true }).click();
      await nativeReady(page, 30000);
      await collaborator(
        page,
        'Break the plan into cards [game:board]',
        'Added a card to every list from the plan.',
      );
      await expect
        .poll(() =>
          kanBoards(members.board.folder)[0]?.lists.flatMap((l: any) =>
            l.cards.map((c: any) => c.title),
          ),
        )
        .toHaveLength(6);
      await snapshot(page, 'Board');
      await shot('03-board');
    });

    await test.step('4. Sprites', async () => {
      await open(page, 'Glow Garden sprites');
      const piskel = await nativeReady(page);
      // The authored walk cycle enters Piskel through its own import wizard as a 32×32 sheet;
      // a person then touches one pixel so the Crux's history shows a real edit.
      await importPiskelArt(page, piskel, art('gardener-sheet.png'), { width: 32, height: 32 });
      await piskel.locator('[data-tool-id=tool-pen]').click();
      await piskel.locator('#drawing-canvas-container').click({ position: { x: 180, y: 400 }, delay: 100 });
      await collaborator(
        page,
        'Set the walk speed and share the sheet [game:sprite]',
        'Set the walk speed and saved the sheet to the Cruxspace.',
      );
      await expect.poll(() => outputs(members.sprites.folder).map((o) => o.label)).toEqual([
        'Gardener sheet',
      ]);
      await snapshot(page, 'First sprite');
      await shot('04-sprites');
      await open(page, 'Glow Garden seed');
      const seed = await nativeReady(page);
      await importPiskelArt(page, seed, art('seed.png'));
      await collaborator(page, 'Share the seed [game:seed]', 'Saved the seed sprite to the Cruxspace.');
      await expect.poll(() => outputs(members.seed.folder).map((o) => o.label)).toEqual([
        'Seed sprite',
      ]);
      await open(page, 'Glow Garden ground');
      const ground = await nativeReady(page);
      await importPiskelArt(page, ground, art('garden-ground.png'));
      await collaborator(page, 'Share the ground [game:ground]', 'Saved the garden ground to the Cruxspace.');
      await expect.poll(() => outputs(members.ground.folder).map((o) => o.label)).toEqual([
        'Garden ground',
      ]);
    });

    await test.step('5. Sound', async () => {
      await open(page, 'Glow Garden sound');
      const audio = await nativeReady(page);
      const welcome = audio.locator('.pk_modal');
      if (await welcome.count()) await welcome.getByText('OK', { exact: true }).click();
      await audio.getByText('File', { exact: true }).first().click();
      const chooser = page.waitForEvent('filechooser');
      await audio.getByText('Load from Computer', { exact: true }).click();
      await (await chooser).setFiles(chime);
      await expect
        .poll(() => !!JSON.parse(readFileSync(join(members.sound.folder, 'data/project.json'), 'utf8')).project?.waveform)
        .toBe(true);
      await collaborator(page, 'Share the chime [game:sound]', 'Saved the chime to the Cruxspace.');
      await expect.poll(() => outputs(members.sound.folder).map((o) => o.mimeType)).toEqual([
        'audio/wav',
      ]);
      await snapshot(page, 'First sound');
      await shot('05-sound');
    });

    await test.step('6. Game on Main: a person copies the seed by hand, the collaborator assembles', async () => {
      await open(page, 'Glow Garden game');
      await nativeReady(page);
      await page.getByRole('button', { name: 'Cruxspace assets', exact: true }).click();
      await page.getByRole('button', { name: 'Use Seed sprite', exact: true }).click();
      await page.getByLabel('Destination path').fill('assets/seed-manual.png');
      await page.getByRole('button', { name: 'Copy selected version', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Copied Seed sprite' })).toBeVisible();
      // Escape reaches the host only while the host has focus; the dialog's own control always works.
      await page.getByRole('button', { name: 'Close', exact: true }).last().click();
      await expect(page.getByRole('button', { name: 'Use Seed sprite', exact: true })).toHaveCount(0);
      expect(existsSync(join(members.game.folder, 'assets/seed-manual.png'))).toBe(true);
      await collaborator(
        page,
        'Build the gardener and the seed from our sprites [game:assemble]',
        'Built the gardener and seed from the Cruxspace sprites and named the game.',
      );
      const game = () => nativeRecord(members.game.folder, 'document');
      await expect
        .poll(() => game()?.layouts?.[0]?.objects?.map((o: any) => o.name))
        .toEqual(['Ground', 'Gardener', 'Seed']);
      const objects = game().layouts[0].objects;
      expect(objects[1].animations[0].directions[0].sprites).toHaveLength(4);
      expect(objects[1].behaviors.map((b: any) => b.type)).toContain(
        'TopDownMovementBehavior::TopDownMovementBehavior',
      );
      expect(game().layouts[0].instances).toHaveLength(2);
      await snapshot(page, 'First playable');
      await shot('06-game-main');
    });

    await test.step('7. Game on a Task: the chime, seeds and the pickup rule, merged into Main', async () => {
      await page.getByRole('button', { name: 'New task', exact: true }).click();
      await page.getByRole('textbox', { name: 'Task name', exact: true }).fill('Add pickup chime');
      await page.getByRole('button', { name: 'Save and start task' }).click();
      // The game Crux carries GDevelop's source tree; preparing its Working Copy takes a while.
      await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible({
        timeout: 300000,
      });
      await openWorkshop(page);
      await nativeReady(page);
      await collaborator(
        page,
        'Add the chime and the pickup rule [game:chime]',
        'Placed three seeds and added the pickup rule with the chime.',
      );
      await page.getByRole('button', { name: 'Review changes', exact: true }).click();
      const review = page.getByRole('dialog', { name: 'Review changes for Main' });
      await expect(review).toBeVisible({ timeout: 300000 }); // captures and diffs the whole candidate
      await review.getByRole('button', { name: 'Check combined result' }).click();
      await expect(review.getByRole('checkbox')).toBeEnabled({ timeout: 300000 });
      await review.getByRole('checkbox').check();
      await review.getByRole('button', { name: 'Merge into Main', exact: true }).click();
      await expect(review).toHaveCount(0, { timeout: 300000 });
      await expect(page.locator('[data-workspace-id]')).toHaveAttribute(
        'data-workspace-id',
        members.game.id,
        { timeout: 120000 },
      );
      const game = () => nativeRecord(members.game.folder, 'document');
      await expect.poll(() => game()?.layouts?.[0]?.events?.length).toBe(1);
      expect(game().layouts[0].instances).toHaveLength(5);
      expect(game().resources.resources.map((r: any) => r.name)).toContain('chime');
      expect(game().properties.name).toBe('Glow Garden');
      await snapshot(page, 'Chime merged');
      await shot('07-game-merged');
    });

    await test.step('8. Export the web game to the Cruxspace', async () => {
      await openWorkshop(page);
      await nativeReady(page);
      await collaborator(page, 'Export the game [game:export]', 'Exported the web game to the Cruxspace.');
      await expect.poll(() => outputs(members.game.folder).map((o) => o.mimeType)).toEqual([
        'application/zip',
      ]);
    });

    await test.step('9. The site receives the game and gets a play page', async () => {
      await open(page, 'Glow Garden site');
      await collaborator(
        page,
        'Put the game on the site [game:site]',
        'Unpacked the game into public/game and wrote the play page.',
      );
      await expect.poll(() => existsSync(join(members.site.folder, 'public/game/index.html'))).toBe(true);
      expect(readFileSync(join(members.site.folder, 'src/pages/play.astro'), 'utf8')).toContain(
        '/game/index.html',
      );
      await snapshot(page, 'Site ready');
      await shot('09-site');
    });

    await test.step('9b. The live preview plays the game', async () => {
      await openWorkshop(page);
      // The Astro dev server installs dependencies on first start.
      const preview = page.locator('iframe[src^="http://127.0.0.1"]');
      await expect(preview).toBeVisible({ timeout: 4 * 60_000 });
      const origin = new URL((await preview.getAttribute('src'))!).origin;
      const browser = await chromium.launch();
      try {
        const site = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await site.goto(`${origin}/play`);
        await expect(site.getByRole('heading', { name: 'Glow Garden', level: 1 })).toBeVisible({
          timeout: 120000,
        });
        await expect(site.frameLocator('iframe[title="Glow Garden game"]').locator('canvas')).toBeVisible({
          timeout: 120000,
        });
        await site.waitForTimeout(2500); // let the runtime draw its first frames
        await site.screenshot({ path: join(evidence, '09b-site-preview.png') });
      } finally {
        await browser.close();
      }
    });

    await test.step('11. Publish through the Share pane; the published files boot the game', async () => {
      await page.getByRole('button', { name: 'Toggle share' }).click();
      await page.getByRole('button', { name: 'Share', exact: true }).click();
      await page.getByPlaceholder('email@example.com').fill('tester@example.com');
      await page.getByRole('button', { name: 'Send Code' }).click();
      await page.getByPlaceholder('Enter code').fill('123456');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      const backupAsk = page.getByRole('dialog').filter({ hasText: 'A published site is not a backup' });
      await expect(backupAsk).toBeVisible({ timeout: 60000 });
      await backupAsk.getByRole('button', { name: 'Back up and share' }).click();
      await expect(page.getByText('Up to date')).toBeVisible({ timeout: 6 * 60_000 });
      const published = api.state.published[members.site.id] ?? [];
      const paths = published.map((f) => f.path);
      expect(paths).toContain('game/index.html');
      expect(paths.some((p) => /^play\/index\.html$|^play\.html$/.test(p))).toBe(true);
      // Serve exactly what was published and load the play page in a fresh browser.
      const server = createServer((request, response) => {
        const name = decodeURIComponent(new URL(request.url!, 'http://x').pathname).replace(/^\/+/, '');
        const file =
          published.find((f) => f.path === name) ??
          published.find((f) => f.path === `${name.replace(/\/$/, '')}/index.html`.replace(/^\//, '')) ??
          published.find((f) => f.path === (name ? `${name}/index.html` : 'index.html'));
        if (!file) {
          response.writeHead(404);
          response.end();
          return;
        }
        response.setHeader('Content-Type', file.mime || 'application/octet-stream');
        response.end(file.bytes);
      });
      await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
      const browser = await chromium.launch();
      try {
        const port = (server.address() as { port: number }).port;
        const site = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const errors: string[] = [];
        site.on('pageerror', (e) => errors.push(e.message));
        await site.goto(`http://127.0.0.1:${port}/play/`);
        await expect(site.getByRole('heading', { name: 'Glow Garden', level: 1 })).toBeVisible();
        await expect(site.frameLocator('iframe[title="Glow Garden game"]').locator('canvas')).toBeVisible({
          timeout: 120000,
        });
        await site.waitForTimeout(2500);
        await site.screenshot({ path: join(evidence, '11-published.png') });
        expect(errors).toEqual([]);
      } finally {
        await browser.close();
        server.close();
      }
      await page.getByRole('button', { name: 'Toggle share' }).click();
      await snapshot(page, 'Published');
    });

    await test.step('12. Walk the game Crux history in Whole Crux Growth, view an earlier checkpoint, return', async () => {
      await open(page, 'Glow Garden game');
      await openWorkshop(page);
      await nativeReady(page);
      const collab = page.getByRole('button', { name: 'Toggle collaboration' });
      if ((await collab.getAttribute('aria-pressed')) === 'true') await collab.click();
      const pane = page.getByTestId('pane-body-history');
      if (!(await pane.isVisible())) await page.getByRole('button', { name: 'Toggle history' }).click();
      await expect(pane).toBeVisible();
      await pane.getByRole('button', { name: 'Whole Crux · branches & merges' }).click();
      const graph = page.getByRole('dialog', { name: 'Whole Crux Growth' });
      await expect(graph).toBeVisible();
      await expect(graph.getByRole('button', { name: 'Add pickup chime · merged', exact: true })).toBeVisible();
      await expect(graph.getByTestId('growth-canvas-2d').locator('canvas')).toBeVisible();
      await graph.getByRole('button', { name: 'Expand checkpoints', exact: true }).click();
      for (const label of ['First playable', 'Chime merged', 'Output: Glow Garden web build']) {
        await graph.getByLabel('Find checkpoint').fill(label);
        await graph.getByRole('button', { name: new RegExp(`^${label} `) }).first().click();
        await expect(graph.getByTestId('growth-inspector')).toContainText(label);
      }
      await graph.getByLabel('Find checkpoint').fill('');
      await graph.getByRole('button', { name: 'Fit graph', exact: true }).click();
      await shot('12-history-graph');
      await page.keyboard.press('Escape');
      await expect(graph).toHaveCount(0);
      // View the first playable checkpoint from the timeline, then come back to the current files.
      await pane.getByText('First playable', { exact: true }).first().click(); // the card's label, not its thumbnail
      await expect(page.getByText(/Viewing snapshot \d+ of \d+/)).toBeVisible({ timeout: 60000 });
      await shot('12-viewing-first-playable');
      await pane.getByRole('button', { name: 'Back to current' }).click();
      await expect(page.getByText(/Viewing snapshot \d+ of \d+/)).toHaveCount(0);
      await page.getByRole('button', { name: 'Toggle history' }).click();
    });

    await test.step('10. Board: everything moves to Done', async () => {
      await open(page, 'Glow Garden board');
      await nativeReady(page);
      await collaborator(page, 'Close the board [game:done]', 'Moved every card to Done.');
      await expect
        .poll(() => {
          const lists = kanBoards(members.board.folder)[0].lists;
          const done = lists.find((l: any) => l.name === 'Done');
          return done.cards.filter((c: any) => !c.deletedAt).length;
        })
        .toBe(6);
      await shot('10-done');
    });
    expect(pageErrors).toEqual([]);
  } finally {
    await first.app.close();
    await api.close();
  }
});
