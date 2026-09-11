import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
const examples = [
  ['tables', 'Tables'],
  ['smplr', 'Sample sequencer'],
  ['playcanvas', '3D Workshop'],
] as const;
for (const [type, label] of examples)
  test(`${label}: manual creation, agent operation, saved output, conflict and restart`, async () => {
    test.setTimeout(150000);
    const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    const evidence = resolve(__dirname, '../../docs/tool-sampler');
    mkdirSync(evidence, { recursive: true });
    let folder = '',
      id = '';
    try {
      const { page } = first;
      page.on('pageerror', (e) => console.log(type, e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') console.log(type, m.text());
      });
      page.on('requestfailed', (r) => console.log(type, r.url(), r.failure()?.errorText));
      await page.setViewportSize({ width: 1600, height: 1050 });
      await enterGarden(page);
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: new RegExp('^' + label) }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible();
      id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      const frame = page.frameLocator('iframe[data-crux-id]');
      await expect(frame.locator('#save-state')).toHaveText('Saved in this Crux', {
        timeout: 45000,
      });
      await expect(frame.locator('#error')).toBeHidden();
      const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
      const blocked: string[] = [];
      const context = page.context();
      await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => {
        blocked.push(route.request().url());
        return route.abort();
      });
      if (type === 'tables') {
        await expect(frame.locator('.tabulator-title-editor').first()).toHaveValue('Task');
        const cell = frame.locator('.tabulator-row').first().locator('[tabulator-field="task"]');
        await cell.dblclick();
        await cell.locator('input').fill('Plan the showcase');
        await cell.locator('input').press('Enter');
        await expect.poll(() => doc().rows[0].task).toBe('Plan the showcase');
        await frame.getByLabel('Filter rows').fill('feedback');
        await expect(frame.locator('.tabulator-row')).toHaveCount(1);
        await frame.getByLabel('Filter rows').fill('');
        await frame.getByLabel('New column name').fill('Due date');
        await frame.getByRole('button', { name: 'Add column', exact: true }).click();
        await expect.poll(() => doc().columns.length).toBe(5);
      } else if (type === 'smplr') {
        await frame.getByRole('button', { name: 'clap step 4', exact: true }).click();
        await expect.poll(() => doc().pattern.clap[3]).toBe(true);
        await frame.getByRole('button', { name: 'Play pattern', exact: true }).click();
        await expect(frame.locator('#playing')).toHaveText('Playing through smplr');
        await expect.poll(() => frame.locator('#meter').getAttribute('data-peak')).not.toBeNull();
        await expect
          .poll(async () => Number(await frame.locator('#meter').getAttribute('data-peak')))
          .toBeGreaterThan(0.00001);
        await frame.getByRole('button', { name: 'Stop', exact: true }).click();
        await expect(frame.locator('#playing')).toHaveText('Silent');
      } else {
        await frame.getByRole('button', { name: 'Add cone', exact: true }).click();
        await expect.poll(() => doc().objects.length).toBe(3);
        await frame.getByLabel('position X', { exact: true }).fill('3');
        await frame.getByLabel('position X', { exact: true }).press('Tab');
        await expect.poll(() => doc().objects[2].position[0]).toBe(3);
        const values = await frame.locator('body').evaluate(() => {
          const values = (window as any).sceneWorkshop.inspect();
          console.log('Scene bounds', JSON.stringify(values));
          return values;
        });
        writeFileSync(
          join(evidence, 'playcanvas-bounds.json'),
          JSON.stringify(values, null, 2) + '\n',
        );
        expect(values).toHaveLength(3);
        expect(values[0].position).toEqual([0, 1, 0]);
        expect(values.every((v: any) => v.bounds.length > 0)).toBe(true);
        await frame.getByRole('button', { name: 'Front view', exact: true }).click();
        await page.screenshot({ path: join(evidence, 'playcanvas-front.png') });
        await frame.getByRole('button', { name: 'Isometric view', exact: true }).click();
      }
      const chat = page.getByPlaceholder('Send a message...');
      await chat.fill(`Help with this project [sampler:${type}]`);
      await chat.press('Enter');
      await expect(
        page.getByText(`Saved ${type} project with app tools.`, { exact: true }),
      ).toBeVisible({ timeout: 35000 });
      if (type === 'tables') {
        await expect.poll(() => doc().rows[0].hours).toBe(9);
        expect(doc().rows[0].task).toBe('Plan the showcase');
      }
      if (type === 'smplr') {
        await expect.poll(() => doc().bpm).toBe(128);
        expect(doc().pattern.clap[3]).toBe(true);
      }
      if (type === 'playcanvas') {
        await expect.poll(() => doc().objects[0].name).toBe('Agent sun');
        expect(doc().objects.length).toBe(3);
      }
      await expect(frame.locator('#error')).toBeHidden();
      await page.screenshot({ path: join(evidence, type + '.png') });
      const output = join(first.dir, 'exported-output');
      await first.app.evaluate(({ session }, path) => {
        session.defaultSession.once('will-download', (_event, item) => item.setSavePath(path));
      }, output);
      await frame.locator('#export').click();
      await expect.poll(() => existsSync(output)).toBe(true);
      const bytes = readFileSync(output);
      expect(bytes.length).toBeGreaterThan(10);
      if (type === 'smplr' || type === 'playcanvas')
        expect(JSON.parse(bytes.toString())).toEqual(doc());
      if (type === 'tables') {
        expect(bytes.toString()).toContain('Plan the showcase');
        expect(bytes.toString()).toContain('Ready');
        page.once('dialog', (d) => d.accept());
        await frame.getByLabel('Import CSV', { exact: true }).setInputFiles({
          name: 'Contacts.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from('Code,Name\n0012,"Rivera, Alex"'),
        });
        await expect.poll(() => doc().rows[0]?.['column-1']).toBe('0012');
        expect(doc().rows[0]['column-2']).toBe('Rivera, Alex');
      }
      expect(blocked).toEqual([]);
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
    } finally {
      await first.page.screenshot({ path: join(evidence, type + '-last.png') }).catch(() => {});
      await first.app.close();
    }
    const second = await launchApp({ dir: first.dir });
    try {
      const { page } = second;
      await page.getByRole('button', { name: /enter/i }).click();
      const frame = page.frameLocator('iframe[data-crux-id]');
      await expect(frame.getByLabel('Project title', { exact: true })).toHaveValue(
        'Saved elsewhere',
        { timeout: 45000 },
      );
      await expect(frame.locator('#error')).toBeHidden();
      if (type === 'smplr') await expect(frame.locator('#playing')).toHaveText('Silent');
    } finally {
      await second.app.close();
    }
  });
