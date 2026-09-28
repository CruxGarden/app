import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';
import { newTaskButton } from './panel-helpers';

test('a Crux link resolves its actual Garden and Back returns to the previous location', async () => {
  test.setTimeout(90_000);
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    const root = new URL(page.url()).searchParams.get('garden')!;
    await createCrux(page, 'Arrival');
    const source = page.url();
    await page.getByRole('button', { name: 'Garden location', exact: true }).click();
    await page.getByRole('button', { name: 'Close crux', exact: true }).click();
    await page.getByRole('button', { name: 'New Garden', exact: true }).click();
    await page.getByRole('textbox', { name: 'Garden name' }).fill('Music');
    await page.getByRole('button', { name: 'Create Garden', exact: true }).click();
    const target = await createCrux(page, 'Dream study');
    const correct = page.url();
    const link = new URL(correct);
    link.searchParams.set('garden', root);
    link.searchParams.set('navView', 'tree');
    await page.goto(source);
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute(
      'data-workspace-id',
      new URL(source).pathname.split('/').at(-1)!,
    );
    await page.goto(link.href);
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'Music',
      { timeout: 3_000 },
    );
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', target);
    expect(new URL(page.url()).searchParams.get('garden')).toBe(
      new URL(correct).searchParams.get('garden'),
    );
    expect(new URL(page.url()).searchParams.get('navView')).toBe('tree');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page).toHaveURL(source);
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'My Garden',
    );
    await page.getByRole('button', { name: 'Forward', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'Music',
    );
    await page.reload();
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', target);
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'Music',
    );
    // A late location read must not steal focus after the person navigates Back.
    await page.getByRole('button', { name: 'Navigator', exact: true }).click();
    const nav = page.getByRole('complementary', { name: 'Navigator' });
    await nav.getByRole('button', { name: 'Arrival', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute(
      'data-workspace-id',
      new URL(source).pathname.split('/').at(-1)!,
    );
    const priorUrl = page.url();
    await app.evaluate(({ app }, id) => {
      const path = process.getBuiltinModule('path');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { SqliteApi } = load(
        path.join(app.getAppPath(), 'dist/sqlite-api.js'),
      ) as typeof import('../src/sqlite-api');
      const original = SqliteApi.prototype.get;
      let release!: () => void;
      let finish!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const finished = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const state = {
        hit: false,
        release: async () => {
          SqliteApi.prototype.get = original;
          release();
          await finished;
        },
      };
      (globalThis as unknown as { destinationRead: typeof state }).destinationRead = state;
      SqliteApi.prototype.get = async function (sql: string, params?: unknown[]) {
        const result = await original.call(this, sql, params);
        if (
          sql === 'SELECT id, title, slug, kind FROM cruxes WHERE id = ? AND deleted IS NULL' &&
          params?.[0] === id
        ) {
          state.hit = true;
          await held;
          finish();
        }
        return result;
      } as typeof original;
    }, target);
    await nav.getByRole('button', { name: 'Dream study', exact: true }).click();
    await expect
      .poll(() =>
        app.evaluate(
          () =>
            (globalThis as unknown as { destinationRead: { hit: boolean } }).destinationRead.hit,
        ),
      )
      .toBe(true);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page).toHaveURL(priorUrl);
    await app.evaluate(() =>
      (
        globalThis as unknown as { destinationRead: { release: () => Promise<void> } }
      ).destinationRead.release(),
    );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page).toHaveURL(priorUrl);
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'My Garden',
    );
  } finally {
    await app.close();
  }
});

test('Task routes follow placement changes and recover from unplaced, ambiguous and unavailable Gardens', async () => {
  test.setTimeout(120_000);
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    const root = new URL(page.url()).searchParams.get('garden')!;
    const target = await createCrux(page, 'Portable study');
    await (await newTaskButton(page)).click();
    await page.getByRole('textbox', { name: 'Task name', exact: true }).fill('Rough mix');
    await page.getByRole('button', { name: 'Save and start task' }).click();
    await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
    const taskUrl = page.url();
    const taskId = new URL(taskUrl).searchParams.get('task')!;
    expect(taskId).toBeTruthy();
    await page.getByRole('button', { name: 'Garden location', exact: true }).click();
    await page.getByRole('button', { name: 'Close crux', exact: true }).click();
    await page.getByRole('button', { name: 'New Garden', exact: true }).click();
    await page.getByRole('textbox', { name: 'Garden name' }).fill('Studio');
    await page.getByRole('button', { name: 'Create Garden', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'Studio',
    );
    const studio = new URL(page.url()).searchParams.get('garden')!;
    await page.goto(taskUrl);
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', taskId);
    await page.evaluate(
      async ({ root, studio, target }) => {
        await window.electronAPI!.sqlite.gardenMembership!.move({
          gardenId: studio,
          memberId: target,
          expectedParents: [root],
        });
      },
      { root, studio, target },
    );
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'Studio',
    );
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', taskId);
    expect(new URL(page.url()).searchParams.get('task')).toBe(taskId);
    await page.evaluate(
      ({ studio, target }) => window.electronAPI!.sqlite.gardenMembership!.remove(studio, target),
      { studio, target },
    );
    await expect(page.getByRole('region', { name: 'Unplaced Crux' })).toBeVisible();
    expect(
      await page.evaluate((id) => window.electronAPI!.sqlite.gardenMembership!.parents(id), target),
    ).toEqual([]);
    await page.evaluate(
      ({ root, target }) =>
        window.electronAPI!.sqlite.gardenMembership!.add({ gardenId: root, memberId: target }),
      { root, target },
    );
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', taskId);
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'My Garden',
    );
    // Only the disposable fixture bypasses admission to exercise existing ambiguous data.
    await page.evaluate(
      async ({ studio, target }) => {
        await window.electronAPI!.sqlite.run(
          "INSERT INTO dimensions (id, source_id, target_id, type, kind, home_id, author_id, created, updated) SELECT ?, ?, ?, 'garden', 'membership', home_id, author_id, created, updated FROM cruxes WHERE id = ?",
          [crypto.randomUUID(), studio, target, target],
        );
      },
      { studio, target },
    );
    const ambiguous = new URL(taskUrl);
    ambiguous.searchParams.set('garden', '00000000-0000-4000-8000-000000000001');
    await page.goto(ambiguous.href);
    const choices = page.getByRole('region', { name: 'Choose Garden' });
    await expect(choices).toBeVisible();
    await expect(choices.getByRole('button', { name: 'My Garden', exact: true })).toBeVisible();
    await choices.getByRole('button', { name: 'Studio', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', taskId);
    expect(new URL(page.url()).searchParams.get('task')).toBe(taskId);
    await page.evaluate(
      ({ root, target }) => window.electronAPI!.sqlite.gardenMembership!.remove(root, target),
      { root, target },
    );
    await page.evaluate(
      (id) =>
        window.electronAPI!.sqlite.run('UPDATE cruxes SET deleted = ? WHERE id = ?', [
          new Date().toISOString(),
          id,
        ]),
      studio,
    );
    await page.reload();
    await expect(page.getByRole('alert')).toContainText(
      'The Garden containing this Crux is unavailable',
    );
    await page.evaluate(
      (id) => window.electronAPI!.sqlite.run('UPDATE cruxes SET deleted = NULL WHERE id = ?', [id]),
      studio,
    );
    await page.getByRole('button', { name: 'Retry location', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', taskId);
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'Studio',
    );
  } finally {
    await app.close();
  }
});
