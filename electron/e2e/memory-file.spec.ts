import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';
import { showPane, chooseSettingsSection } from './panel-helpers';

test('Memory refuses an outside edit without losing the draft, reloads and saves after restart', async () => {
  let launched = await launchApp({ ai: false });
  const { dir } = launched;
  const file = join(dir, 'garden', 'memory.md');
  const settings = async () => {
    const pane = await showPane(launched.page, 'Settings');
    await chooseSettingsSection(launched.page, 'AI and agents');
    const expand = pane.getByRole('button', { name: 'AI', exact: true });
    if ((await expand.getAttribute('aria-expanded')) === 'false') await expand.click();
    const toggle = pane.getByRole('switch', { name: 'Enable AI Tools' });
    if (!(await toggle.isChecked())) await toggle.click();
    await expect(toggle).toBeChecked();
    if ((await expand.getAttribute('aria-expanded')) === 'true') await expand.click();
    return launched.page.getByTestId('memory-text');
  };
  try {
    await enterGarden(launched.page);
    const input = await settings();
    await input.fill('## Notes\n- Original note\n');
    await input.blur();
    await expect
      .poll(() => (existsSync(file) ? readFileSync(file, 'utf8') : null))
      .toContain('Original note');
    await expect(input).toBeEnabled();
    await input.fill('## Notes\n- My unsaved draft\n');
    writeFileSync(file, '## Notes\n- Written in another editor\n');
    await input.blur();
    const error = launched.page.getByTestId('memory-settings').getByRole('alert');
    await expect(error).toContainText('Memory changed in another app');
    await expect(input).toHaveValue(/My unsaved draft/);
    expect(readFileSync(file, 'utf8')).toContain('Written in another editor');
    await error.scrollIntoViewIfNeeded();
    await expect(error).toBeInViewport();
    await launched.page.screenshot({ path: test.info().outputPath('memory-conflict.png') });
    await error.getByRole('button', { name: 'Reload memory' }).click();
    const confirmation = launched.page.getByRole('dialog', { name: 'Reload memory' });
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(input).toHaveValue(/My unsaved draft/);
    await error.getByRole('button', { name: 'Reload memory' }).click();
    await confirmation.getByRole('button', { name: 'Reload', exact: true }).click();
    await expect(input).toHaveValue(/Written in another editor/);
    await expect(error).toHaveCount(0);
    await input.fill('## Notes\n- Written in another editor\n- My reviewed addition\n');
    await input.blur();
    await expect.poll(() => readFileSync(file, 'utf8')).toContain('My reviewed addition');
    await launched.app.close();
    launched = await launchApp({ dir, ai: false });
    await launched.page.getByRole('button', { name: /enter/i }).click();
    await expect(
      launched.page.getByRole('button', { name: 'Add Crux', exact: true }),
    ).toBeVisible();
    const restored = await settings();
    await expect(restored).toHaveValue(/Written in another editor\n- My reviewed addition/);
    await launched.page
      .getByTestId('memory-settings')
      .getByRole('button', { name: 'Clear', exact: true })
      .click();
    await launched.page
      .getByRole('dialog', { name: 'Clear memory' })
      .getByRole('button', { name: 'Clear', exact: true })
      .click();
    await expect(restored).not.toHaveValue(/My reviewed addition/);
    await expect.poll(() => readFileSync(file, 'utf8')).not.toContain('My reviewed addition');
  } finally {
    await launched.app.close();
  }
});
