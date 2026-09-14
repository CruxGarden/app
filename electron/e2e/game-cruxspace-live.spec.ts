import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import {
  home,
  nativeReady,
  member,
  open,
  openWorkshop,
  snapshot,
  outputs,
  nativeRecord,
  kanBoards,
  tone,
  importPiskelArt,
} from './game-cruxspace-helpers';

/**
 * Glow Garden with a real collaborator (GAME-CRUXSPACE-PLAN.md §8).
 *
 * The scripted journey (game-cruxspace.spec.ts) proves the tools with the mock
 * model. This one hands the same asks, in plain words, to a real provider and
 * checks outcomes on disk, not wording. Run it with your own key:
 *
 *   CRUX_E2E_AI_KEY=sk-ant-... npm run test:e2e:live
 *
 * The key enters the app through Settings like a person's would, lives in the
 * isolated test garden's secret store, and is never printed. Tracing is off so
 * no trace holds it. Publishing still goes to the local mock API.
 */
const KEY = process.env.CRUX_E2E_AI_KEY;
const PROVIDER = process.env.CRUX_E2E_AI_PROVIDER ?? 'Anthropic';
const PLACEHOLDER: Record<string, string> = { Anthropic: 'sk-ant-...' };
const ACTIVE = new Set(['queued', 'planning', 'running', 'paused', 'checking']);
const TURN_TIMEOUT = 15 * 60_000;

test.use({ trace: 'off' });
test.skip(!KEY, 'Set CRUX_E2E_AI_KEY to run the journey with a real collaborator.');

/** Send one ask and wait for the turn to end; nudge past the tool-round cap a few times. */
async function ask(page: Page, message: string, continues = 3): Promise<string> {
  const collab = page.getByRole('button', { name: 'Toggle collaboration' });
  if ((await collab.getAttribute('aria-pressed')) !== 'true') await collab.click();
  const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
  const box = page.getByPlaceholder('Send a message...');
  let text = message;
  for (let round = 0; round <= continues; round++) {
    await box.fill(text);
    await box.press('Enter');
    await expect
      .poll(async () => (await storedCrux(page, id)).turnJob?.status ?? 'done', {
        timeout: TURN_TIMEOUT,
        intervals: [1000, 2000, 5000],
      })
      .not.toMatch(new RegExp(`^(${[...ACTIVE].join('|')})$`));
    const job = (await storedCrux(page, id)).turnJob;
    if (job?.status === 'failed')
      throw new Error(`The collaborator's turn failed: ${job.error ?? 'no error recorded'}`);
    const capped = await page.getByText(/Stopped after \d+ tool rounds/).count();
    if (!capped) break;
    text = 'Please continue where you left off and finish the task.';
  }
  const messages = ((await storedCrux(page, id)).messages ?? []) as {
    role: string;
    content?: string;
  }[];
  return (
    [...messages]
      .reverse()
      .find((m) => m.role === 'assistant')
      ?.content?.trim() ?? ''
  );
}

async function addProviderKey(page: Page) {
  await page.keyboard.press('ControlOrMeta+,');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.locator('h2', { hasText: /^AI$/ }).click();
  const aiSwitch = page.getByRole('switch', { name: 'Enable AI Tools' });
  if ((await aiSwitch.getAttribute('aria-checked')) !== 'true') await aiSwitch.click();
  const card = page.locator('div.p-4.space-y-3', {
    has: page.getByRole('link', { name: PROVIDER }),
  });
  await card.getByPlaceholder(PLACEHOLDER[PROVIDER] ?? '...').fill(KEY!);
  await card.getByRole('button', { name: 'Save' }).click();
  await expect(card.getByRole('button', { name: 'Remove' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCount(0);
}

test('Glow Garden with a real collaborator: plan, board, sprites, sound, game, export, site, done', async () => {
  test.setTimeout(90 * 60_000);
  const api = await startMockApi();
  const first = await launchApp({ env: { CRUX_API_URL: api.url } });
  const evidence = resolve(__dirname, '../../docs/game-cruxspace/live');
  mkdirSync(evidence, { recursive: true });
  const shot = (name: string) => first.page.screenshot({ path: join(evidence, `${name}.png`) });
  const chime = join(first.dir, 'chime.wav');
  const art = (name: string) => resolve(__dirname, 'fixtures/glow-garden', name);
  writeFileSync(chime, tone());
  const members: Record<string, { id: string; folder: string; title: string }> = {};
  const replies: Record<string, string> = {};
  try {
    const { page } = first;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 2000, height: 1200 });
    page.on('console', (m) => {
      if (m.type() === 'error' && !/404/.test(m.text())) console.log('APP:', m.text());
    });
    await enterGarden(page);
    await addProviderKey(page);

    await test.step('1. Members and the Cruxspace', async () => {
      members.plan = await member(page, /^Notes/, 'Glow Garden plan');
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
    });

    await test.step('2. Plan', async () => {
      await open(page, 'Glow Garden plan');
      replies.plan = await ask(
        page,
        'Write the Glow Garden plan as a note at notebook/Glow Garden plan.md: a one-room top-down pixel game where the gardener collects glowing seeds. Sections: Rules, Assets (gardener walk sheet, seed, ground, pickup chime), Milestones (first playable, chime merged, published).',
      );
      await expect
        .poll(() => existsSync(join(members.plan.folder, 'notebook/Glow Garden plan.md')))
        .toBe(true);
      const plan = readFileSync(join(members.plan.folder, 'notebook/Glow Garden plan.md'), 'utf8');
      expect(plan.toLowerCase()).toContain('milestone');
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
      replies.board = await ask(
        page,
        'Inspect the Kan board, then add one card to each of the lists Art, Sound, World, Logic and Website describing the work for the Glow Garden game (draw the gardener sheet, make the pickup chime, build the room in GDevelop, collision removes the seed and plays the chime, publish the play page). Leave Done empty.',
      );
      await expect
        .poll(() => {
          const lists = kanBoards(members.board.folder)[0]?.lists ?? [];
          return lists.filter((l: any) => l.name !== 'Done' && l.cards.length > 0).length;
        })
        .toBe(5);
      await snapshot(page, 'Board');
      await shot('03-board');
    });

    await test.step('4. Sprites', async () => {
      await open(page, 'Glow Garden sprites');
      const piskel = await nativeReady(page);
      await importPiskelArt(page, piskel, art('gardener-sheet.png'), { width: 32, height: 32 });
      replies.sprite = await ask(
        page,
        'Set the animation speed to 8 fps, then save this sprite sheet to the Cruxspace with the name "Gardener sheet".',
      );
      await expect
        .poll(() => outputs(members.sprites.folder).map((o) => o.label))
        .toContain('Gardener sheet');
      await snapshot(page, 'First sprite');
      await shot('04-sprites');
      await open(page, 'Glow Garden seed');
      const seed = await nativeReady(page);
      await importPiskelArt(page, seed, art('seed.png'));
      replies.seed = await ask(
        page,
        'Save this sprite to the Cruxspace with the name "Seed sprite".',
      );
      await expect
        .poll(() => outputs(members.seed.folder).map((o) => o.label))
        .toContain('Seed sprite');
      await open(page, 'Glow Garden ground');
      const ground = await nativeReady(page);
      await importPiskelArt(page, ground, art('garden-ground.png'));
      replies.ground = await ask(
        page,
        'Save this image to the Cruxspace with the name "Garden ground".',
      );
      await expect
        .poll(() => outputs(members.ground.folder).map((o) => o.label))
        .toContain('Garden ground');
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
        .poll(
          () =>
            !!JSON.parse(readFileSync(join(members.sound.folder, 'data/project.json'), 'utf8'))
              .project?.waveform,
        )
        .toBe(true);
      replies.sound = await ask(
        page,
        'Save this audio to the Cruxspace with the name "Pickup chime".',
      );
      await expect
        .poll(() => outputs(members.sound.folder).map((o) => o.label))
        .toContain('Pickup chime');
      await snapshot(page, 'First sound');
      await shot('05-sound');
    });

    await test.step('6. Game on Main', async () => {
      await open(page, 'Glow Garden game');
      await nativeReady(page);
      replies.assemble = await ask(
        page,
        [
          'Assemble the room from the Cruxspace outputs. List the Cruxspace assets, then:',
          '1. Use "Garden ground" as assets/ground.png and add a sprite object named exactly Ground with one instance at 0,0.',
          '2. Use "Gardener sheet" as assets/gardener.png and add a sprite object named exactly Gardener, slicing the sheet into 32×32 frames at 8 fps, with the TopDownMovement behavior, and one instance at 384,284.',
          '3. Use "Seed sprite" as assets/seed.png and add a sprite object named exactly Seed (no instances yet).',
          'Use the GDevelop tools for every step; do not edit JSON by hand.',
        ].join('\n'),
      );
      const game = () => nativeRecord(members.game.folder, 'document');
      await expect
        .poll(() => game()?.layouts?.[0]?.objects?.map((o: any) => o.name) ?? [])
        .toEqual(expect.arrayContaining(['Ground', 'Gardener', 'Seed']));
      const gardener = game().layouts[0].objects.find((o: any) => o.name === 'Gardener');
      expect(gardener.animations[0].directions[0].sprites.length).toBeGreaterThan(1);
      expect(gardener.behaviors.map((b: any) => b.type)).toContain(
        'TopDownMovementBehavior::TopDownMovementBehavior',
      );
      expect(game().layouts[0].instances.length).toBeGreaterThanOrEqual(2);
      await snapshot(page, 'First playable');
      await shot('06-game-main');
    });

    await test.step('7. Game on a Task, merged into Main', async () => {
      await page.getByRole('button', { name: 'New task', exact: true }).click();
      await page.getByRole('textbox', { name: 'Task name', exact: true }).fill('Add pickup chime');
      await page.getByRole('button', { name: 'Save and start task' }).click();
      await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible({
        timeout: 300000,
      });
      await openWorkshop(page);
      await nativeReady(page);
      replies.chime = await ask(
        page,
        [
          'On this Task: use the Cruxspace output "Pickup chime" as assets/chime.wav and add it as a GDevelop audio resource named chime.',
          'Place three instances of Seed at (160,420), (380,420) and (600,420).',
          'Add an event: when Gardener collides with Seed, delete the Seed and play the sound chime.',
          'Set the game name to "Glow Garden".',
        ].join('\n'),
      );
      await page.getByRole('button', { name: 'Review changes', exact: true }).click();
      const review = page.getByRole('dialog', { name: 'Review changes for Main' });
      await expect(review).toBeVisible({ timeout: 300000 });
      await review.getByRole('button', { name: 'Check combined result' }).click();
      await expect(review.getByRole('checkbox')).toBeEnabled({ timeout: 300000 });
      await review.getByRole('checkbox').check();
      await review.getByRole('button', { name: 'Merge into Main', exact: true }).click();
      await expect(review).toHaveCount(0, { timeout: 300000 });
      await expect(page.locator('[data-workspace-id]')).toHaveAttribute(
        'data-workspace-id',
        members.game.id,
        {
          timeout: 120000,
        },
      );
      const game = () => nativeRecord(members.game.folder, 'document');
      await expect.poll(() => game()?.layouts?.[0]?.events?.length ?? 0).toBeGreaterThanOrEqual(1);
      expect(game().layouts[0].instances.length).toBeGreaterThanOrEqual(5);
      expect(game().resources.resources.map((r: any) => r.name)).toContain('chime');
      expect(game().properties.name).toBe('Glow Garden');
      await snapshot(page, 'Chime merged');
      await shot('07-game-merged');
    });

    await test.step('8. Export the web game to the Cruxspace', async () => {
      await openWorkshop(page);
      await nativeReady(page);
      replies.export = await ask(
        page,
        'Export the web game and save the build to the Cruxspace with the name "Glow Garden web build".',
      );
      await expect
        .poll(() => outputs(members.game.folder).map((o) => o.mimeType))
        .toContain('application/zip');
    });

    await test.step('9. The site receives the game and gets a play page', async () => {
      await open(page, 'Glow Garden site');
      replies.site = await ask(
        page,
        [
          'Use the Cruxspace output "Glow Garden web build" and unpack it into public/game.',
          'Then write src/pages/play.astro: an h1 "Glow Garden", one line of instructions, and an iframe titled "Glow Garden game" that loads /game/index.html at 800×600, plus a short Credits section saying it was made in a Crux Garden Cruxspace.',
        ].join('\n'),
      );
      await expect
        .poll(() => existsSync(join(members.site.folder, 'public/game/index.html')))
        .toBe(true);
      expect(readFileSync(join(members.site.folder, 'src/pages/play.astro'), 'utf8')).toContain(
        'game/index.html',
      );
      await snapshot(page, 'Site ready');
      await shot('09-site');
    });

    await test.step('10. Board: everything moves to Done', async () => {
      await open(page, 'Glow Garden board');
      await nativeReady(page);
      replies.done = await ask(page, 'Inspect the board and move every card into the Done list.');
      await expect
        .poll(() => {
          const lists = kanBoards(members.board.folder)[0].lists;
          const done = lists.find((l: any) => l.name === 'Done');
          const elsewhere = lists
            .filter((l: any) => l.name !== 'Done')
            .flatMap((l: any) => l.cards);
          return [done.cards.filter((c: any) => !c.deletedAt).length, elsewhere.length];
        })
        .toEqual([5, 0]);
      await shot('10-done');
    });

    await test.step('11. The story holds together', async () => {
      await home(page);
      await page
        .getByRole('combobox', { name: 'Cruxspace', exact: true })
        .selectOption({ label: 'Glow Garden' });
      await page.getByRole('button', { name: 'Cruxspace history', exact: true }).click();
      const story = page.getByRole('dialog', { name: 'Cruxspace history' });
      await expect(story).toContainText(
        /8 members · \d+ milestones · [5-9]\d* transfers between members/,
        {
          timeout: 60000,
        },
      );
      await shot('11-story');
    });
  } finally {
    writeFileSync(join(evidence, 'replies.json'), JSON.stringify(replies, null, 2));
    console.log('Live run garden:', first.dir);
    await first.app.close();
    await api.close();
  }
});
