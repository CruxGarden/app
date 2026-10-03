import { readFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux, addArtifact, storedCrux } from './multi-crux-helpers';
import { openPanel, chooseSettingsSection } from './panel-helpers';

test('workspace status explains privacy and focus restores the original panels', async () => {
  const first = await launchApp({ ai: false });
  try {
    const { page } = first;
    await enterGarden(page);
    const id = await createCrux(page, 'A quiet place');
    const crux = await storedCrux(page, id);
    const status = page.getByTestId('workspace-status');
    await expect(status).toContainText('On this device · Private');
    await status.locator('summary').click();
    await expect(status).toContainText('No backup recorded');
    await expect(status).toContainText('not a backup of your sources and history');
    await status.getByRole('button', { name: 'Open Share', exact: true }).click();
    await expect(page.getByTestId('pane-body-publish')).toBeVisible();
    await addArtifact(page, 'thought.txt');
    const editor = page.locator('.monaco-editor').first();
    await editor.click();
    await page.keyboard.type('Keep this thought');
    await expect(status).toContainText('Unsaved edits');
    await status.getByRole('button', { name: 'Save editor changes' }).click();
    await expect
      .poll(() => readFileSync(join(crux.projectFolder, 'thought.txt'), 'utf8'))
      .toBe('Keep this thought');
    await expect(status).toContainText('On this device');
    await openPanel(page, 'artifacts', 'Toggle artifacts');
    const before = await page.locator('.mosaic-window').evaluateAll((panes) =>
      panes
        .map((pane) => ({
          pane: pane.className.match(/pane-\w+/)?.[0],
          width: Math.round(pane.getBoundingClientRect().width),
          height: Math.round(pane.getBoundingClientRect().height),
        }))
        .sort((a, b) => String(a.pane).localeCompare(String(b.pane))),
    );
    const evidence = resolve(__dirname, '../../docs/quality-of-life');
    mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: join(evidence, 'work-status.png') });
    await page.getByRole('button', { name: 'Focus Artifacts', exact: true }).click();
    await expect(page.locator('.mosaic-window')).toHaveCount(1);
    await page.screenshot({ path: join(evidence, 'focus.png') });
    await expect(page.getByRole('button', { name: 'Restore panels' })).toBeFocused();
    await page.getByRole('button', { name: 'Restore panels' }).press('Enter');
    await expect(page.locator('.mosaic-window')).toHaveCount(before.length);
    await expect
      .poll(() =>
        page.locator('.mosaic-window').evaluateAll((panes) =>
          panes
            .map((pane) => ({
              pane: pane.className.match(/pane-\w+/)?.[0],
              width: Math.round(pane.getBoundingClientRect().width),
              height: Math.round(pane.getBoundingClientRect().height),
            }))
            .sort((a, b) => String(a.pane).localeCompare(String(b.pane))),
        ),
      )
      .toEqual(before);
    await page.getByRole('button', { name: 'Focus Artifacts', exact: true }).click();
    await openPanel(page, 'settings', 'Toggle settings');
    await expect(page.getByTestId('pane-body-settings')).toBeVisible();
    await expect(page.locator('.mosaic-window')).not.toHaveCount(1);
    await chooseSettingsSection(page, 'Appearance and panels');
    await page.getByRole('button', { name: 'Make: Workshop + Artifacts', exact: true }).click();
    await expect(page.locator('.mosaic-window')).toHaveCount(2);
    await expect(page.getByTestId('pane-body-artifacts')).toBeVisible();
    await openPanel(page, 'settings', 'Toggle settings');
    await chooseSettingsSection(page, 'Appearance and panels');
    await page.getByRole('button', { name: 'Review: Workshop + Share', exact: true }).click();
    await expect(page.locator('.mosaic-window')).toHaveCount(2);
    await expect(page.getByTestId('pane-body-publish')).toBeVisible();
    expect(readFileSync(join(crux.projectFolder, 'thought.txt'), 'utf8')).toBe('Keep this thought');
  } finally {
    await first.app.close();
  }
});
