import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { openSetupWizard } from './setup-helpers';
import { storedCrux } from './multi-crux-helpers';

test('a novice writes a note, chooses public content, publishes and keeps private notes local', async () => {
  test.setTimeout(8 * 60_000);
  const api = await startMockApi();
  const instance = await launchApp({ ai: false, env: { CRUX_API_URL: api.url } });
  try {
    const { app, page } = instance;
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1000, 720),
    );
    const wizard = await openSetupWizard(page);
    await wizard.locator('[data-need="writing"]').click();
    for (const step of ['need', 'garden', 'ai', 'mood']) {
      await expect(wizard).toHaveAttribute('data-step', step);
      await wizard
        .getByRole('button', {
          name:
            step === 'ai'
              ? 'Set up AI later'
              : step === 'mood'
                ? 'Preview my workspace'
                : 'Continue',
          exact: true,
        })
        .click();
    }
    await expect(wizard.getByLabel('Starting point', { exact: true })).toBeHidden();
    await expect(wizard.getByTestId('setup-starting-point')).toContainText(
      'Write and organize notes',
    );
    await page.screenshot({ path: test.info().outputPath('novice-ready.png') });
    await wizard.getByRole('button', { name: 'Create & open', exact: true }).click();
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.getByLabel('Note title', { exact: true })).toHaveValue('Welcome');
    const workshop = page.getByTestId('pane-body-workshop');
    await expect(workshop).toHaveAttribute('data-panel-mode', 'normal');
    await expect(workshop.getByRole('button', { name: 'Customize app', exact: true })).toBeHidden();
    await expect(workshop.getByText('runtime/index.html', { exact: true })).toBeHidden();
    const guide = page.getByTestId('setup-project-guide');
    await expect(
      guide.getByRole('button', { name: 'Write in my note', exact: true }),
    ).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath('novice-first-notebook.png') });
    await guide.getByRole('button', { name: 'Write in my note', exact: true }).click();
    await expect(frame.locator('.tiptap').first()).toBeFocused();
    await frame.locator('.tiptap').first().fill('My first public note, made without code.');
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const folder = (await storedCrux(page, id)).projectFolder as string;
    await expect
      .poll(() => readFileSync(join(folder, 'notebook/Welcome.md'), 'utf8'))
      .toContain('My first public note');
    writeFileSync(join(folder, 'notebook/Private.md'), '# Private\nNEVER_PUBLISH_THIS_NOTE');
    await guide.getByRole('button', { name: 'Next: choose public notes', exact: true }).click();
    await guide.getByRole('button', { name: 'Choose notes to share', exact: true }).click();
    const selection = frame.locator('#garden-publication');
    await expect(selection).toContainText('nothing goes online until you publish');
    await expect(selection.locator('input[data-note="Private.md"]')).toBeVisible();
    await selection.locator('input[data-note="Welcome.md"]').check();
    await expect(selection.locator('input[data-note="Private.md"]')).not.toBeChecked();
    await selection.getByRole('button', { name: 'Done choosing' }).click();
    expect(api.state.published[id]).toBeUndefined();
    await guide.getByRole('button', { name: 'Next: publish', exact: true }).click();
    await guide.getByRole('button', { name: 'Open Share', exact: true }).click();
    const share = page.getByTestId('pane-body-publish');
    await expect(share.getByRole('list', { name: 'Publishing steps' })).toBeVisible();
    await share.getByRole('button', { name: 'Share selected content', exact: true }).click();
    await share.getByPlaceholder('email@example.com').fill('novice@example.com');
    await share.getByRole('button', { name: 'Send Code', exact: true }).click();
    await share.getByPlaceholder('Enter code').fill('123456');
    await share.getByRole('button', { name: 'Connect', exact: true }).click();
    await page
      .getByRole('dialog')
      .filter({ hasText: 'A published site is not a backup' })
      .getByRole('button', { name: 'Share without a backup', exact: true })
      .click({ timeout: 60000 });
    await expect(share.getByText('Up to date', { exact: true })).toBeVisible({
      timeout: 5 * 60000,
    });
    const files = api.state.published[id]!;
    const text = files
      .filter((f) => /\.(html|json|md)$/.test(f.path))
      .map((f) => Buffer.from(f.bytes).toString('utf8'))
      .join('\n');
    expect(text).toContain('My first public note, made without code.');
    expect(text).not.toContain('NEVER_PUBLISH_THIS_NOTE');
    expect(files.some((f) => f.path.startsWith('runtime/') || f.path.startsWith('notebook/'))).toBe(
      false,
    );
    await share.getByRole('button', { name: 'Copy link', exact: true }).click();
    await expect(share.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
    await expect(
      share.getByRole('link', { name: 'View published Crux', exact: true }),
    ).toHaveAttribute('href', /^https:\/\//);
    const png = await app.evaluate(async ({ BrowserWindow }) =>
      (await BrowserWindow.getAllWindows()[0]!.capturePage()).toPNG().toString('base64'),
    );
    writeFileSync(test.info().outputPath('novice-published-notes.png'), Buffer.from(png, 'base64'));
    // Later edits must still need an explicit update, despite first-install housekeeping.
    await frame.locator('.tiptap').first().fill('A later draft, not online yet.');
    await expect(share.getByText('Changes to share', { exact: true })).toBeVisible();
    expect(api.state.published[id]).toEqual(files);
  } finally {
    await instance.app.close();
    await api.close();
  }
});
