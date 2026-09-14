import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { collaborator, outputs } from './game-cruxspace-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

test('notebook depth: agent analysis, native error recovery, manual notes, Undo, outputs and portable re-execution', async () => {
  test.setTimeout(600000);
  let instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const dir = instance.dir;
  const archive = join(dir, 'seed-trial.crux');
  const evidence = resolve(__dirname, '../../docs/notebook-depth');
  mkdirSync(evidence, { recursive: true });
  let folder = '';
  const frame = () => instance.page.frameLocator('iframe[data-crux-id]');
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const notebook = () => {
    const file = doc().project?.files.find((f: any) => f.path === 'seed-trial.ipynb');
    return file
      ? JSON.parse(readFileSync(join(folder, 'data', file.content.__cruxBinary.path), 'utf8'))
      : null;
  };
  const source = (cell: any) => (Array.isArray(cell.source) ? cell.source.join('') : cell.source);
  const ready = () =>
    expect(frame().locator('#garden-project [role=status]')).toHaveText('Saved to Garden', {
      timeout: 90000,
    });
  const save = async () => {
    await frame().getByRole('button', { name: 'Save project', exact: true }).click();
    await ready();
  };
  const offline = () =>
    instance.app.evaluate(({ session }) => {
      session.defaultSession.webRequest.onBeforeRequest(
        { urls: ['http://*/*', 'https://*/*'] },
        (details, done) =>
          done({
            cancel: !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(details.url).hostname),
          }),
      );
    });
  async function calls() {
    // This isolated Garden contains one Crux. After portable import, Collaboration
    // lives in history records rather than inline on the root Crux metadata.
    return instance.page.evaluate(async () => {
      const rows = await window.electronAPI!.sqlite.all('SELECT meta FROM cruxes');
      const byId = new Map<string, any>();
      for (const row of rows as { meta: string }[]) {
        const meta = JSON.parse(row.meta || '{}');
        for (const message of meta.messages ?? [])
          for (const call of message.toolCalls ?? []) {
            if (!byId.has(call.id) || !byId.get(call.id).result) byId.set(call.id, call);
          }
      }
      return [...byId.values()];
    });
  }
  async function rerun(message: string) {
    const prior = (await calls()).filter((c: any) => c.name === 'run_jupyterlite_cell').length;
    await collaborator(instance.page, message, 'Re-executed the saved analysis in a fresh kernel.');
    // Imported Collaboration includes the old closing sentence. Wait for this execution's result.
    await expect
      .poll(
        async () => {
          const runs = (await calls()).filter((c: any) => c.name === 'run_jupyterlite_cell');
          return runs.length > prior && !!runs.at(-1)?.result;
        },
        { timeout: 120000 },
      )
      .toBe(true);
    const runs = (await calls()).filter((c: any) => c.name === 'run_jupyterlite_cell');
    expect(JSON.parse(runs.at(-1).result).executionSucceeded).toBe(true);
    await expect(
      instance.page.getByRole('button', { name: 'Stop', exact: true }),
    ).not.toBeVisible();
  }
  async function manualNote(text: string) {
    const toggle = instance.page.getByRole('button', { name: 'Toggle collaboration' });
    if ((await toggle.getAttribute('aria-pressed')) === 'true') await toggle.click();
    const markdown = frame().locator('.jp-MarkdownCell').first();
    await markdown.dblclick();
    const editor = markdown.locator('.cm-content');
    await editor.click();
    await instance.page.keyboard.press('Meta+End');
    await instance.page.keyboard.insertText(text);
    await save();
    await expect
      .poll(() => source(notebook().cells.find((c: any) => c.cell_type === 'markdown')))
      .toContain(text.trim());
  }
  const check = () => {
    expect(notebook().cells).toHaveLength(3);
    expect(source(notebook().cells[0])).toContain('Three measured seedlings');
    expect(source(notebook().cells[0])).toContain('Measured before watering.');
    expect(source(notebook().cells[2])).toContain('Mean height is 4 cm');
    const code = notebook().cells.find((c: any) => c.cell_type === 'code');
    expect(code.outputs.some((o: any) => o.output_type === 'error')).toBe(false);
    expect(code.outputs.some((o: any) => o.data?.['image/png'])).toBe(true);
    expect(code.outputs.some((o: any) => JSON.stringify(o).includes('Mean height: 4.0'))).toBe(
      true,
    );
    expect(outputs(folder).some((o) => o.mimeType === 'application/x-ipynb+json')).toBe(true);
    expect(doc().project.files.some((f: any) => f.path === 'observations.csv')).toBe(true);
  };
  try {
    await offline();
    let page = instance.page;
    page.setDefaultTimeout(60000);
    page.on('pageerror', (error) => console.log('Notebook page error:', error.message));
    await page.setViewportSize({ width: 1800, height: 1100 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^JupyterLite/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await ready();
    folder = (
      await storedCrux(
        page,
        (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!,
      )
    ).projectFolder;
    const chooser = page.waitForEvent('filechooser');
    await frame().locator('.jp-id-upload').click();
    await (
      await chooser
    ).setFiles({
      name: 'observations.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Plant,Height_cm\nA,2\nB,4\nC,6\n'),
    });
    await expect
      .poll(() => doc().project.files.some((f: any) => f.path === 'observations.csv'))
      .toBe(true);
    await collaborator(
      page,
      'Analyze the dataset [jupyterlite:depth-create]',
      'Analyzed the seed trial, corrected the column error and saved the notebook and plot.',
    );
    await save();
    const initialCalls = await calls();
    expect(initialCalls.filter((c: any) => c.result?.startsWith('Error'))).toEqual([]);
    const runs = initialCalls.filter(
      (c: any) => c.name === 'run_jupyterlite_cell' || c.toolName === 'run_jupyterlite_cell',
    );
    expect(runs).toHaveLength(2);
    expect(JSON.parse(runs[0].result).executionSucceeded).toBe(false);
    expect(JSON.parse(runs[0].result).cells[0].outputs[0].name).toContain('KeyError');
    expect(JSON.parse(runs[1].result).executionSucceeded).toBe(true);
    await expect(frame().locator('.jp-OutputArea-output img')).toBeVisible();
    const output = outputs(folder).find((o) => o.label === 'Seedling heights')!;
    const png = readFileSync(join(folder, output.path));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBeGreaterThan(300);
    copyFileSync(join(folder, output.path), join(evidence, 'seedling-heights.png'));
    const exported = outputs(folder).find((o) => o.label === 'Seed trial analysis')!;
    expect(
      JSON.parse(readFileSync(join(folder, exported.path), 'utf8')).cells.some((c: any) =>
        c.outputs?.some((o: any) => o.data?.['image/png']),
      ),
    ).toBe(true);
    await manualNote('\nMeasured before watering.');
    await collaborator(
      page,
      'Clarify the introduction [jupyterlite:depth-note]',
      'Clarified the introduction while retaining your note.',
    );
    const noteEditor = frame().locator('.jp-MarkdownCell').first();
    await noteEditor.dblclick();
    await noteEditor.locator('.cm-content').click();
    await page.keyboard.press('Meta+z');
    await save();
    expect(source(notebook().cells.find((c: any) => c.cell_type === 'markdown'))).toContain(
      'Three measurements',
    );
    expect(source(notebook().cells.find((c: any) => c.cell_type === 'markdown'))).toContain(
      'Measured before watering.',
    );
    await noteEditor.locator('.cm-content').click();
    await page.keyboard.press('Meta+Shift+z');
    await save();
    expect(source(notebook().cells.find((c: any) => c.cell_type === 'markdown'))).toContain(
      'Three measured seedlings',
    );

    await collaborator(
      page,
      'Clarify and organize the analysis [jupyterlite:depth-revise]',
      'Revised the analysis and preserved your lab note.',
    );
    await save();
    expect((await calls()).filter((c: any) => c.result?.startsWith('Error'))).toEqual([]);
    check();
    // Native Edit menu cell Undo/Redo restores the final insertion as one action.
    await frame().getByRole('menuitem', { name: 'Edit', exact: true }).click();
    await frame().getByText('Undo Cell Operation', { exact: true }).click();
    await expect.poll(() => notebook().cells.length).toBe(2);
    await frame().getByRole('menuitem', { name: 'Edit', exact: true }).click();
    await frame().getByText('Redo Cell Operation', { exact: true }).click();
    await expect.poll(() => notebook().cells.length).toBe(3);
    await save();
    check();
    await page.screenshot({ path: join(evidence, 'native-analysis.png') });
    await instance.app.close();
    instance = await launchApp({ dir, env: { CRUX_AI_MOCK: '1' } });
    await offline();
    page = instance.page;
    await page.getByRole('button', { name: /enter/i }).click();
    await ready();
    check();
    await rerun('Verify the reopened analysis [jupyterlite:depth-rerun]');
    await save();
    check();
    await exportNativeCrux(page, archive, instance.app);
    await instance.app.close();
    renameSync(folder, folder + '.source-offline');
    instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    await offline();
    page = instance.page;
    await page.setViewportSize({ width: 1800, height: 1100 });
    await enterGarden(page);
    await importNativeCrux(page, archive);
    folder = (
      await storedCrux(
        page,
        (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!,
      )
    ).projectFolder;
    await ready();
    check();
    await rerun('Verify the imported analysis [jupyterlite:depth-rerun]');
    await save();
    check();
    await manualNote('\nRepeat next week.');
    await page.screenshot({ path: join(evidence, 'portable-analysis.png') });
  } finally {
    await instance.app.close().catch(() => {});
  }
});
