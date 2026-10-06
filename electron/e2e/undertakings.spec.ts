import { revealOptionsFor } from './panel-helpers';
import { togglePanel, panelPressed } from './panel-helpers';
import { test, expect, type Page } from '@playwright/test';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import JSZip from 'jszip';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { openBuilder } from './builder-helpers';
import catalog from '../../src/data/cruxspace-templates.json';

const evidence = resolve(__dirname, '../../docs/templates');
const selected = process.env.CRUX_UNDERTAKINGS?.split(',');
async function home(page: Page) {
  if (/\/c\//.test(page.url())) {
    // From a Crux, its Garden is the last step of the Garden location's ancestry.
    await page.getByRole('button', { name: 'Garden location', exact: true }).click();
    await page
      .getByRole('navigation', { name: 'Garden ancestry' })
      .getByRole('button')
      .last()
      .click();
  }
  await expect(page.getByRole('button', { name: 'Add Crux', exact: true })).toBeVisible();
}
async function openMember(page: Page, title: string) {
  await home(page);
  await page
    .getByRole('main')
    .getByRole('button', { name: `Open ${title}`, exact: true })
    .click();
  await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
  return (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
}
async function openNote(page: Page, title: string) {
  const frame = page.frameLocator('iframe[data-crux-id]');
  const field = frame.getByLabel('Note title', { exact: true });
  await expect(field).toBeVisible({ timeout: 120000 });
  if ((await field.inputValue()) === title) return;
  const show = frame.getByRole('button', { name: 'Show left sidebar', exact: true });
  await expect(frame.getByRole('button', { name: /^(Show|Hide) left sidebar$/ })).toBeVisible();
  if (await show.isVisible()) await show.click();
  await frame.getByRole('button', { name: title, exact: true }).first().click();
  await expect(field).toHaveValue(title);
}
async function editCode(page: Page, content: string) {
  const editor = page.locator('.monaco-editor').first();
  await expect(editor).toBeVisible({ timeout: 60000 });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(content);
  await page.keyboard.press('ControlOrMeta+S');
}
async function openRootFile(page: Page, path: string) {
  const pane = page.getByTestId('pane-body-artifacts');
  if (!(await pane.isVisible())) await togglePanel(page, 'Toggle artifacts');
  await pane.getByRole('tree').getByText(path, { exact: true }).click();
}
for (const entry of catalog.filter((t) => !selected || selected.includes(t.id))) {
  test(`${entry.name}: no-key edit, scripted collaboration, walkthrough, restart and package round trip`, async () => {
    test.setTimeout(20 * 60_000);
    const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    let instance = first;
    const out = join(evidence, entry.id);
    mkdirSync(out, { recursive: true });
    try {
      let page = instance.page;
      await page.setViewportSize({ width: 1800, height: 1100 });
      await enterGarden(page);
      await page
        .getByRole('button', {
          name: 'Explore undertakings — a collection of projects',
          exact: true,
        })
        .click();
      await page.locator(`[data-undertaking-id="${entry.id}"]`).click();
      await expect(page.getByText(entry.firstTask, { exact: false })).toBeVisible();
      await page.screenshot({ path: join(out, 'picker.png') });
      await page.getByRole('button', { name: 'Start undertaking', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Add Crux', exact: true })).toBeHidden({
        timeout: 180000,
      });
      // The undertaking is a new Garden; its worked example grows inside it.
      await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
        entry.name,
      );
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
      const own = gardens.find((g) => g.title === entry.name)!;
      const example = gardens.find((g) => g.title.includes('worked example'))!;
      expect(example.parents).toEqual([own.id]);
      const works = (g: typeof own) => g.members.filter((m) => m.kind !== 'garden');
      expect(new Set([...works(own), ...works(example)].map((m) => m.id)).size).toBe(4);

      // Every undertaking has a usable notebook, editable without a model or key.
      const planningId = await openMember(page, entry.members[0]!);
      const planningFolder = (await storedCrux(page, planningId)).projectFolder as string;
      const frame = page.frameLocator('iframe[data-crux-id]');
      await openNote(page, 'Start here');
      await expect(frame.locator('body')).toHaveCSS('font-family', /Inter/);
      const note = frame.locator('.tiptap').first();
      await expect(note).toBeVisible();
      await note.click();
      await page.keyboard.press('ControlOrMeta+End');
      await page.keyboard.press('Enter');
      const manual = `My next step for ${entry.id}: make one change and inspect it.`;
      await page.keyboard.insertText(manual);
      await expect
        .poll(() => readFileSync(join(planningFolder, 'notebook/Start here.md'), 'utf8'), {
          timeout: 30000,
        })
        .toContain(manual);

      // The built-in collaboration loop uses native note tools on the same human-edited note.

      if ((await panelPressed(page, 'Toggle collaboration')) !== 'true')
        await togglePanel(page, 'Toggle collaboration');
      await page
        .getByPlaceholder('Send a message...')
        .fill(`[undertaking:next-step] ${entry.collaboratorTask}`);
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(
        page.getByText('Added the next step to your undertaking notebook.', { exact: true }),
      ).toBeVisible({ timeout: 120000 });
      await expect
        .poll(() => readFileSync(join(planningFolder, 'notebook/Start here.md'), 'utf8'))
        .toContain('Next session: inspect the first change, then choose what to improve.');
      expect(readFileSync(join(planningFolder, 'notebook/Start here.md'), 'utf8')).toContain(
        manual,
      );
      await page.screenshot({ path: join(out, 'collaboration.png') });

      // Exercise a creative edit in the actual deliverable, through its normal UI.
      const projectId = await openMember(page, entry.members[1]!);
      const folder = (await storedCrux(page, projectId)).projectFolder as string;
      if (entry.id === 'home-page' || entry.id === 'small-business') {
        await openBuilder(page);
        await page.getByRole('button', { name: /Site settings/ }).click();
        await page.getByRole('button', { name: 'Form', exact: true }).click();
        const label = entry.id === 'home-page' ? 'Your Name' : 'Business name';
        await page.getByLabel(label, { exact: true }).fill('Made by me');
        await page.keyboard.press('ControlOrMeta+S');
        await expect
          .poll(() => JSON.parse(readFileSync(join(folder, 'src/config.json'), 'utf8')).name)
          .toBe('Made by me');
      } else if (entry.id === 'small-game') {
        await openRootFile(page, 'game.json');
        const source = readFileSync(join(folder, 'game.json'), 'utf8');
        const original = JSON.parse(source);
        const editor = page.locator('.monaco-editor').first();
        await editor.click();
        await page.keyboard.press('ControlOrMeta+A');
        await page.keyboard.press('ArrowLeft');
        for (let n = 0; n < source.indexOf(original.title); n++)
          await page.keyboard.press('ArrowRight');
        for (let n = 0; n < original.title.length; n++)
          await page.keyboard.press('Shift+ArrowRight');
        await page.keyboard.insertText('My firefly game');
        await page.keyboard.press('ControlOrMeta+s');
        await expect
          .poll(() => {
            try {
              return JSON.parse(readFileSync(join(folder, 'game.json'), 'utf8')).title;
            } catch {
              return '';
            }
          })
          .toBe('My firefly game');

        if ((await panelPressed(page, 'Toggle workshop')) !== 'true')
          await togglePanel(page, 'Toggle workshop');
        await page.getByRole('button', { name: 'Clean', exact: true }).click();
        const game = page.frameLocator('iframe[data-crux-id]').last();
        await expect(game.getByRole('heading', { name: 'My firefly game' })).toBeVisible({
          timeout: 60000,
        });
        // The target moves after every catch; keyboard play verifies the same real button
        // without racing a pointer coordinate against its new position.
        for (let n = 0; n < original.target; n++) {
          await game.getByRole('button', { name: 'Catch the firefly' }).press('Enter');
          await expect(game.getByRole('status')).toContainText(
            n + 1 === original.target ? 'You caught them all' : `${n + 1} / ${original.target}`,
          );
        }
        await expect(game.getByRole('status')).toContainText('You caught them all');
      } else if (entry.id === 'research-question') {
        await openRootFile(page, 'observations.csv');
        await editCode(page, 'seedling,light_hours,height_cm\nA,2,4\nB,4,6\nC,6,8\nD,8,10\n');

        if ((await panelPressed(page, 'Toggle workshop')) !== 'true')
          await togglePanel(page, 'Toggle workshop');
        await page.getByRole('button', { name: 'Clean', exact: true }).click();
        const findings = page.frameLocator('iframe[data-crux-id]').last();
        await expect(findings.getByRole('status')).toContainText('Mean height: 7.00 cm', {
          timeout: 60000,
        });
        await expect(findings.locator('circle')).toHaveCount(4);
      } else if (entry.id === 'short-book') {
        const book = page.frameLocator('iframe[data-crux-id]');
        await openNote(page, 'The first page');
        await book.locator('.tiptap').first().click();
        await page.keyboard.press('ControlOrMeta+End');
        await page.keyboard.press('Enter');
        await page.keyboard.insertText('A sentence of my own.');
        await expect
          .poll(() => readFileSync(join(folder, 'notebook/The first page.md'), 'utf8'))
          .toContain('A sentence of my own.');
        await revealOptionsFor(
          book.getByRole('button', { includeHidden: true, name: 'Save book (EPUB)', exact: true }),
        );
        await book.getByRole('button', { name: 'Save book (EPUB)', exact: true }).click();
        await expect
          .poll(() => existsSync(join(folder, 'dist/my-short-book.epub')), { timeout: 9 * 60_000 })
          .toBe(true);
        const epub = await JSZip.loadAsync(readFileSync(join(folder, 'dist/my-short-book.epub')));
        expect(await epub.file('mimetype')!.async('text')).toBe('application/epub+zip');
      } else {
        await openBuilder(page);
        await page
          .getByRole('button', { name: /A place I remember/ })
          .first()
          .click();
        const source = readFileSync(join(folder, 'content/posts/hello-from-the-garden.md'), 'utf8');
        await editCode(page, source.replace('A place I remember', 'A memory of my own'));
        await expect
          .poll(() => readFileSync(join(folder, 'content/posts/hello-from-the-garden.md'), 'utf8'))
          .toContain('A memory of my own');
      }
      await page.screenshot({ path: join(out, 'manual-edit.png') });
      await home(page);
      await page
        .getByRole('main')
        .getByRole('button', { name: `Open ${example.title}` })
        .click();
      await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
        example.title,
      );
      const work = page.getByRole('region', { name: 'Garden work', exact: true });
      await work.getByRole('button', { name: 'History', exact: true }).click();
      const story = page.getByTestId('cruxspace-story');
      await story.getByRole('button', { name: 'Start walkthrough', exact: true }).click();
      const walk = story.getByRole('status', { name: 'Walkthrough', exact: true });
      await expect(walk).toContainText('step 1 of');
      let steps = 1;
      while (await story.getByRole('button', { name: 'Next step', exact: true }).isEnabled()) {
        await story.getByRole('button', { name: 'Next step', exact: true }).click();
        steps++;
        expect(steps).toBeLessThan(100);
        await expect(walk).toContainText(`step ${steps} of`);
      }
      expect(steps).toBeGreaterThanOrEqual(6);
      await page.screenshot({ path: join(out, 'walkthrough.png') });
      await story.getByRole('button', { name: 'Back to now', exact: true }).click();
      await page.getByRole('button', { name: 'Close Garden history', exact: true }).click();
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
        entry.name,
      );
      // The public package import UI round-trips the customized collection in a clean garden.
      const archive = join(first.dir, `${entry.id}.cruxspace`);
      await instance.app.evaluate(({ session }, path) => {
        session.defaultSession.once('will-download', (_event, item) => item.setSavePath(path));
      }, archive);
      await work.getByRole('button', { name: 'Export Garden', exact: true }).click();
      await expect.poll(() => existsSync(archive), { timeout: 180000 }).toBe(true);
      await expect(page.getByText(/Exported .* with 2 member Cruxes/)).toBeVisible({
        timeout: 180000,
      });
      await instance.app.close();
      instance = await launchApp({ dir: first.dir });
      page = instance.page;
      await page.getByRole('button', { name: /enter/i }).click();
      await expect(
        page.getByRole('button', { name: 'Switch Crux workspace', exact: true }),
      ).toBeVisible();
      await home(page);
      const persisted = await page.evaluate(
        async (id) =>
          window.electronAPI!.sqlite.get(
            "SELECT id FROM cruxes WHERE id = ? AND kind = 'garden' AND deleted IS NULL",
            [id],
          ),
        own.id,
      );
      expect(persisted).toBeTruthy();
      expect(readFileSync(join(planningFolder, 'notebook/Start here.md'), 'utf8')).toContain(
        manual,
      );
      await instance.app.close();
      instance = await launchApp();
      page = instance.page;
      await enterGarden(page);
      await page.getByLabel('Garden package', { exact: true }).setInputFiles(archive);
      await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
        entry.name,
        { timeout: 180000 },
      );
      const copiedId = await openMember(page, entry.members[0]!);
      const copiedFolder = (await storedCrux(page, copiedId)).projectFolder as string;
      expect(readFileSync(join(copiedFolder, 'notebook/Start here.md'), 'utf8')).toContain(manual);
    } finally {
      await instance.app.close().catch(() => {});
    }
  });
}
