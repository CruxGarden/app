import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from '../launch';
import {
  enterGarden,
  createCrux,
  addArtifact,
  goHome,
  storedCrux,
  switchCrux,
} from '../multi-crux-helpers';
import { enableAi, showPane, hidePane } from '../panel-helpers';

/**
 * V1-TESTING-GUIDE § 21 · Garden Collaboration (the Keeper), with the
 * scripted model (CRUX_AI_MOCK). Its Keeper scripts: `[garden:plant]`
 * plants "Field notes" with a brief; `[garden:tour]` shows "Tour stop",
 * records a Growth moment and names the garden; `[garden:operate]` looks,
 * searches, reads, chooses a collaborator and exports; `[garden:owned-turn]`
 * pauses mid-turn until the test lets it go; `[garden:grow]` grows "Field
 * study" with a brief and plants "Site A notes" into it;
 * `[garden:undertaking:beside|start]` starts "Pocket game" from the
 * small-game template; `[garden:delegate]` runs Alpha's own collaborator
 * through run_turn; `[garden:mood]` wears Raster Bars. KEEP-01 and KEEP-06
 * are keeper-tour, keeper-operates and garden-collaboration.
 */
const MOCK = { env: { CRUX_AI_MOCK: '1' } };

async function askKeeper(page: Page, text: string) {
  const console_ = await showPane(page, 'Console');
  const composer = console_.getByPlaceholder('Send a message...');
  await composer.fill(text);
  await composer.press('Enter');
  return console_;
}

/** Growth snapshots recorded in the garden. */
const growthCount = (page: Page) =>
  page.evaluate(
    async () =>
      (
        await window.electronAPI!.sqlite.all(
          "SELECT id FROM dimensions WHERE type = 'growth' AND deleted IS NULL",
        )
      ).length,
  );

/** Every tool row of the Keeper's last turn that reported an error. */
const errorRows = (page: Page) =>
  page.getByTestId('pane-body-console').locator('[data-testid="tool-call"][data-error="true"]');

test.describe('guide 21 · The Keeper', () => {
  test('KEEP-02 — the Keeper plants a Crux with a brief that exists in the garden, not only in its reply', async () => {
    const { app, page } = await launchApp(MOCK);
    try {
      await enterGarden(page);
      await enableAi(page);
      const console_ = await askKeeper(
        page,
        '[garden:plant] Plant a notes crux for the field study.',
      );
      await expect(console_.getByText('Planted Field notes with its brief.').first()).toBeVisible({
        timeout: 60_000,
      });
      await hidePane(page, 'Console');
      // Membership is on Home; the brief is a real file and the Crux's instructions.
      const card = page.getByRole('button', { name: 'Open Field notes', exact: true });
      await expect(card).toBeVisible({ timeout: 30_000 });
      const planted = (await page.evaluate(() =>
        window.electronAPI!.sqlite.get("SELECT id FROM cruxes WHERE title = 'Field notes'"),
      )) as { id: string };
      const meta = await storedCrux(page, planted.id);
      expect(meta.settings?.systemPrompt).toBe('Notes from the field study, one page per day.');
      await expect
        .poll(() => existsSync(join(meta.projectFolder as string, 'BRIEF.md')), {
          timeout: 30_000,
        })
        .toBe(true);
      expect(readFileSync(join(meta.projectFolder as string, 'BRIEF.md'), 'utf8')).toContain(
        'Notes from the field study, one page per day.',
      );
      await card.click();
      await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
        'Field notes',
      );
    } finally {
      await app.close();
    }
  });

  test('KEEP-04 — a draft in a Crux survives while the Keeper works in the Garden', async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp(MOCK);
    try {
      await enterGarden(page);
      await enableAi(page);
      await createCrux(page, 'Alpha');
      // A draft the person is in the middle of, in Alpha's own Collaboration.
      const draft = page
        .getByTestId('pane-body-collaboration')
        .getByPlaceholder('Send a message...');
      await draft.fill('My half-written thought for Alpha');
      // The Keeper, from inside this workspace, holds its turn until let go.
      await page.evaluate(() => {
        document.documentElement.dataset.keeperPaused = '';
        window.addEventListener(
          'crux:mock-pause',
          () => {
            document.documentElement.dataset.keeperPaused = 'yes';
          },
          { once: true },
        );
      });
      await askKeeper(page, '[garden:owned-turn] Make a companion');
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.keeperPaused))
        .toBe('yes');
      await expect(page.getByTestId('keeper-status').first()).toBeVisible();
      // Alpha is untouched by the Garden's turn: no turn of its own, the draft as typed.
      await expect(page.getByTestId('turn-job')).toHaveCount(0);
      await expect(draft).toHaveValue('My half-written thought for Alpha');
      await page.evaluate(() => window.dispatchEvent(new Event('crux:mock-continue')));
      await expect(
        page
          .getByTestId('pane-body-console')
          .getByText('Done — created in the original Garden.')
          .first(),
      ).toBeVisible({ timeout: 60_000 });
      await expect(draft).toHaveValue('My half-written thought for Alpha');
      await expect(page.getByTestId('turn-job')).toHaveCount(0);
      await goHome(page);
      await expect(
        page.getByRole('button', { name: 'Open Studio companion', exact: true }),
      ).toBeVisible({ timeout: 30_000 });
    } finally {
      await app.close();
    }
  });

  test('KEEP-05 — a name change, a checkpoint and an export by the Keeper are the UI’s own results', async () => {
    test.setTimeout(180_000);
    const { app, page, dir } = await launchApp(MOCK);
    try {
      await enterGarden(page);
      await createCrux(page, 'Tour stop');
      await addArtifact(page, 'index.html');
      await page.locator('.monaco-editor textarea').first().focus();
      await page.keyboard.type('<h1>Tour stop</h1>');
      await page.keyboard.press('ControlOrMeta+s');
      await goHome(page);
      await enableAi(page);
      // Name and checkpoint: the tour names the garden and records a moment.
      expect(await growthCount(page)).toBe(0);
      await askKeeper(page, '[garden:tour] Name it and keep a moment.');
      await expect(page.locator('header').getByText('The Tour Garden')).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByTestId('pane-body-history')).toContainText("The tour's first moment", {
        timeout: 30_000,
      });
      await expect(page.locator('.pane-toolbar-label', { hasText: 'The porch' })).toBeVisible();
      await expect.poll(() => growthCount(page)).toBe(1);
      // Export: the same archive the Export pane hands over.
      const archive = join(dir, 'tour-stop.crux');
      await app.evaluate(({ session }, path) => {
        session.defaultSession.once('will-download', (_event, item) => item.setSavePath(path));
      }, archive);
      const console_ = await askKeeper(page, '[garden:operate] Export Tour stop.');
      await expect(console_.getByText('exported it with its history').first()).toBeVisible({
        timeout: 60_000,
      });
      await expect.poll(() => existsSync(archive), { timeout: 30_000 }).toBe(true);
    } finally {
      await app.close();
    }
  });

  test('KEEP-07 — a Crux that does not exist is an error in the open, not an edit somewhere else', async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp(MOCK);
    const trail: string[] = [];
    page.on('console', (m) => {
      if (/\[garden-tool\]|error/i.test(m.text())) trail.push(m.text().slice(0, 300));
    });
    try {
      await enterGarden(page);
      await createCrux(page, 'Something else');
      await goHome(page);
      await enableAi(page);
      await askKeeper(page, '[garden:tour] Show me Tour stop.');
      // The tour ends by naming the garden; a successful show closes the Console, so reopen it.
      await expect(page.locator('header').getByText('The Tour Garden')).toBeVisible({
        timeout: 60_000,
      });
      await showPane(page, 'Console');
      await expect(
        page.getByTestId('pane-body-console').getByText('That was the tour').first(),
      ).toBeVisible({ timeout: 60_000 });
      const failed = errorRows(page);
      await expect(failed.first()).toContainText('Tour stop');
      // The row folds its result: open it to read the refusal.
      await failed.first().click();
      await expect(page.getByTestId('pane-body-console')).toContainText(
        'No crux titled "Tour stop"',
      );
      // Nothing was opened or snapshotted in its place.
      await expect(page.locator('[data-workspace-id]')).toHaveCount(0);
      expect(await growthCount(page)).toBe(0);
    } finally {
      console.log(trail.join('\n'));
      await app.close();
    }
  });

  test('KEEP-07 — an ambiguous title is refused rather than resolved to whichever Crux comes first', async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp(MOCK);
    const trail: string[] = [];
    page.on('console', (m) => {
      if (/\[garden-tool\]|error/i.test(m.text())) trail.push(m.text().slice(0, 300));
    });
    try {
      await enterGarden(page);
      const a = await createCrux(page, 'Tour stop A');
      const b = await createCrux(page, 'Tour stop B');
      await goHome(page);
      await enableAi(page);
      await askKeeper(page, '[garden:tour] Show me Tour stop.');
      // The tour ends by naming the garden; a successful show closes the Console, so reopen it.
      await expect(page.locator('header').getByText('The Tour Garden')).toBeVisible({
        timeout: 60_000,
      });
      await showPane(page, 'Console');
      await expect(
        page.getByTestId('pane-body-console').getByText('That was the tour').first(),
      ).toBeVisible({ timeout: 60_000 });
      // "Tour stop" names two Cruxes: the Keeper's tools must say so and touch neither.
      // The row folds the answer; opened, it names both candidates.
      const refused = errorRows(page).first();
      await expect(refused).toBeVisible({ timeout: 30_000 });
      await refused.click();
      const answer = refused.locator('xpath=following-sibling::pre[1]');
      await expect(answer).toContainText(/matches several cruxes/);
      await expect(answer).toContainText(/Tour stop A/);
      await expect(answer).toContainText(/Tour stop B/);
      expect(await growthCount(page)).toBe(0);
      const snapshotted = await page.evaluate(
        ([a, b]) =>
          window.electronAPI!.sqlite.all(
            "SELECT source_id FROM dimensions WHERE type = 'growth' AND source_id IN (?, ?)",
            [a, b],
          ),
        [a, b],
      );
      expect(snapshotted).toEqual([]);
      await expect(page.locator('[data-workspace-id]')).toHaveCount(0);
    } finally {
      console.log(trail.join('\n'));
      await app.close();
    }
  });

  test('KEEP-02 — the Keeper grows a named Garden with a brief and plants into it; membership is real and it opens', async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp(MOCK);
    try {
      await enterGarden(page);
      await enableAi(page);
      const console_ = await askKeeper(page, '[garden:grow] Grow a Garden for the field study.');
      await expect(
        console_
          .getByText('Grew Field study and planted Site A notes in it with its brief.')
          .first(),
      ).toBeVisible({ timeout: 60_000 });
      await expect(errorRows(page)).toHaveCount(0);
      await hidePane(page, 'Console');
      // The Garden, its brief and its member exist in the store, not only in the reply.
      const garden = (await page.evaluate(async () => {
        const db = window.electronAPI!.sqlite;
        const row = (await db.get(
          "SELECT id, description FROM cruxes WHERE kind = 'garden' AND title = 'Field study' AND deleted IS NULL",
        )) as { id: string; description: string | null } | undefined;
        if (!row) return null;
        const members = (await db.gardenMembership!.list(row.id, { limit: 100 })).items;
        return {
          id: row.id,
          brief: row.description ?? '',
          members: members.map((m) => ({ id: m.id, title: m.title, kind: m.kind })),
        };
      })) as { id: string; brief: string; members: { id: string; title?: string }[] } | null;
      expect(garden).not.toBeNull();
      // A Garden's brief is its row's description (ADR 0058).
      expect(garden!.brief).toBe('A season of field notes: one Crux per site, one page per day.');
      const member = garden!.members.find((m) => m.title === 'Site A notes');
      expect(member).toBeDefined();
      const meta = await storedCrux(page, member!.id);
      expect(meta.settings?.systemPrompt).toBe('Notes from site A, one page per day.');
      await expect
        .poll(() => existsSync(join(meta.projectFolder as string, 'BRIEF.md')), {
          timeout: 30_000,
        })
        .toBe(true);
      // Opening it: the Garden is a card on Home, the member a card in the Garden.
      await page.getByRole('button', { name: 'Open Field study', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
        'Field study',
      );
      await page
        .getByRole('main')
        .getByRole('button', { name: 'Open Site A notes', exact: true })
        .click();
      await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
        'Site A notes',
      );
    } finally {
      await app.close();
    }
  });

  for (const mode of ['beside', 'start'] as const)
    test(`KEEP-03 — the Keeper starts an Undertaking from its template with the example ${mode === 'beside' ? 'beside the starter' : 'as the start'}`, async () => {
      test.setTimeout(300_000);
      const { app, page } = await launchApp(MOCK);
      try {
        await enterGarden(page);
        await enableAi(page);
        const console_ = await askKeeper(
          page,
          `[garden:undertaking:${mode}] Start a small game from its template.`,
        );
        await expect(
          console_
            .getByText(
              mode === 'beside'
                ? 'Started Pocket game with its worked example beside the starter.'
                : 'Started Pocket game from the worked example as the start.',
            )
            .first(),
        ).toBeVisible({ timeout: 240_000 });
        await expect(errorRows(page)).toHaveCount(0);
        // The same shape the Add Crux dialog's choices produce (undertakings.spec):
        // one Garden named by the person; beside → its worked example grows inside it.
        const gardens = await page.evaluate(async () => {
          const db = window.electronAPI!.sqlite;
          const rows = (await db.all(
            "SELECT id, title FROM cruxes WHERE kind = 'garden' AND deleted IS NULL",
          )) as { id: string; title: string }[];
          return Promise.all(
            rows.map(async (row) => ({
              ...row,
              parents: (await db.gardenMembership!.parents(row.id)).map((p) => p.id),
              members: (await db.gardenMembership!.list(row.id, { limit: 100 })).items.map((m) => ({
                id: m.id,
                kind: m.kind,
              })),
            })),
          );
        });
        const own = gardens.find((g) => g.title === 'Pocket game');
        expect(own).toBeDefined();
        const works = (g: NonNullable<typeof own>) => g.members.filter((m) => m.kind !== 'garden');
        const example = gardens.find((g) => g.title.includes('worked example'));
        if (mode === 'beside') {
          expect(example).toBeDefined();
          expect(example!.parents).toEqual([own!.id]);
          expect(new Set([...works(own!), ...works(example!)].map((m) => m.id)).size).toBe(4);
        } else {
          expect(example).toBeUndefined();
          expect(works(own!)).toHaveLength(2);
        }
        await hidePane(page, 'Console');
        await expect(
          page.getByRole('button', { name: 'Open Pocket game', exact: true }),
        ).toBeVisible({ timeout: 30_000 });
      } finally {
        await app.close();
      }
    });

  test('KEEP-04 — the Keeper delegates a turn to another Crux’s collaborator; that Crux owns the turn and the draft here survives', async () => {
    test.setTimeout(180_000);
    const { app, page } = await launchApp(MOCK);
    try {
      await enterGarden(page);
      await enableAi(page);
      const alpha = await createCrux(page, 'Alpha');
      const beta = await createCrux(page, 'Beta');
      const draft = page
        .getByTestId('pane-body-collaboration')
        .getByPlaceholder('Send a message...');
      await draft.fill('My half-written thought for Beta');
      await askKeeper(page, '[garden:delegate] Have Alpha write the note.');
      // run_turn brings Alpha into view: the person watches the work where it happens.
      await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
        'Alpha',
        { timeout: 60_000 },
      );
      await expect(
        page.getByTestId('pane-body-collaboration').getByText('Done — I wrote that file for you.'),
      ).toBeVisible({ timeout: 60_000 });
      const console_ = await showPane(page, 'Console');
      await expect(
        console_
          .getByText(
            "Alpha's collaborator took the turn and wrote the note; your own work was untouched.",
          )
          .first(),
      ).toBeVisible({ timeout: 60_000 });
      await expect(errorRows(page)).toHaveCount(0);
      await hidePane(page, 'Console');
      // Alpha owns the turn: its file, its reply. Beta has neither.
      const alphaFolder = (await storedCrux(page, alpha)).projectFolder as string;
      const betaFolder = (await storedCrux(page, beta)).projectFolder as string;
      await expect
        .poll(() => existsSync(join(alphaFolder, 'hello.txt')), { timeout: 30_000 })
        .toBe(true);
      expect(existsSync(join(betaFolder, 'hello.txt'))).toBe(false);
      expect(
        (await storedCrux(page, alpha)).messages.some(
          (m: { role: string; content: string }) =>
            m.role === 'assistant' && m.content === 'Done — I wrote that file for you.',
        ),
      ).toBe(true);
      // Beta has only its greeting: no turn of the person's, no reply.
      expect(
        (await storedCrux(page, beta)).messages.filter(
          (m: { role: string; content: string }) =>
            m.role === 'user' || m.content === 'Done — I wrote that file for you.',
        ),
      ).toHaveLength(0);
      // The draft in Beta is as typed.
      await switchCrux(page, 'Beta');
      await expect(draft).toHaveValue('My half-written thought for Beta');
    } finally {
      await app.close();
    }
  });

  test('KEEP-05 — a Mood change by the Keeper is the Mood pane’s own result', async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp(MOCK);
    try {
      await enterGarden(page);
      await enableAi(page);
      const mood = await showPane(page, 'Mood');
      const card = mood.getByRole('button', { name: 'Apply Raster Bars', exact: true });
      await expect(card).toHaveAttribute('aria-pressed', 'false');
      await hidePane(page, 'Mood');
      const console_ = await askKeeper(page, '[garden:mood] Wear something retro.');
      await expect(console_.getByText('The garden now wears Raster Bars.').first()).toBeVisible({
        timeout: 60_000,
      });
      await expect(errorRows(page)).toHaveCount(0);
      await hidePane(page, 'Console');
      await showPane(page, 'Mood');
      await expect(card).toHaveAttribute('aria-pressed', 'true');
    } finally {
      await app.close();
    }
  });
});
