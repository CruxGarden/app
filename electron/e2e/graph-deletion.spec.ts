import { test, expect, type Page } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

// Seed relationships through the isolated native database: the recursive
// Garden editor is not implemented yet. Deletion itself uses the real UI.
test('purging a linked Crux preserves shared work and history after restart', async () => {
  const first = await launchApp();
  let fixture!: {
    a: string;
    b: string;
    member: string;
    own: string;
    shared: string;
    fingerprint: string;
  };
  async function check(page: Page) {
    const result = await page.evaluate(async (f) => {
      const db = window.electronAPI!.sqlite;
      const exists = async (id: string) =>
        !!(await db.get('SELECT id FROM cruxes WHERE id = ?', [id]));
      const file = (await db.get('SELECT fingerprint FROM artifacts WHERE resource_id = ?', [
        f.member,
      ])) as { fingerprint: string };
      return {
        removed: await exists(f.a),
        own: await exists(f.own),
        garden: await exists(f.b),
        member: await exists(f.member),
        shared: await exists(f.shared),
        links: await db.all(
          'SELECT target_id FROM dimensions WHERE source_id = ? ORDER BY target_id',
          [f.b],
        ),
        content: new TextDecoder().decode(await db.blobRead(file.fingerprint)),
        orphanEdges: await db.all(
          'SELECT id FROM dimensions WHERE source_id IN (?, ?) OR target_id IN (?, ?)',
          [f.a, f.own, f.a, f.own],
        ),
        ownFiles: await db.all('SELECT id FROM artifacts WHERE resource_id = ?', [f.own]),
        sharedFiles: await db.all('SELECT fingerprint FROM artifacts WHERE resource_id = ?', [
          f.shared,
        ]),
      };
    }, fixture);
    expect(result).toEqual({
      removed: false,
      own: false,
      garden: true,
      member: true,
      shared: true,
      links: [fixture.member, fixture.shared].sort().map((target_id) => ({ target_id })),
      content: 'Shared creation survives',
      orphanEdges: [],
      ownFiles: [],
      sharedFiles: [{ fingerprint: fixture.fingerprint }],
    });
  }
  try {
    await enterGarden(first.page);
    fixture = await first.page.evaluate(async () => {
      const db = window.electronAPI!.sqlite;
      const now = new Date().toISOString();
      const make = async (title: string, kind: string) => {
        const id = crypto.randomUUID();
        await db.run(
          'INSERT INTO cruxes (id, slug, title, kind, author_id, home_id, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [id, id, title, kind, 'fixture-author', 'fixture-home', now, now],
        );
        return id;
      };
      const a = await make('Discarded Garden', 'garden');
      const b = await make('Surviving Garden', 'garden');
      const member = await make('Shared creation', 'project');
      const own = await make('Owned history', 'snapshot');
      const shared = await make('Shared history', 'snapshot');
      const bytes = new TextEncoder().encode('Shared creation survives');
      const fingerprint = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
        (x) => x.toString(16).padStart(2, '0'),
      ).join('');
      await db.blobWrite(fingerprint, bytes);
      for (const id of [member, own, shared])
        await db.run(
          'INSERT INTO artifacts (id, resource_id, author_id, home_id, path, filename, fingerprint, size, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            crypto.randomUUID(),
            id,
            'fixture-author',
            'fixture-home',
            'work.txt',
            'work.txt',
            fingerprint,
            bytes.length,
            now,
            now,
          ],
        );
      for (const [source, target, type] of [
        [a, member, 'garden'],
        [b, member, 'garden'],
        [a, own, 'growth'],
        [a, shared, 'growth'],
        [b, shared, 'growth'],
      ])
        await db.run(
          'INSERT INTO dimensions (id, source_id, target_id, type, home_id, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [crypto.randomUUID(), source, target, type, 'fixture-home', now, now],
        );
      return { a, b, member, own, shared, fingerprint };
    });
    // Home lists the root Garden's members: place the fixture's Gardens there.
    const root = new URL(first.page.url()).searchParams.get('garden')!;
    await first.page.evaluate(
      async ({ root, ids }) => {
        for (const memberId of ids)
          await window.electronAPI!.sqlite.gardenMembership!.add({ gardenId: root, memberId });
      },
      { root, ids: [fixture.a, fixture.b] },
    );
    await first.page.reload();
    const card = first.page
      .getByRole('button', { name: 'Open Discarded Garden', exact: true })
      .locator('..');
    await card.hover();
    await card.getByRole('button', { name: 'Crux actions' }).click();
    await first.page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    // A question only when there is something to decide (published, or members to move).
    const ask = first.page.getByRole('dialog', { name: /^Delete (Crux|Garden)$/ });
    if (
      await ask.waitFor({ timeout: 2_000 }).then(
        () => true,
        () => false,
      )
    )
      await ask.getByRole('button', { name: 'Delete', exact: true }).click();
    const row = first.page
      .getByTestId('trash-section')
      .locator('li')
      .filter({ hasText: 'Discarded Garden' });
    await row.getByRole('button', { name: 'Delete forever' }).click();
    await first.page
      .getByRole('dialog')
      .filter({ hasText: 'for good' })
      .getByRole('button', { name: 'Delete forever' })
      .click();
    await expect(row).toHaveCount(0);
    await check(first.page);
  } finally {
    await first.app.close();
  }
  const again = await launchApp({ dir: first.dir });
  try {
    await again.page.getByRole('button', { name: /enter/i }).click();
    // Home lists the root Garden's members: the surviving Garden is still there
    // (the shared creation lives inside it), the discarded one is gone.
    await expect(
      again.page.getByRole('button', { name: 'Open Surviving Garden', exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      again.page.getByRole('button', { name: 'Open Discarded Garden', exact: true }),
    ).toHaveCount(0);
    await check(again.page);
  } finally {
    await again.app.close();
  }
});
