import { test, expect, chromium } from '@playwright/test';
import { readFileSync, mkdirSync, existsSync, renameSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden, storedCrux } from './multi-crux-helpers';
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
  kanBoards,
  exportCruxspacePackage,
  importCruxspacePackage,
} from './game-cruxspace-helpers';

/**
 * Bloom & Ink — a small illustration studio launched across Crux Tools in one
 * Cruxspace by a person and the scripted collaborator
 * (BUSINESS-CRUXSPACE-PLAN.md): brief in Tigrana, a wireframe in Moqira, the
 * budget in the spreadsheet, a launch board in Kan, the brand mark in
 * miniPaint, the schedule in the calendar, the site from the Astro Home Page
 * starter; publish; the story; the board closed; then the `.cruxspace` package
 * restored into a fresh Garden with every source folder gone.
 */
test('Bloom & Ink: brief, wireframe, budget, board, brand mark, calendar and site across one Cruxspace', async () => {
  test.setTimeout(1800000);
  const api = await startMockApi();
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1', CRUX_API_URL: api.url } });
  const evidence = resolve(__dirname, '../../docs/business-cruxspace');
  mkdirSync(evidence, { recursive: true });
  const shot = (name: string) => first.page.screenshot({ path: join(evidence, `${name}.png`) });
  const pageErrors: string[] = [];
  const pkg = join(first.dir, 'bloom-and-ink.cruxspace');
  const members: Record<string, { id: string; folder: string; title: string }> = {};
  const status = () => frame(first.page).locator('#garden-project [role=status]');
  const budget = () =>
    JSON.parse(readFileSync(join(members.budget.folder, 'data/project.json'), 'utf8'));
  const calendar = () =>
    JSON.parse(readFileSync(join(members.calendar.folder, 'data/project.json'), 'utf8'));
  let storyHeader = '';
  try {
    const { page } = first;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 2000, height: 1200 });
    page.on('pageerror', (e) => {
      // Moqira's stylesheet declares view transitions (Chromium reports the skipped one); miniPaint's
      // brush tool reads a null stroke state on the first synthetic pointer stroke (upstream, the stroke lands).
      if (e.message === 'Transition was skipped') return;
      if (
        e.message === "Cannot read properties of null (reading '0')" &&
        page.url().includes('/c/')
      )
        return;
      pageErrors.push(e.message);
    });
    page.on('console', (m) => {
      if (m.type() === 'error') console.log('APP:', m.text().slice(0, 300));
    });
    await enterGarden(page);

    await test.step('1. Members and the Cruxspace', async () => {
      members.brief = await member(page, /^Notes/, 'Bloom & Ink brief');
      await expect(status()).toHaveText('Saved', { timeout: 120000 });
      members.mockups = await member(page, /^Mockups/, 'Bloom & Ink mockups');
      await expect(status()).toHaveText('Saved', { timeout: 120000 });
      members.budget = await member(page, /^Spreadsheet/, 'Bloom & Ink budget');
      await expect(frame(page).locator('#editor')).toHaveAttribute('data-ready', 'true', {
        timeout: 120000,
      });
      members.board = await member(page, /^Kan/, 'Bloom & Ink launch board');
      await nativeReady(page);
      members.brand = await member(page, /^miniPaint/, 'Bloom & Ink brand image');
      await nativeReady(page);
      members.calendar = await member(page, /^Calendar/, 'Bloom & Ink calendar');
      await expect(status()).toHaveText('Saved to Garden', { timeout: 120000 });
      members.site = await member(page, /^Astro Home Page/, 'Bloom & Ink site');
      await home(page);
      await page.getByRole('button', { name: 'Create Cruxspace', exact: true }).click();
      await page.getByLabel('Cruxspace name').fill('Bloom & Ink');
      await page
        .getByLabel('Shared brief')
        .fill(
          'A two-person illustration studio opening its first online shop: covers, spot illustrations and prints. Brief in Tigrana, screens in Moqira, budget in the spreadsheet, launch board in Kan, brand mark in miniPaint, schedule in the calendar, site in Astro.',
        );
      for (const m of Object.values(members))
        await page.getByRole('checkbox', { name: m.title, exact: true }).check();
      await page.getByRole('button', { name: 'Save Cruxspace', exact: true }).click();
      await expect(page.getByLabel('Cruxspace', { exact: true })).toContainText('Bloom & Ink');
      await shot('01-cruxspace');
    });

    await test.step('2. Brief: the collaborator writes it, a person adds a line in Tigrana', async () => {
      await open(page, 'Bloom & Ink brief');
      await collaborator(
        page,
        'Write the brief for the studio [business:brief]',
        'Wrote the brief: audience, offer, brand notes and page copy.',
      );
      const brief = join(members.brief.folder, 'notebook/Bloom & Ink brief.md');
      await expect.poll(() => existsSync(brief)).toBe(true);
      expect(readFileSync(brief, 'utf8')).toContain('## Offer');
      // Tigrana lists the note after a reload (external writes show on the next open).
      await frame(page)
        .locator('body')
        .evaluate(() => location.reload());
      await expect(status()).toHaveText('Saved', { timeout: 120000 });
      await frame(page)
        .getByRole('button', { name: 'Bloom & Ink brief', exact: true })
        .first()
        .click();
      const editor = frame(page).locator('.tiptap').first();
      await expect(editor).toContainText('Custom book cover');
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.press('End');
      await page.keyboard.type(' Delivery is a PDF plus print-ready TIFF.');
      await expect
        .poll(() => readFileSync(brief, 'utf8'), { timeout: 30000 })
        .toContain('print-ready TIFF');
      await snapshot(page, 'Brief');
      await shot('02-brief');
    });

    await test.step('3. Mockups: a person sketches the landing screen in Moqira', async () => {
      await open(page, 'Bloom & Ink mockups');
      await expect(status()).toHaveText('Saved', { timeout: 120000 });
      await frame(page).locator('.library-item').getByText('Button', { exact: true }).click();
      await frame(page).locator('.library-item').getByText('Label', { exact: true }).click();
      await expect(frame(page).locator('.canvas-node')).toHaveCount(2);
      await frame(page).getByRole('button', { name: 'Save project', exact: true }).click();
      await expect(status()).toHaveText('Saved');
      await expect
        .poll(
          () =>
            JSON.parse(readFileSync(join(members.mockups.folder, 'mockups/project.json'), 'utf8'))
              .wireframes[0].nodes.length,
        )
        .toBe(2);
      await snapshot(page, 'Landing wireframe');
      await shot('03-mockups');
    });

    await test.step('4. Budget: the collaborator fills it, a person edits a cell', async () => {
      await open(page, 'Bloom & Ink budget');
      await expect(frame(page).locator('#editor')).toHaveAttribute('data-ready', 'true', {
        timeout: 120000,
      });
      await collaborator(
        page,
        'Fill in the launch budget [business:budget]',
        'Filled the launch budget with costs, prices and margins.',
      );
      await expect
        .poll(
          () =>
            budget().workbook?.sheets?.['budget-sheet']?.cellData?.[5]?.[3]?.f ??
            budget().workbook?.sheets?.['budget-sheet']?.cellData?.[5]?.[3]?.v,
        )
        .toBe('=SUM(D2:D4)');
      const address = frame(page).locator('[data-u-comp="defined-name"] input');
      await address.fill('A5');
      await address.press('Enter');
      await page.keyboard.type('Packaging');
      await page.keyboard.press('Enter');
      await expect
        .poll(() => budget().workbook?.sheets?.['budget-sheet']?.cellData?.[4]?.[0]?.v)
        .toBe('Packaging');
      await expect(frame(page).locator('#save-state')).toHaveText('Saved in this Crux');
      await snapshot(page, 'Budget');
      await shot('04-budget');
    });

    await test.step('5. Launch board: a person makes the lists, the collaborator adds the cards', async () => {
      await open(page, 'Bloom & Ink launch board');
      const kan = await nativeReady(page);
      await kan.getByRole('button', { name: 'New', exact: true }).click();
      await kan.getByPlaceholder('Name', { exact: true }).fill('Bloom & Ink launch');
      await kan.getByRole('button', { name: 'Create board', exact: true }).click();
      for (const name of ['Plan', 'Build', 'Launch', 'Done']) {
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
        'Break the brief into launch cards [business:board]',
        'Added the launch cards from the brief.',
      );
      await expect
        .poll(() =>
          kanBoards(members.board.folder)[0]?.lists.flatMap((l: any) =>
            l.cards.map((c: any) => c.title),
          ),
        )
        .toHaveLength(5);
      await snapshot(page, 'Launch board');
      await shot('05-board');
    });

    await test.step('6. Brand mark: a person paints in miniPaint, the collaborator saves it to the Cruxspace', async () => {
      await open(page, 'Bloom & Ink brand image');
      const paint = await nativeReady(page);
      await paint.locator('#brush').click();
      const canvas = paint.locator('#canvas_minipaint');
      const box = (await canvas.boundingBox())!;
      for (const [fx, fy, tx, ty] of [
        [0.35, 0.65, 0.5, 0.25],
        [0.5, 0.25, 0.65, 0.65],
        [0.3, 0.7, 0.7, 0.7],
      ]) {
        await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy, { steps: 4 });
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * tx, box.y + box.height * ty, { steps: 12 });
        await page.mouse.up();
      }
      await paint.getByRole('button', { name: 'Save project', exact: true }).click();
      await nativeReady(page, 60000);
      await collaborator(
        page,
        'Share the brand mark [business:brand]',
        'Saved the brand mark to the Cruxspace.',
      );
      await expect
        .poll(() => outputs(members.brand.folder).map((o) => o.label))
        .toEqual(['Brand mark']);
      expect(outputs(members.brand.folder)[0].mimeType).toBe('image/png');
      await snapshot(page, 'Brand mark');
      await shot('06-brand');
    });

    await test.step('7. Calendar: a person adds the open day, the collaborator adds launch day', async () => {
      await open(page, 'Bloom & Ink calendar');
      await expect(status()).toHaveText('Saved to Garden', { timeout: 120000 });
      const day = async (nth: number) => {
        const box = (await frame(page).locator('.ec-day').nth(nth).boundingBox())!;
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      };
      const from = await day(9);
      const to = await day(10);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x + 4, from.y + 4);
      await page.mouse.move(to.x, to.y, { steps: 10 });
      await page.mouse.up();
      const dialog = frame(page).locator('#event-dialog');
      await expect(dialog).toBeVisible();
      await dialog.locator('[name=title]').fill('Studio open day');
      await dialog.locator('#event-save').click();
      await expect(frame(page).locator('.ec-event')).toHaveCount(1);
      await collaborator(
        page,
        'Put launch day on the calendar [business:calendar]',
        'Added Launch day and named the calendar Bloom & Ink launch.',
      );
      await expect
        .poll(() =>
          calendar()
            .project.events.map((e: any) => e.title)
            .sort(),
        )
        .toEqual(['Launch day', 'Studio open day']);
      expect(calendar().project.name).toBe('Bloom & Ink launch');
      await expect(status()).toHaveText('Saved to Garden');
      await snapshot(page, 'Launch schedule');
      await shot('07-calendar');
    });

    await test.step('8. Site: the brand mark and the offer page', async () => {
      await open(page, 'Bloom & Ink site');
      await collaborator(
        page,
        'Put the brand mark and the offer on the site [business:site]',
        'Placed the brand mark on the site and wrote the offer page.',
      );
      await expect.poll(() => existsSync(join(members.site.folder, 'public/brand.png'))).toBe(true);
      const brand = outputs(members.brand.folder)[0];
      expect(
        readFileSync(join(members.site.folder, 'public/brand.png')).equals(
          readFileSync(join(members.brand.folder, brand.path)),
        ),
      ).toBe(true);
      await expect
        .poll(() => readFileSync(join(members.site.folder, 'src/pages/index.astro'), 'utf8'), {
          timeout: 30000,
        })
        .toContain('/brand.png');
      await snapshot(page, 'Site ready');
      await shot('08-site');
    });

    await test.step('8b. The live preview shows the brand mark and the offer', async () => {
      await openWorkshop(page);
      const preview = page.locator('iframe[src^="http://127.0.0.1"]');
      await expect(preview).toBeVisible({ timeout: 4 * 60_000 });
      const origin = new URL((await preview.getAttribute('src'))!).origin;
      const browser = await chromium.launch();
      try {
        const site = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await site.goto(`${origin}/`);
        await expect(site.getByRole('heading', { name: 'Bloom & Ink', level: 1 })).toBeVisible({
          timeout: 120000,
        });
        await expect
          .poll(() =>
            site
              .getByRole('img', { name: 'Bloom & Ink brand mark' })
              .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
          )
          .toBe(true);
        await site.screenshot({ path: join(evidence, '08b-site-preview.png') });
      } finally {
        await browser.close();
      }
    });

    await test.step('9. Publish through the Share pane; the published files carry the mark', async () => {
      await page.getByRole('button', { name: 'Toggle share' }).click();
      await page.getByRole('button', { name: 'Share', exact: true }).click();
      await page.getByPlaceholder('email@example.com').fill('tester@example.com');
      await page.getByRole('button', { name: 'Send Code' }).click();
      await page.getByPlaceholder('Enter code').fill('123456');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      const backupAsk = page
        .getByRole('dialog')
        .filter({ hasText: 'A published site is not a backup' });
      await expect(backupAsk).toBeVisible({ timeout: 60000 });
      await backupAsk.getByRole('button', { name: 'Back up and share' }).click();
      await expect(page.getByText('Up to date')).toBeVisible({ timeout: 6 * 60_000 });
      const published = api.state.published[members.site.id] ?? [];
      const paths = published.map((f) => f.path);
      expect(paths).toContain('brand.png');
      expect(paths).toContain('index.html');
      const server = createServer((request, response) => {
        const name =
          decodeURIComponent(new URL(request.url!, 'http://x').pathname).replace(/^\/+/, '') ||
          'index.html';
        const file = published.find((f) => f.path === name);
        if (!file) {
          response.writeHead(404);
          response.end();
          return;
        }
        response.setHeader('Content-Type', file.mime || 'application/octet-stream');
        response.end(file.bytes);
      });
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      const browser = await chromium.launch();
      try {
        const site = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await site.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/`);
        await expect(site.getByRole('heading', { name: 'Bloom & Ink', level: 1 })).toBeVisible({
          timeout: 60000,
        });
        await expect
          .poll(() =>
            site
              .getByRole('img', { name: 'Bloom & Ink brand mark' })
              .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
          )
          .toBe(true);
        await site.screenshot({ path: join(evidence, '09-published.png') });
      } finally {
        await browser.close();
        server.closeAllConnections();
        await new Promise<void>((r) => server.close(() => r()));
      }
      await page.getByRole('button', { name: 'Toggle share' }).click();
      await snapshot(page, 'Published');
    });

    await test.step('10. Board: everything moves to Done', async () => {
      await open(page, 'Bloom & Ink launch board');
      await nativeReady(page);
      await collaborator(page, 'Close the board [business:done]', 'Moved every card to Done.');
      await expect
        .poll(() => {
          const done = kanBoards(members.board.folder)[0].lists.find((l: any) => l.name === 'Done');
          return done.cards.filter((c: any) => !c.deletedAt).length;
        })
        .toBe(5);
      await shot('10-done');
    });

    // CRUX_SKIP_STORY=1 produces the package without the story step (2026-09-20:
    // the walkthrough's "Back to now" sits behind the Whole Crux Growth dialog).
    if (process.env.CRUX_SKIP_STORY) console.log('skipping step 11 (CRUX_SKIP_STORY)');
    else
      await test.step('11. The Cruxspace story: about, members, milestones, a transfer, and a walkthrough into the brand image', async () => {
        await home(page);
        await page
          .getByRole('combobox', { name: 'Cruxspace', exact: true })
          .selectOption({ label: 'Bloom & Ink' });
        await page.getByRole('button', { name: 'Cruxspace history', exact: true }).click();
        const story = page.getByRole('dialog', { name: 'Cruxspace history' });
        await expect(story.getByRole('heading', { name: 'Bloom & Ink', level: 2 })).toBeVisible();
        await expect(story).toContainText(
          /7 members · \d+ milestones · \d+ transfers between members/,
          { timeout: 60000 },
        );
        const header = (await story.locator('header').innerText()).match(
          /\d+ members · \d+ milestones · (\d+) transfers/,
        )!;
        expect(Number(header[1])).toBeGreaterThanOrEqual(1);
        await expect(story.getByRole('region', { name: 'About this Cruxspace' })).toContainText(
          'illustration studio',
        );
        const list = story.getByRole('region', { name: 'Members' });
        for (const [title, tool] of [
          ['Bloom & Ink brief', 'Tigrana'],
          ['Bloom & Ink mockups', 'Moqira'],
          ['Bloom & Ink brand image', 'miniPaint'],
          ['Bloom & Ink calendar', 'EventCalendar'],
        ])
          await expect(list.getByRole('listitem').filter({ hasText: title })).toContainText(tool);
        await expect(
          list.getByRole('listitem').filter({ hasText: 'Bloom & Ink brand image' }),
        ).toContainText('shared Brand mark');
        const milestones = story.getByRole('list', { name: 'Milestone list' });
        for (const title of [
          'Brief',
          'Budget',
          'Brand mark',
          'Used Brand mark from Bloom & Ink',
          'Site ready',
          'Published',
        ])
          await expect(
            milestones.getByRole('listitem').filter({ hasText: title }).first(),
          ).toBeVisible();
        await expect(story.getByTestId('cruxspace-canvas').locator('canvas')).toBeVisible();
        await story.getByRole('button', { name: 'Fit graph', exact: true }).click();
        await shot('11-cruxspace-history');
        await story.getByRole('button', { name: 'Start walkthrough', exact: true }).click();
        const walk = story.getByRole('status', { name: 'Walkthrough' });
        await expect(walk).toContainText(/step 1 of \d+/);
        await walk.getByRole('button', { name: 'Next step', exact: true }).click();
        await expect(walk).toContainText(/step 2 of \d+/);
        await milestones
          .getByRole('listitem')
          .filter({ hasText: 'Brand mark' })
          .first()
          .getByRole('button', { name: 'Go to this moment' })
          .click();
        await expect(walk).toContainText('Brand mark');
        await milestones
          .getByRole('listitem')
          .filter({ hasText: 'Brand mark' })
          .first()
          .getByRole('button', { name: 'Open in Bloom & Ink brand image' })
          .click();
        await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
        await page.keyboard.press('Escape');
        // The milestone opens in the member's Whole Crux Growth (by design); the
        // walkthrough banner sits beneath that dialog, so close it first.
        const explorer = page.getByRole('dialog').filter({ hasText: /WHOLE CRUX/i });
        if (await explorer.isVisible({ timeout: 5000 }).catch(() => false))
          await explorer.getByRole('button', { name: 'Close Growth graph' }).click();
        await expect(page.getByRole('status', { name: 'Walkthrough' })).toContainText(
          'Walking through Bloom & Ink',
        );
        await expect(page.getByText(/Viewing snapshot \d+ of \d+/)).toBeVisible({
          timeout: 120000,
        });
        await shot('11-walkthrough-brand');
        // Under Plasma the snapshot view's surfaces keep re-forming and the banner
        // never reads as "stable" (2026-09-20, MAKING-IT-POSSIBLE-STEPS): force the click.
        await page
          .getByRole('status', { name: 'Walkthrough' })
          .getByRole('button', { name: 'Back to now' })
          .click({ force: true });
        await expect(page.getByRole('status', { name: 'Walkthrough' })).toHaveCount(0);
        await expect(page.getByText(/Viewing snapshot \d+ of \d+/)).toHaveCount(0, {
          timeout: 60000,
        });
      });

    await test.step('12a. Export the .cruxspace package from the hub', async () => {
      await home(page);
      await page.getByRole('button', { name: 'Cruxspace history', exact: true }).click();
      const story = page.getByRole('dialog', { name: 'Cruxspace history' });
      await expect(story).toContainText(/7 members · \d+ milestones · \d+ transfers/, {
        timeout: 60000,
      });
      storyHeader = (await story.locator('header').innerText()).match(
        /\d+ members · \d+ milestones · \d+ transfers/,
      )![0];
      await story.getByRole('button', { name: 'Close Cruxspace history' }).click();
      await expect(story).toHaveCount(0);
      await exportCruxspacePackage(page, first.app, 'Bloom & Ink', pkg);
      expect(statSync(pkg).size).toBeGreaterThan(100_000);
    });
    expect(pageErrors).toEqual([]);
  } finally {
    await first.app.close();
  }

  // Every source folder is gone: the package alone must carry the undertaking.
  for (const m of Object.values(members)) renameSync(m.folder, `${m.folder}-unavailable`);
  const second = await launchApp({ env: { CRUX_AI_MOCK: '1', CRUX_API_URL: api.url } });
  try {
    const { page } = second;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 2000, height: 1200 });
    page.on('pageerror', (e) => {
      if (e.message !== 'Transition was skipped') pageErrors.push(e.message);
    });
    await enterGarden(page);

    await test.step('12b. Import the package into a fresh Garden; members, the output and the story return', async () => {
      await importCruxspacePackage(page, pkg);
      await expect(page.getByRole('status').filter({ hasText: 'Imported' })).toContainText(
        'Imported Bloom & Ink with 7 member Cruxes.',
      );
      const hub = page.getByRole('region', { name: 'Cruxspaces', exact: true });
      for (const m of Object.values(members))
        await expect(
          hub.getByRole('button', { name: `Open ${m.title}`, exact: true }),
        ).toBeVisible();
      await expect(hub.getByRole('button', { name: 'Use Brand mark', exact: true })).toBeVisible();
      await page.screenshot({ path: join(evidence, '12-imported-hub.png') });
      await page.getByRole('button', { name: 'Cruxspace history', exact: true }).click();
      const story = page.getByRole('dialog', { name: 'Cruxspace history' });
      await expect(story.locator('header')).toContainText(storyHeader, { timeout: 60000 });
      await story.getByRole('button', { name: 'Close Cruxspace history' }).click();
    });

    await test.step('12c. The imported budget and calendar open with their work', async () => {
      await open(page, 'Bloom & Ink budget');
      await openWorkshop(page);
      await expect(frame(page).locator('#editor')).toHaveAttribute('data-ready', 'true', {
        timeout: 120000,
      });
      const folder = (await storedCrux(page, members.budget.id)).projectFolder as string;
      expect(
        JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8')).workbook.sheets[
          'budget-sheet'
        ].cellData[4][0].v,
      ).toBe('Packaging');
      await open(page, 'Bloom & Ink calendar');
      await openWorkshop(page);
      await expect(frame(page).locator('#garden-project [role=status]')).toHaveText(
        'Saved to Garden',
        { timeout: 120000 },
      );
      // The calendar reopens on launch month (the collaborator moved it there); the open day is in the record.
      await expect(frame(page).locator('.ec-event').filter({ hasText: 'Launch day' })).toHaveCount(
        1,
      );
      const calendarFolder = (await storedCrux(page, members.calendar.id)).projectFolder as string;
      expect(
        JSON.parse(readFileSync(join(calendarFolder, 'data/project.json'), 'utf8'))
          .project.events.map((e: any) => e.title)
          .sort(),
      ).toEqual(['Launch day', 'Studio open day']);
      await page.screenshot({ path: join(evidence, '12-imported-calendar.png') });
    });

    await test.step('12d. The imported site still shows the brand mark', async () => {
      await open(page, 'Bloom & Ink site');
      await openWorkshop(page);
      const preview = page.locator('iframe[src^="http://127.0.0.1"]');
      await expect(preview).toBeVisible({ timeout: 4 * 60_000 });
      const origin = new URL((await preview.getAttribute('src'))!).origin;
      const browser = await chromium.launch();
      try {
        const site = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await site.goto(`${origin}/`);
        await expect(site.getByRole('heading', { name: 'Bloom & Ink', level: 1 })).toBeVisible({
          timeout: 120000,
        });
        await expect
          .poll(() =>
            site
              .getByRole('img', { name: 'Bloom & Ink brand mark' })
              .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
          )
          .toBe(true);
        await site.screenshot({ path: join(evidence, '12-imported-site.png') });
      } finally {
        await browser.close();
      }
    });
    expect(pageErrors).toEqual([]);
  } finally {
    await second.app.close();
    await api.close();
  }
});
