import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { collaborator, outputs } from './game-cruxspace-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';
for (const kind of ['SVG-Edit', 'Layout'] as const) {
  test(`${kind}: create, native editing, shared Undo, revise, outputs, restart and import`, async () => {
    test.setTimeout(420000);
    let instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    const dir = instance.dir;
    const archive = join(dir, 'web-print.crux');
    const evidence = resolve(__dirname, '../../docs/web-print-depth');
    mkdirSync(evidence, { recursive: true });
    let folder = '';
    const frame = () => instance.page.frameLocator('iframe[data-crux-id]');
    const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
    const ready = async () => {
      await expect(frame().locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
        timeout: 90000,
      });
    };
    const verify = async () => {
      if (kind === 'SVG-Edit') {
        await expect(frame().locator('#svgcontent text')).toHaveText('Seed swap Saturday');
        await expect
          .poll(() => {
            const ref = doc().project.svg.__cruxBinary;
            return JSON.parse(readFileSync(join(folder, 'data', ref.path), 'utf8'));
          })
          .toContain('Seed swap Saturday');
        await expect(frame().locator('#svgcontent rect')).toHaveCount(2);
        const svg = outputs(folder).find((o) => o.mimeType === 'image/svg+xml')!;
        expect(svg).toBeTruthy();
        expect(readFileSync(join(folder, svg.path), 'utf8')).toContain('Seed swap Saturday');
      } else {
        const state = doc().project;
        expect(state.name).toBe('My seed swap');
        expect(state.template.schemas).toHaveLength(2);
        expect(state.template.schemas[0][0].content).toBe('Seed library');
        expect(state.template.schemas[1][0].content).toBe('Bring seeds to share on Saturday.');
        expect(state.template.schemas[1][0].fontSize).toBe(20);
        const outs = outputs(folder);
        expect(outs.map((o) => o.mimeType).sort()).toEqual(['application/pdf', 'image/png']);
        expect(
          readFileSync(join(folder, outs.find((o) => o.mimeType === 'application/pdf')!.path))
            .subarray(0, 4)
            .toString(),
        ).toBe('%PDF');
        await frame().getByRole('tab', { name: 'Preview' }).click();
        await expect(frame().locator('#viewer').getByText('Seed library')).toBeVisible();
        // Both pages render in the native Viewer; inspect its second page text too.
        await expect(
          frame().locator('#viewer').getByText('Bring seeds to share on Saturday.'),
        ).toBeAttached();
        await frame().getByRole('tab', { name: 'Design' }).click();
        await expect(
          frame().locator('#designer').getByText('Seed library', { exact: true }),
        ).toBeVisible();
        await frame().getByRole('tab', { name: 'Preview' }).click();
        await expect(frame().locator('#viewer').getByText('Seed library')).toBeVisible();
        await instance.page.waitForTimeout(500);
        copyFileSync(
          join(folder, outs.find((o) => o.mimeType === 'application/pdf')!.path),
          join(evidence, 'handout.pdf'),
        );
        copyFileSync(
          join(folder, outs.find((o) => o.mimeType === 'image/png')!.path),
          join(evidence, 'handout-page-two.png'),
        );
      }
    };
    try {
      let page = instance.page;
      page.setDefaultTimeout(60000);
      await page.setViewportSize({ width: 2000, height: 1200 });
      await enterGarden(page);
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: new RegExp('^' + kind + '\\b') }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible();
      folder = (
        await storedCrux(
          page,
          (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!,
        )
      ).projectFolder;
      await ready();
      if (kind === 'SVG-Edit') {
        await frame().locator('#tools_rect .menu-button').click();
        await page.waitForTimeout(600);
        const box = (await frame().locator('#svgcontent').boundingBox())!;
        await page.mouse.move(box.x + 60, box.y + 60);
        await page.mouse.down();
        await page.mouse.move(box.x + 230, box.y + 160, { steps: 10 });
        await page.mouse.up();
        await expect(frame().locator('#svgcontent rect')).toHaveCount(1);
        await collaborator(
          page,
          'Make a site badge [webprint:svg]',
          'Added the site badge with editable shapes and text.',
        );
        await expect(frame().locator('#svgcontent text')).toHaveText('Seed library');
        await frame().locator('#tool_undo').click();
        await expect(frame().locator('#svgcontent text')).toHaveCount(0);
        await frame().locator('#tool_redo').click();
        await expect(frame().locator('#svgcontent text')).toHaveText('Seed library');
        // A person changes the newly created text through the editor's own field.
        await frame().locator('#tool_select').click();
        await frame().locator('#svgcontent text').click();
        await frame().locator('#text').fill('Seed exchange');
        await frame().locator('#text').press('Tab');
        await expect(frame().locator('#svgcontent text')).toHaveText('Seed exchange');
        await collaborator(
          page,
          'Update my badge [webprint:svg-revise]',
          'Revised the badge and saved reusable SVG.',
        );
      } else {
        await frame().locator('#layout-name').fill('Seed swap draft');
        await ready();
        await collaborator(
          page,
          'Make a handout [webprint:layout]',
          'Prepared the two-page handout.',
        );
        await ready();
        expect(doc().project.template.schemas[1]).toHaveLength(1);
        await frame().getByRole('button', { name: 'Undo', exact: true }).click();
        await ready();
        expect(doc().project.template.schemas[1]).toHaveLength(0);
        await frame().getByRole('button', { name: 'Undo', exact: true }).click();
        await ready();
        expect(doc().project.template.schemas).toHaveLength(1);
        await frame().getByRole('button', { name: 'Redo', exact: true }).click();
        await frame().getByRole('button', { name: 'Redo', exact: true }).click();
        await ready();
        expect(doc().project.template.schemas[1]).toHaveLength(1);
        await frame().locator('#layout-name').fill('My seed swap');
        await collaborator(
          page,
          'Revise page two [webprint:layout-revise]',
          'Revised page two and exported the handout.',
        );
      }
      await ready();
      await verify();
      await page.screenshot({ path: join(evidence, `${kind}-edited.png`) });
      await instance.app.close();
      instance = await launchApp({ dir });
      page = instance.page;
      page.setDefaultTimeout(60000);
      await page.setViewportSize({ width: 2000, height: 1200 });
      await page.getByRole('button', { name: /enter/i }).click();
      await ready();
      await verify();
      await page.screenshot({ path: join(evidence, `${kind}-reopened.png`) });
      await exportNativeCrux(page, archive, instance.app);
      await instance.app.close();
      renameSync(folder, `${folder}-unavailable`);
      instance = await launchApp();
      page = instance.page;
      page.setDefaultTimeout(60000);
      await page.setViewportSize({ width: 2000, height: 1200 });
      await enterGarden(page);
      await importNativeCrux(page, archive);
      folder = (
        await storedCrux(
          page,
          (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!,
        )
      ).projectFolder;
      await ready();
      await verify();
      await page.screenshot({ path: join(evidence, `${kind}-imported.png`) });
    } finally {
      await instance.app.close().catch(() => {});
    }
  });
}
