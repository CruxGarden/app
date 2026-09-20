import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { collaborator, outputs } from './game-cruxspace-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

for (const kind of ['Notes', 'Spreadsheet'] as const) {
  test(`${kind} depth: person, collaborator, native Undo, revised work, outputs, restart and clean import`, async () => {
    test.setTimeout(420000);
    let instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    const dir = instance.dir;
    const archive = join(dir, 'productivity.crux');
    const evidence = resolve(__dirname, '../../docs/productivity-depth');
    mkdirSync(evidence, { recursive: true });
    let folder = '';
    const frame = () => instance.page.frameLocator('iframe[data-crux-id]');
    const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
    const note = () => readFileSync(join(folder, 'notebook/Brief.md'), 'utf8');
    const ready = async () => {
      if (kind === 'Notes')
        await expect(frame().locator('#garden-project [role=status]')).toHaveText('Saved', {
          timeout: 90000,
        });
      else {
        await expect(frame().locator('#editor')).toHaveAttribute('data-ready', 'true', {
          timeout: 90000,
        });
        await expect(frame().locator('#save-state')).toHaveText('Saved in this Crux');
        await expect(frame().locator('#error')).toBeHidden();
      }
    };
    const verifySaved = async () => {
      if (kind === 'Notes') {
        expect(note()).toContain('Budget is 180.');
        expect(note()).toContain('Saturday');
        expect(note()).toContain('Next steps: confirm the venue.');
        const output = outputs(folder).find((o) => o.mimeType.includes('wordprocessingml'))!;
        expect(output).toBeTruthy();
        expect(
          execFileSync('unzip', ['-p', join(folder, output.path), 'word/document.xml']).toString(),
        ).toContain('Saturday');
        await frame().getByRole('button', { name: 'Brief', exact: true }).first().click();
        await expect(frame().locator('.tiptap').first()).toContainText('Budget is 180.');
        await expect(frame().locator('.tiptap').first()).toContainText('Saturday');
      } else {
        const w = doc().workbook;
        const cells = w.sheets['budget-sheet'].cellData;
        expect(cells[1][0].v).toBe('Showcase supplies');
        expect(cells[1][1].v).toBe(10);
        expect(cells[1][3].v).toBe(120);
        expect(cells[5][3].v).toBe(200);
        expect(w.sheetOrder).toHaveLength(2);
        const assumptions = Object.values(w.sheets).find(
          (s: any) => s.name === 'Planning assumptions',
        ) as any;
        expect(assumptions.cellData[1][1].v).toBe(200);
        const style = typeof cells[0][0].s === 'string' ? w.styles[cells[0][0].s] : cells[0][0].s;
        expect(style.bl).toBe(1);
        expect(style.bg.rgb).toBe('#d8ead5');
        const costStyle =
          typeof cells[1][2].s === 'string' ? w.styles[cells[1][2].s] : cells[1][2].s;
        expect(costStyle.n.pattern).toBe('$#,##0.00');
        const csv = outputs(folder).find((o) => o.label === 'Revised budget')!;
        expect(csv.mimeType).toBe('text/csv');
        expect(readFileSync(join(folder, csv.path), 'utf8')).toContain(
          'Showcase supplies,10,12,120',
        );
      }
    };
    try {
      let page = instance.page;
      page.setDefaultTimeout(60000);
      await page.setViewportSize({ width: 1800, height: 1100 });
      await enterGarden(page);
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: new RegExp('^' + kind) }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible();
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      await ready();
      if (kind === 'Notes') {
        await frame().getByRole('button', { name: 'Add Note or Folder', exact: true }).click();
        await frame()
          .getByRole('menuitem', { name: /New Note/ })
          .click();
        await frame().getByRole('button', { name: 'Untitled', exact: true }).first().click();
        await frame().getByLabel('Note title', { exact: true }).fill('Brief');
        await frame().getByLabel('Note title', { exact: true }).press('Enter');
        const editor = frame().locator('.tiptap').first();
        await editor.fill('Workshop brief. Budget is 120.');
        await collaborator(
          page,
          'Revise this brief [productivity:note]',
          'Revised the brief and added next steps.',
        );
        await expect(editor).toContainText('Budget is 180.');
        await editor.click();
        await editor.press('Meta+z');
        await expect(editor).not.toContainText('Next steps:');
        await expect(editor).toContainText('Budget is 180.');
        await editor.press('Meta+Shift+z');
        await expect(editor).toContainText('Next steps:');
        await editor.press('Meta+ArrowDown');
        await editor.press('Enter');
        await page.keyboard.type('We meet Friday.');
        await collaborator(
          page,
          'Move my meeting to Saturday [productivity:note-followup]',
          'Updated the revised brief and exported Word.',
        );
      } else {
        const address = frame().locator('[data-u-comp="defined-name"] input');
        await address.fill('A2');
        await address.press('Enter');
        await page.keyboard.type('Showcase supplies');
        await page.keyboard.press('Enter');
        await collaborator(
          page,
          'Organize this budget [productivity:budget]',
          'Organized the budget, formatted costs and saved CSV.',
        );
        // The added sheet is active; return to Budget through the native tab.
        await frame().getByText('Budget', { exact: true }).last().click();
        await address.fill('B2');
        await address.press('Enter');
        // Undo the collaborator's last native formatting command, then redo it.
        await page.keyboard.press('Meta+z');
        await frame().locator('#save').click();
        await ready();
        const cells = doc().workbook.sheets['budget-sheet'].cellData;
        const beforeStyle =
          typeof cells[1][2]?.s === 'string'
            ? doc().workbook.styles[cells[1][2].s]
            : cells[1][2]?.s;
        expect(beforeStyle?.n).toBeFalsy();
        await address.fill('B2');
        await address.press('Enter');
        // Univer's native Redo binding is Command+Y (not Tigrana's Command+Shift+Z).
        await page.keyboard.press('Meta+y');
        await address.fill('B2');
        await address.press('Enter');
        await page.keyboard.type('10');
        await page.keyboard.press('Enter');
        await expect.poll(() => doc().workbook.sheets['budget-sheet'].cellData[1][1].v).toBe(10);
        await collaborator(
          page,
          'Update costs using my revised quantities [productivity:budget-followup]',
          'Updated the revised budget and saved CSV.',
        );
        await frame().locator('#save-csv').click();
        await expect.poll(() => outputs(folder).length).toBe(3);
      }
      await ready();
      await verifySaved();
      await page.screenshot({ path: join(evidence, `${kind.toLowerCase()}-edited.png`) });
      await instance.app.close();
      instance = await launchApp({ dir });
      page = instance.page;
      page.setDefaultTimeout(60000);
      await page.setViewportSize({ width: 1800, height: 1100 });
      await page.getByRole('button', { name: /enter/i }).click();
      await ready();
      await verifySaved();
      await page.screenshot({ path: join(evidence, `${kind.toLowerCase()}-reopened.png`) });
      await exportNativeCrux(page, archive, instance.app);
      await instance.app.close();
      renameSync(folder, `${folder}-unavailable`);
      instance = await launchApp();
      page = instance.page;
      page.setDefaultTimeout(60000);
      await page.setViewportSize({ width: 1800, height: 1100 });
      await enterGarden(page);
      await importNativeCrux(page, archive);
      const importedId = (await page
        .locator('[data-workspace-id]')
        .getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, importedId)).projectFolder;
      await ready();
      await verifySaved();
      await page.screenshot({ path: join(evidence, `${kind.toLowerCase()}-imported.png`) });
    } finally {
      await instance.app.close().catch(() => {});
    }
  });
}
