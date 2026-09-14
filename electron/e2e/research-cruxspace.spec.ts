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
  exportCruxspacePackage,
  importCruxspacePackage,
} from './game-cruxspace-helpers';

/**
 * Seed trial — a small question answered across Crux Tools in one Cruxspace by
 * a person and the scripted collaborator (RESEARCH-CRUXSPACE-PLAN.md): the
 * question, provenance and method in Tigrana, the dataset and a fitted line
 * in JupyterLite, the figure in RAWGraphs, the findings with the figure back in
 * the notebook, published as a public edition that keeps the lab log private;
 * the story; then the `.cruxspace` package restored into a fresh Garden.
 */
const CODE = [
  'import csv',
  'import numpy as np',
  'with open("seedlings.csv") as f:',
  '    rows = [(float(r["Hours of light"]), float(r["Height cm"])) for r in csv.DictReader(f)]',
  'x = np.array([r[0] for r in rows])',
  'y = np.array([r[1] for r in rows])',
  'slope, intercept = np.polyfit(x, y, 1)',
  'r = np.corrcoef(x, y)[0, 1]',
  'print(f"Rows: {len(rows)} Slope: {slope:.2f} cm/hour Correlation: {r:.3f}")',
].join('\n');

test('Seed trial: question, dataset and fit, figure, findings and a public edition across one Cruxspace', async () => {
  test.setTimeout(1800000);
  const api = await startMockApi();
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1', CRUX_API_URL: api.url } });
  const evidence = resolve(__dirname, '../../docs/research-cruxspace');
  mkdirSync(evidence, { recursive: true });
  const shot = (name: string) => first.page.screenshot({ path: join(evidence, `${name}.png`) });
  const pageErrors: string[] = [];
  const pkg = join(first.dir, 'seed-trial.cruxspace');
  const csv = resolve(__dirname, 'fixtures/seed-trial/seedlings.csv');
  const members: Record<string, { id: string; folder: string; title: string }> = {};
  const status = () => frame(first.page).locator('#garden-project [role=status]');
  const note = (name: string) => join(members.notebook.folder, 'notebook', name);
  const computation = () =>
    JSON.parse(readFileSync(join(members.computation.folder, 'data/project.json'), 'utf8'));
  let storyHeader = '';
  try {
    const { page } = first;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 2000, height: 1200 });
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') console.log('APP:', m.text().slice(0, 300));
    });
    await enterGarden(page);

    await test.step('1. Members and the Cruxspace', async () => {
      members.notebook = await member(page, /^Notes/, 'Seed trial notebook');
      await expect(status()).toHaveText('Saved', { timeout: 120000 });
      members.computation = await member(page, /^JupyterLite/, 'Seed trial computation');
      await nativeReady(page);
      members.figure = await member(page, /^RAWGraphs/, 'Seed trial figure');
      await nativeReady(page);
      await home(page);
      await page.getByRole('button', { name: 'Create Cruxspace', exact: true }).click();
      await page.getByLabel('Cruxspace name').fill('Seed trial');
      await page
        .getByLabel('Shared brief')
        .fill(
          'Does more daily light make seedlings taller in their first two weeks? Question, provenance and findings in Tigrana; the dataset and a fitted line in JupyterLite; the figure in RAWGraphs; the findings published as a public edition.',
        );
      for (const m of Object.values(members))
        await page.getByRole('checkbox', { name: m.title, exact: true }).check();
      await page.getByRole('button', { name: 'Save Cruxspace', exact: true }).click();
      await expect(page.getByLabel('Cruxspace', { exact: true })).toContainText('Seed trial');
      await shot('01-cruxspace');
    });

    await test.step('2. Question: the collaborator writes it and a private lab log; a person adds a line', async () => {
      await open(page, 'Seed trial notebook');
      await collaborator(
        page,
        'Write the question, provenance and method [research:question]',
        'Wrote the question, its provenance and the method, and a private lab log.',
      );
      await expect
        .poll(() => existsSync(note('Question.md')) && existsSync(note('Lab log.md')))
        .toBe(true);
      await frame(page)
        .locator('body')
        .evaluate(() => location.reload());
      await expect(status()).toHaveText('Saved', { timeout: 120000 });
      await frame(page).getByRole('button', { name: 'Question', exact: true }).first().click();
      const editor = frame(page).locator('.tiptap').first();
      await expect(editor).toContainText('Provenance');
      await editor.click();
      await page.keyboard.press('Control+End');
      await page.keyboard.press('End');
      await page.keyboard.type(' Measured at the same hour each day.');
      await expect
        .poll(() => readFileSync(note('Question.md'), 'utf8'), { timeout: 30000 })
        .toContain('same hour each day');
      await snapshot(page, 'Question');
      await shot('02-question');
    });

    await test.step('3. Computation: a person uploads the dataset and fits a line; the collaborator writes the findings cell', async () => {
      await open(page, 'Seed trial computation');
      const lab = await nativeReady(page);
      const chooser = page.waitForEvent('filechooser');
      await lab.locator('.jp-id-upload').click();
      await (await chooser).setFiles(csv);
      await expect
        .poll(() => computation().project?.files?.some((f: any) => f.path === 'seedlings.csv'), {
          timeout: 60000,
        })
        .toBe(true);
      // The upload opens the dataset in its own tab; the Launcher tab is still there.
      await lab.locator('.lm-TabBar-tab').filter({ hasText: 'Launcher' }).click();
      await lab
        .locator('.jp-LauncherCard[data-category="Notebook"]')
        .filter({ hasText: 'Python (Pyodide)' })
        .click();
      const input = lab.locator('.jp-Notebook .cm-content').first();
      await input.fill(CODE);
      await input.press('Shift+Enter');
      await expect(
        lab
          .locator('.jp-OutputArea-output')
          .filter({ hasText: 'Rows: 10 Slope: 0.96 cm/hour Correlation: 0.997' }),
      ).toBeVisible({ timeout: 180000 });
      await collaborator(
        page,
        'Write up the findings [research:findings]',
        'Added the findings cell and saved the notebook.',
      );
      await expect(
        lab.locator('.jp-MarkdownCell').filter({ hasText: 'hint, not a result' }),
      ).toBeVisible({ timeout: 60000 });
      await nativeReady(page);
      await snapshot(page, 'Analysis');
      await shot('03-computation');
    });

    await test.step('4. Figure: a person maps the data to a scatter (bubble) chart; the collaborator sizes and saves it', async () => {
      await open(page, 'Seed trial figure');
      const raw = await nativeReady(page);
      await raw.locator('textarea').first().fill(readFileSync(csv, 'utf8'));
      await expect(raw.getByText('2. Choose a chart', { exact: true })).toBeVisible();
      // RAWGraphs greets narrower windows with a notice; a person dismisses it.
      const notice = raw.locator('.raw-modal').getByRole('button', { name: 'Got it!' });
      if (await notice.isVisible().catch(() => false)) await notice.click();
      await expect(raw.locator('.raw-modal')).toHaveCount(0);
      const card = raw.getByText('Bubble chart', { exact: true });
      await card.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await card.click();
      const zone = (label: RegExp) =>
        raw
          .locator('[class*="chart-dimension"]')
          .filter({ has: raw.locator('span.text-capitalize').filter({ hasText: label }) })
          .filter({ has: raw.locator('.dropzone') })
          .last()
          .locator('.dropzone');
      await raw
        .locator('.column-card')
        .filter({ hasText: /^Hours of light$/ })
        .dragTo(zone(/^X Axis$/i));
      await raw
        .locator('.column-card')
        .filter({ hasText: /^Height cm$/ })
        .dragTo(zone(/^Y Axis$/i));
      await expect(raw.locator('svg circle').first()).toBeVisible({ timeout: 60000 });
      await collaborator(
        page,
        'Size the figure and share it [research:figure]',
        'Sized the figure and saved it to the Cruxspace.',
      );
      await expect
        .poll(() => outputs(members.figure.folder).map((o) => o.label))
        .toEqual(['Height vs light']);
      expect(outputs(members.figure.folder)[0].mimeType).toBe('image/png');
      await snapshot(page, 'Figure');
      await shot('04-figure');
    });

    await test.step('5. Findings: the figure returns to the notebook, the conclusion is written, the public pages chosen', async () => {
      await open(page, 'Seed trial notebook');
      await collaborator(
        page,
        'Bring the figure over and write the findings [research:report]',
        'Placed the figure in the notebook and wrote the findings.',
      );
      await expect
        .poll(
          () => existsSync(note('figures/height-vs-light.png')) && existsSync(note('Findings.md')),
          { timeout: 30000 },
        )
        .toBe(true);
      expect(
        readFileSync(note('figures/height-vs-light.png')).equals(
          readFileSync(join(members.figure.folder, outputs(members.figure.folder)[0].path)),
        ),
      ).toBe(true);
      await frame(page)
        .locator('body')
        .evaluate(() => location.reload());
      await expect(status()).toHaveText('Saved', { timeout: 120000 });
      await frame(page).getByRole('button', { name: 'Findings', exact: true }).first().click();
      await expect(frame(page).locator('.tiptap').first()).toContainText(
        'hint worth a proper trial',
      );
      await expect
        .poll(() =>
          frame(page)
            .locator('.tiptap img')
            .first()
            .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
        )
        .toBe(true);
      await frame(page).getByRole('button', { name: 'Public edition…' }).click();
      const panel = frame(page).locator('#garden-publication');
      await panel.locator('input:not([type=checkbox])').fill('Seed trial');
      await panel.locator('input[data-note="Findings.md"]').check();
      await panel.locator('input[data-note="Question.md"]').check();
      await expect
        .poll(() => JSON.parse(readFileSync(note('publish.json'), 'utf8')))
        .toMatchObject({ title: 'Seed trial', pages: ['Findings.md', 'Question.md'] });
      await frame(page).getByRole('button', { name: 'Public edition…' }).click();
      await expect(status()).toHaveText('Saved');
      await snapshot(page, 'Findings');
      await shot('05-findings');
    });

    await test.step('6. Publish the notebook through the Share pane; the edition carries the figure and not the lab log', async () => {
      await page.getByRole('button', { name: 'Toggle share' }).click();
      const share = page.getByTestId('pane-body-publish');
      await share.getByRole('button', { name: 'Share selected content', exact: true }).click();
      await page.getByPlaceholder('email@example.com').fill('tester@example.com');
      await page.getByRole('button', { name: 'Send Code' }).click();
      await page.getByPlaceholder('Enter code').fill('123456');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      const backupAsk = page
        .getByRole('dialog')
        .filter({ hasText: 'A published site is not a backup' });
      await expect(backupAsk).toBeVisible({ timeout: 60000 });
      await backupAsk.getByRole('button', { name: 'Back up and share' }).click();
      // The notebook may flush a normalised note after the upload; the edition is still v1.
      await expect(share.getByText(/^(Up to date|Changes to share)$/)).toBeVisible({
        timeout: 6 * 60_000,
      });
      await expect(share).toContainText('Shared');
      const published = api.state.published[members.notebook.id] ?? [];
      const index = published.find((f) => f.path === 'index.html');
      expect(index).toBeTruthy();
      const html = index!.bytes.toString('utf8');
      expect(html).toContain('hint worth a proper trial');
      expect(html).toContain('data:image/png;base64,');
      expect(html).not.toContain('PRIVATE_LAB_LOG');
      expect(published.some((f) => /Lab log/.test(f.path))).toBe(false);
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
        response.setHeader('Content-Type', file.mime || 'text/html');
        response.end(file.bytes);
      });
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      const browser = await chromium.launch();
      try {
        const site = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await site.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/`);
        await expect(site.getByRole('heading', { name: 'Seed trial', level: 1 })).toBeVisible({
          timeout: 60000,
        });
        await expect(site.locator('article:not([hidden])')).toContainText(
          'hint worth a proper trial',
        );
        await expect
          .poll(() =>
            site
              .locator('article:not([hidden]) img')
              .first()
              .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
          )
          .toBe(true);
        await site.screenshot({ path: join(evidence, '06-published.png') });
      } finally {
        await browser.close();
        server.closeAllConnections();
        await new Promise<void>((r) => server.close(() => r()));
      }
      await page.getByRole('button', { name: 'Toggle share' }).click();
      await snapshot(page, 'Published');
    });

    await test.step('7. The Cruxspace story: three members, the transfer, a walkthrough into the figure', async () => {
      await home(page);
      await page
        .getByRole('combobox', { name: 'Cruxspace', exact: true })
        .selectOption({ label: 'Seed trial' });
      await page.getByRole('button', { name: 'Cruxspace history', exact: true }).click();
      const story = page.getByRole('dialog', { name: 'Cruxspace history' });
      await expect(story).toContainText(
        /3 members · \d+ milestones · \d+ transfers between members/,
        { timeout: 60000 },
      );
      const header = (await story.locator('header').innerText()).match(
        /\d+ members · \d+ milestones · (\d+) transfers/,
      )!;
      expect(Number(header[1])).toBeGreaterThanOrEqual(1);
      await expect(story.getByRole('region', { name: 'About this Cruxspace' })).toContainText(
        'seedlings taller',
      );
      const list = story.getByRole('region', { name: 'Members' });
      for (const [title, tool] of [
        ['Seed trial notebook', 'Tigrana'],
        ['Seed trial computation', 'JupyterLite'],
        ['Seed trial figure', 'RAWGraphs'],
      ])
        await expect(list.getByRole('listitem').filter({ hasText: title })).toContainText(tool);
      await expect(
        list.getByRole('listitem').filter({ hasText: 'Seed trial figure' }),
      ).toContainText('shared Height vs light');
      const milestones = story.getByRole('list', { name: 'Milestone list' });
      // Member titles end in "figure": match the milestone label line, not the whole item.
      const figureMilestone = milestones
        .getByRole('listitem')
        .filter({ has: page.locator('span.block', { hasText: /^Figure$/ }) })
        .first();
      for (const title of [
        'Question',
        'Analysis',
        'Figure',
        'Used Height vs light from Seed trial',
        'Findings',
        'Published',
      ])
        await expect(
          milestones.getByRole('listitem').filter({ hasText: title }).first(),
        ).toBeVisible();
      await story.getByRole('button', { name: 'Fit graph', exact: true }).click();
      await shot('07-cruxspace-history');
      await story.getByRole('button', { name: 'Start walkthrough', exact: true }).click();
      const walk = story.getByRole('status', { name: 'Walkthrough' });
      await expect(walk).toContainText(/step 1 of \d+/);
      await figureMilestone.getByRole('button', { name: 'Go to this moment' }).click();
      await expect(walk).toContainText('Figure');
      await figureMilestone.getByRole('button', { name: 'Open in Seed trial figure' }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('status', { name: 'Walkthrough' })).toContainText(
        'Walking through Seed trial',
      );
      await expect(page.getByText(/Viewing snapshot \d+ of \d+/)).toBeVisible({ timeout: 120000 });
      await shot('07-walkthrough-figure');
      await page
        .getByRole('status', { name: 'Walkthrough' })
        .getByRole('button', { name: 'Back to now' })
        .click();
      await expect(page.getByRole('status', { name: 'Walkthrough' })).toHaveCount(0);
      await expect(page.getByText(/Viewing snapshot \d+ of \d+/)).toHaveCount(0, {
        timeout: 60000,
      });
    });

    await test.step('8a. Export the .cruxspace package from the hub', async () => {
      await home(page);
      await page.getByRole('button', { name: 'Cruxspace history', exact: true }).click();
      const story = page.getByRole('dialog', { name: 'Cruxspace history' });
      await expect(story).toContainText(/3 members · \d+ milestones · \d+ transfers/, {
        timeout: 60000,
      });
      storyHeader = (await story.locator('header').innerText()).match(
        /\d+ members · \d+ milestones · \d+ transfers/,
      )![0];
      await story.getByRole('button', { name: 'Close Cruxspace history' }).click();
      await expect(story).toHaveCount(0);
      await exportCruxspacePackage(page, first.app, 'Seed trial', pkg);
      expect(statSync(pkg).size).toBeGreaterThan(100_000);
    });
    expect(pageErrors).toEqual([]);
  } finally {
    await first.app.close();
  }

  for (const m of Object.values(members)) renameSync(m.folder, `${m.folder}-unavailable`);
  const second = await launchApp({ env: { CRUX_AI_MOCK: '1', CRUX_API_URL: api.url } });
  try {
    const { page } = second;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 2000, height: 1200 });
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await enterGarden(page);

    await test.step('8b. Import the package into a fresh Garden; members, the figure and the story return', async () => {
      await importCruxspacePackage(page, pkg);
      await expect(page.getByRole('status').filter({ hasText: 'Imported' })).toContainText(
        'Imported Seed trial with 3 member Cruxes.',
      );
      const hub = page.getByRole('region', { name: 'Cruxspaces', exact: true });
      for (const m of Object.values(members))
        await expect(
          hub.getByRole('button', { name: `Open ${m.title}`, exact: true }),
        ).toBeVisible();
      await expect(
        hub.getByRole('button', { name: 'Use Height vs light', exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Cruxspace history', exact: true }).click();
      const story = page.getByRole('dialog', { name: 'Cruxspace history' });
      await expect(story.locator('header')).toContainText(storyHeader, { timeout: 60000 });
      await story.getByRole('button', { name: 'Close Cruxspace history' }).click();
      await page.screenshot({ path: join(evidence, '08-imported-hub.png') });
    });

    await test.step('8c. The imported notebook shows the findings with the figure; the dataset is in the computation Crux', async () => {
      await open(page, 'Seed trial notebook');
      await openWorkshop(page);
      await expect(frame(page).locator('#garden-project [role=status]')).toHaveText('Saved', {
        timeout: 120000,
      });
      await frame(page).getByRole('button', { name: 'Findings', exact: true }).first().click();
      await expect(frame(page).locator('.tiptap').first()).toContainText(
        'hint worth a proper trial',
      );
      await expect
        .poll(() =>
          frame(page)
            .locator('.tiptap img')
            .first()
            .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
        )
        .toBe(true);
      await page.screenshot({ path: join(evidence, '08-imported-findings.png') });
      const folder = (await storedCrux(page, members.computation.id)).projectFolder as string;
      const doc = JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
      expect(doc.project.files.some((f: any) => f.path === 'seedlings.csv')).toBe(true);
      expect(doc.project.files.some((f: any) => f.type === 'notebook')).toBe(true);
    });
    expect(pageErrors).toEqual([]);
  } finally {
    await second.app.close();
    await api.close();
  }
});
