import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

for (const [type, label] of [
  ['excalidraw', 'Whiteboard'],
  ['univer', 'Spreadsheet'],
] as const)
  test(`${label}: native edits, agent edits, export, conflict and reopen`, async () => {
    test.setTimeout(180000);
    const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    const { app, page } = first;
    const errors: string[] = [];
    let folder = '';
    const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
    try {
      page.on('response', (r) => {
        if (r.status() >= 400 && /127\.0\.0\.1:\d+\/(vendor|shared|data)\//.test(r.url()))
          errors.push(r.url());
      });
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setViewportSize({ width: 1600, height: 1050 });
      await enterGarden(page);
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: new RegExp('^' + label) }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      const frame = page.frameLocator('iframe[data-crux-id]');
      await expect(frame.locator('#editor')).toHaveAttribute('data-ready', 'true', {
        timeout: 90000,
      });
      await expect(frame.locator('#error')).toBeHidden();
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      await expect
        .poll(async () =>
          frame
            .locator('canvas')
            .evaluateAll((cs) => cs.some((c) => c.getBoundingClientRect().height > 200)),
        )
        .toBe(true);
      if (type === 'univer') {
        const address = frame.locator('[data-u-comp="defined-name"] input');
        await address.fill('A2');
        await address.press('Enter');
        await page.keyboard.type('Showcase supplies');
        await page.keyboard.press('Enter');
        await expect
          .poll(() => doc().workbook.sheets['budget-sheet'].cellData[1][0].v)
          .toBe('Showcase supplies');
      } else {
        const canvas = frame.locator('canvas.excalidraw__canvas.interactive');
        await canvas.click({ position: { x: 650, y: 400 } });
        await page.keyboard.press('r');
        const box = (await canvas.boundingBox())!;
        await page.mouse.move(box.x + 650, box.y + 400);
        await page.mouse.down();
        await page.mouse.move(box.x + 820, box.y + 510, { steps: 8 });
        await page.mouse.up();
        await expect
          .poll(() => doc().scene.elements.filter((e: any) => !e.isDeleted).length)
          .toBe(3);
      }
      await page.getByRole('button', { name: 'Ask agent', exact: true }).click();
      await page
        .getByPlaceholder('Send a message...')
        .fill(`Help with this project [sampler:${type}]`);
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(
        page.getByText(`Saved ${type} project with app tools.`, { exact: true }),
      ).toBeVisible({ timeout: 35000 });
      if (type === 'univer') {
        const cells = doc().workbook.sheets['budget-sheet'].cellData;
        expect(cells[1][0].v).toBe('Showcase supplies');
        expect(cells[1][1].v).toBe(8);
        expect(cells[1][3].v).toBe(96);
        expect(cells[5][3].v).toBe(166);
      } else {
        expect(doc().scene.elements.find((e: any) => e.id === 'idea').backgroundColor).toBe(
          '#a5d8ff',
        );
        expect(doc().scene.elements.filter((e: any) => !e.isDeleted)).toHaveLength(4);
      }
      await expect(frame.locator('#save-state')).toHaveText('Saved in this Crux');
      await expect(frame.locator('#error')).toBeHidden();
      await page.screenshot({ path: test.info().outputPath(type + '.png') });
      for (const kind of type === 'univer' ? ['project', 'csv'] : ['project', 'png', 'svg']) {
        const output = join(first.dir, 'exported-' + kind);
        await app.evaluate(({ session }, path) => {
          session.defaultSession.once('will-download', (_event, item) => item.setSavePath(path));
        }, output);
        await frame.locator('#export-' + kind).click();
        await expect.poll(() => existsSync(output)).toBe(true);
        const bytes = readFileSync(output);
        if (kind === 'png') expect(bytes.subarray(1, 4).toString()).toBe('PNG');
        if (kind === 'svg') expect(bytes.toString()).toContain('<svg');
        if (kind === 'csv') {
          expect(bytes.toString()).toContain('Showcase supplies,8,12,96');
          expect(bytes.toString()).toContain('166');
        }
        if (kind === 'project') {
          const exported = JSON.parse(bytes.toString());
          if (type === 'univer') expect(exported.sheets['budget-sheet'].cellData[5][3].v).toBe(166);
          else expect(exported.elements).toHaveLength(4);
        }
      }
      const external = doc();
      external.title = 'Saved elsewhere';
      writeFileSync(join(folder, 'data/project.json'), JSON.stringify(external));
      await frame.getByLabel('Project title', { exact: true }).fill('My unsaved draft');
      await frame.getByLabel('Project title', { exact: true }).press('Tab');
      await expect(frame.locator('#error')).toContainText('changed elsewhere');
      expect(doc().title).toBe('Saved elsewhere');
      await expect(frame.getByLabel('Project title', { exact: true })).toHaveValue(
        'My unsaved draft',
      );
      page.once('dialog', (d) => d.accept());
      await frame.getByRole('button', { name: 'Reload saved project', exact: true }).click();
      await expect(frame.getByLabel('Project title', { exact: true })).toHaveValue(
        'Saved elsewhere',
      );
      await expect(frame.locator('#error')).toBeHidden();
      expect(errors).toEqual([]);
    } finally {
      await page.screenshot({ path: test.info().outputPath(type + '-last.png') }).catch(() => {});
      await app.close();
    }
    const second = await launchApp({ dir: first.dir });
    try {
      await second.page.getByRole('button', { name: /enter/i }).click();
      const frame = second.page.frameLocator('iframe[data-crux-id]');
      await expect(frame.locator('#editor')).toHaveAttribute('data-ready', 'true', {
        timeout: 60000,
      });
      await expect(frame.getByLabel('Project title', { exact: true })).toHaveValue(
        'Saved elsewhere',
      );
      await expect(frame.locator('#error')).toBeHidden();
      if (type === 'univer')
        expect(doc().workbook.sheets['budget-sheet'].cellData[1][3].v).toBe(96);
      else expect(doc().scene.elements.filter((e: any) => !e.isDeleted)).toHaveLength(4);
    } finally {
      await second.app.close();
    }
  });
