import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, createCrux, storedCrux } from './multi-crux-helpers';
async function newTask(page: Page, title: string) {
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  await page.getByRole('textbox', { name: 'Task name', exact: true }).fill(title);
  await page.getByRole('button', { name: 'Save and start task' }).click();
  await expect(page.getByRole('dialog', { name: 'New task', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
  const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
  const row = (await page.evaluate(
    async (id) =>
      window.electronAPI!.sqlite.get('SELECT project_folder FROM working_copies WHERE id = ?', [
        id,
      ]),
    id,
  )) as { project_folder: string };
  return { id, folder: row.project_folder };
}
async function showPreview(page: Page, title: string) {
  const collaboration = page.getByRole('button', { name: 'Toggle collaboration' });
  if ((await collaboration.getAttribute('aria-pressed')) === 'true') await collaboration.click();
  const toggle = page.getByRole('button', { name: 'Toggle artifacts' });
  if ((await toggle.getAttribute('aria-pressed')) === 'false') await toggle.click();
  await page.getByRole('tree').getByText('index.html', { exact: true }).click();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.frameLocator('iframe[data-crux-id]').getByRole('heading')).toHaveText(title);
  return (await page.locator('iframe[data-crux-id]').getAttribute('src'))!;
}
test('two tasks own separate disk files and previews, merge into Main, and survive restart', async () => {
  test.setTimeout(180000);
  let { app, page, dir } = await launchApp();
  try {
    await enterGarden(page);
    const main = await createCrux(page, 'Parallel web app');
    const meta = await storedCrux(page, main);
    writeFileSync(join(meta.projectFolder, 'index.html'), '<h1>Main</h1>');
    const a = await newTask(page, 'Redesign');
    writeFileSync(join(a.folder, 'index.html'), '<h1>Redesign</h1>');
    const aUrl = await showPreview(page, 'Redesign');
    await page.getByTestId('task-bar').getByRole('link', { name: 'Main', exact: true }).click();
    const b = await newTask(page, 'Experiment');
    writeFileSync(join(b.folder, 'index.html'), '<h1>Experiment</h1>');
    const bUrl = await showPreview(page, 'Experiment');
    expect(a.folder).not.toBe(b.folder);
    expect(new URL(aUrl).origin).not.toBe(new URL(bUrl).origin);
    expect(readFileSync(join(meta.projectFolder, 'index.html'), 'utf8')).toBe('<h1>Main</h1>');
    await page
      .getByTestId('task-bar')
      .getByRole('link', { name: /^Redesign/ })
      .click();
    await expect(page.frameLocator('iframe[data-crux-id]').getByRole('heading')).toHaveText(
      'Redesign',
    );
    await page.getByRole('button', { name: 'Review changes', exact: true }).click();
    const review = page.getByRole('dialog', { name: 'Review changes for Main' });
    await expect(review).toBeVisible();
    await review.getByRole('button', { name: 'Check combined result' }).click();
    await expect(review.getByRole('checkbox')).toBeEnabled();
    await page.screenshot({ path: '/private/tmp/crux-task-review.png' });
    await review.getByRole('checkbox').check();
    await review.getByRole('button', { name: 'Merge into Main', exact: true }).click();
    await expect(review).toHaveCount(0);
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', main);
    expect(readFileSync(join(meta.projectFolder, 'index.html'), 'utf8')).toBe('<h1>Redesign</h1>');
    expect(readFileSync(join(b.folder, 'index.html'), 'utf8')).toBe('<h1>Experiment</h1>');
    await app.close();
    ({ app, page } = await launchApp({ dir }));
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await page.getByRole('button', { name: 'Switch Crux workspace' }).click();
    await expect(
      page
        .getByRole('dialog', { name: 'Switch Crux workspace' })
        .getByRole('button', { name: /^Parallel web app · Experiment/ }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await page.goto(`crux-app://app/c/${main}?task=${b.id}`);
    await expect(
      page.getByTestId('task-bar').getByRole('link', { name: /^Experiment/ }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
    await expect(
      page.getByTestId('task-bar').getByRole('link', { name: /^Redesign/ }),
    ).toContainText('merged');
  } finally {
    await app.close();
  }
});

test('parallel built-in turns keep files, history, and hidden approvals scoped to the task', async () => {
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  try {
    await enterGarden(page);
    await createCrux(page, 'Concurrent work');
    const a = await newTask(page, 'Alpha');
    await page.getByTestId('task-bar').getByRole('link', { name: 'Main', exact: true }).click();
    const b = await newTask(page, 'Beta');
    const choose = async (name: string) => {
      await page
        .getByTestId('task-bar')
        .getByRole('link', { name: new RegExp(`^${name}`) })
        .click();
      await expect(page.locator('[data-workspace-id]')).toHaveAttribute(
        'data-workspace-id',
        name === 'Alpha' ? a.id : b.id,
      );
    };
    const input = page.getByPlaceholder('Send a message...');
    await choose('Alpha');
    await input.fill('[workspace:Alpha]');
    await input.press('Enter');
    await expect(page.getByTestId('turn-job')).toBeVisible();
    await choose('Beta');
    await input.fill('[workspace:Beta]');
    await input.press('Enter');
    await expect(page.getByTestId('task-bar').getByRole('link', { name: /^Alpha/ })).toContainText(
      'Working',
    );
    await expect(page.getByText('Completed workspace Beta.', { exact: true })).toBeVisible({
      timeout: 30000,
    });
    for (const [copy, name] of [
      [a, 'Alpha'],
      [b, 'Beta'],
    ] as const) {
      expect(readFileSync(join(copy.folder, 'shared.txt'), 'utf8')).toBe(`Owned by ${name}\n`);
      await expect
        .poll(() =>
          page.evaluate(
            async (id) =>
              (
                await window.electronAPI!.sqlite.all(
                  "SELECT id FROM dimensions WHERE source_id = ? AND type = 'growth'",
                  [id],
                )
              ).length,
            copy.id,
          ),
        )
        .toBeGreaterThan(0);
    }
    await choose('Alpha');
    await expect(page.getByText('Completed workspace Beta.', { exact: true })).toHaveCount(0);
    await input.fill('[workspace:Alpha:delete]');
    await input.press('Enter');
    await choose('Beta');
    await expect(page.getByTestId('task-bar').getByRole('link', { name: /^Alpha/ })).toContainText(
      'Needs approval',
    );
    await expect(page.getByRole('button', { name: 'Keep', exact: true })).toHaveCount(0);
    await choose('Alpha');
    await page.getByRole('button', { name: 'Keep', exact: true }).click();
    expect(readFileSync(join(b.folder, 'shared.txt'), 'utf8')).toBe('Owned by Beta\n');
  } finally {
    await app.close();
  }
});

test('Claude Code task turns use separate sessions and directories and route hidden permissions', async () => {
  test.setTimeout(180000);
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1', CRUX_AGENT_MOCK: '1' } });
  try {
    await enterGarden(page);
    await createCrux(page, 'Agent tasks');
    await page
      .getByTestId('pane-body-collaboration')
      .getByRole('button', { name: /Claude Sonnet 5/ })
      .click();
    await page
      .getByTestId('model-group-claude-code')
      .getByRole('button', { name: 'Claude Code' })
      .click();
    const a = await newTask(page, 'Alpha');
    await page.getByTestId('task-bar').getByRole('link', { name: 'Main', exact: true }).click();
    const b = await newTask(page, 'Beta');
    const choose = async (name: string) => {
      await page
        .getByTestId('task-bar')
        .getByRole('link', { name: new RegExp(`^${name}`) })
        .click();
      await expect(page.locator('[data-workspace-id]')).toHaveAttribute(
        'data-workspace-id',
        name === 'Alpha' ? a.id : b.id,
      );
    };
    const input = page.getByPlaceholder('Send a message...');
    await choose('Alpha');
    await input.fill('run Alpha command');
    await input.press('Enter');
    await expect(page.getByTestId('agent-approvals')).toBeVisible();
    await choose('Beta');
    await input.fill('Leave Beta a note');
    await input.press('Enter');
    await expect(page.getByText(/Done — the note is in agent-note.md/)).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByTestId('agent-approvals')).toHaveCount(0);
    await choose('Alpha');
    await page.getByTestId('agent-approvals').getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByText(/Skipped the command, as you asked/)).toBeVisible();
    const sessions: string[] = [];
    for (const copy of [a, b]) {
      const row = (await page.evaluate(
        async (id) =>
          window.electronAPI!.sqlite.get('SELECT meta FROM working_copies WHERE id = ?', [id]),
        copy.id,
      )) as { meta: string };
      sessions.push(JSON.parse(row.meta).settings.agentSessionId);
    }
    expect(sessions.every(Boolean)).toBe(true);
    expect(new Set(sessions).size).toBe(2);
    expect(readFileSync(join(a.folder, 'agent-note.md'), 'utf8')).toContain('run Alpha command');
    expect(readFileSync(join(b.folder, 'agent-note.md'), 'utf8')).toContain('Leave Beta a note');
  } finally {
    await app.close();
  }
});

test('verification builds in a separate candidate and requires rechecking generated source changes', async () => {
  test.setTimeout(180000);
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    const main = await createCrux(page, 'Build isolation');
    const meta = await storedCrux(page, main);
    writeFileSync(join(meta.projectFolder, 'index.html'), '<h1>Main</h1>');
    writeFileSync(
      join(meta.projectFolder, 'package.json'),
      JSON.stringify({
        name: 'task-build-test',
        private: true,
        scripts: { build: 'node build.cjs' },
      }),
    );
    writeFileSync(
      join(meta.projectFolder, 'build.cjs'),
      "const fs=require('node:fs');fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/index.html',fs.readFileSync('index.html'));fs.writeFileSync('dist/cwd.txt',process.cwd());",
    );
    const a = await newTask(page, 'Built change');
    writeFileSync(join(a.folder, 'index.html'), '<h1>Built task</h1>');
    await page.getByRole('button', { name: 'Review changes', exact: true }).click();
    const review = page.getByRole('dialog', { name: 'Review changes for Main' });
    await review.getByRole('button', { name: 'Check combined result' }).click();
    await expect(review.getByText('Verification result')).toBeVisible({ timeout: 90000 });
    // pnpm's first install may add a lockfile. That new candidate must be reviewed and checked again.
    if (!(await review.getByRole('checkbox').isEnabled())) {
      await review.getByRole('button', { name: 'Check combined result' }).click();
    }
    await expect(review.getByRole('checkbox')).toBeEnabled({ timeout: 90000 });
    const candidate = (await page.evaluate(
      async (main) =>
        window.electronAPI!.sqlite.get(
          "SELECT project_folder FROM working_copies WHERE crux_id = ? AND role = 'review' ORDER BY created DESC LIMIT 1",
          [main],
        ),
      main,
    )) as { project_folder: string };
    expect(candidate.project_folder).not.toBe(meta.projectFolder);
    expect(candidate.project_folder).not.toBe(a.folder);
    expect(readFileSync(join(candidate.project_folder, 'dist/index.html'), 'utf8')).toBe(
      '<h1>Built task</h1>',
    );
    expect(readFileSync(join(candidate.project_folder, 'dist/cwd.txt'), 'utf8')).toBe(
      realpathSync(candidate.project_folder),
    );
    expect(readFileSync(join(meta.projectFolder, 'index.html'), 'utf8')).toBe('<h1>Main</h1>');
  } finally {
    await app.close();
  }
});
