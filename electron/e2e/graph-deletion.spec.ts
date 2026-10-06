import { test, expect, type Page } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

// Seed current content through native commands; deletion uses the actual Home UI.
// Graph links preserve references but do not grant ownership of another creation.
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
      const files = db.fileContent!;
      const memberHead = (await files.head(f.member))!;
      const { entries: memberFiles } = await files.list({ cruxId: f.member, expected: memberHead });
      const sharedHead = (await files.head(f.shared))!;
      const { entries: sharedFiles } = await files.list({ cruxId: f.shared, expected: sharedHead });
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
        content: new TextDecoder().decode(await db.blobRead(memberFiles[0]!.fingerprint)),
        orphanEdges: await db.all(
          'SELECT id FROM dimensions WHERE source_id IN (?, ?) OR target_id IN (?, ?)',
          [f.a, f.own, f.a, f.own],
        ),
        ownFiles: await db.all('SELECT crux_id FROM file_content_heads WHERE crux_id = ?', [f.own]),
        sharedFiles: sharedFiles.map((file) => ({ fingerprint: file.fingerprint })),
        artifactRows: await db.all('SELECT id FROM artifacts WHERE resource_id IN (?, ?, ?)', [
          f.member,
          f.own,
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
      artifactRows: [],
    });
  }
  try {
    await enterGarden(first.page);
    fixture = await first.page.evaluate(async () => {
      const db = window.electronAPI!.sqlite;
      const root = new URL(window.location.href).searchParams.get('garden')!;
      const identity = (await db.get('SELECT author_id, home_id FROM cruxes WHERE id = ?', [
        root,
      ])) as { author_id: string; home_id: string };
      const make = (title: string, kind?: string) =>
        db.createCrux!({
          slug: crypto.randomUUID(),
          title,
          kind,
          type: 'workspace',
          authorId: identity.author_id,
          homeId: identity.home_id,
        });
      const files = db.fileContent!;
      const put = async (cruxId: string, text: string) => {
        const bytes = new TextEncoder().encode(text);
        const fingerprint = Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
          (x) => x.toString(16).padStart(2, '0'),
        ).join('');
        const meta = JSON.parse(
          ((await db.get('SELECT meta FROM cruxes WHERE id = ?', [cruxId])) as { meta: string })
            .meta,
        );
        // Native edits record content; the desktop watcher reads the actual Project Folder.
        await window.electronAPI!.project.writeFile(meta.projectFolder, 'work.txt', bytes);
        const head = await files.edit({
          cruxId,
          expected: await files.head(cruxId),
          changes: [
            {
              put: {
                id: crypto.randomUUID(),
                path: 'work.txt',
                fingerprint,
                size: bytes.length,
                encoding: 'utf-8',
                mimeType: 'text/plain',
                mode: 0o644,
                attributes: {},
              },
              bytes,
            },
          ],
        });
        await files.finishProjection(cruxId);
        return { head, fingerprint };
      };
      const a = await make('Discarded Garden', 'garden');
      const b = await make('Surviving Garden', 'garden');
      const member = await make('Shared creation');
      await put(member, 'Shared creation survives');
      const ownContent = await put(a, 'Owned history');
      const own = (
        await files.snapshot({
          cruxId: a,
          expected: ownContent.head,
          snapshotId: crypto.randomUUID(),
          parentId: null,
          meta: { label: 'Owned history' },
        })
      ).snapshot.id;
      const sharedContent = await put(a, 'Shared history');
      const shared = (
        await files.snapshot({
          cruxId: a,
          expected: sharedContent.head,
          snapshotId: crypto.randomUUID(),
          parentId: null,
          meta: { label: 'Shared history' },
        })
      ).snapshot.id;
      await db.gardenMembership!.add({ gardenId: b, memberId: member });
      await db.installation!.createDimension({
        sourceId: a,
        targetId: member,
        type: 'graft',
        homeId: identity.home_id,
      });
      await db.installation!.createDimension({
        sourceId: b,
        targetId: shared,
        type: 'growth',
        homeId: identity.home_id,
      });
      return { a, b, member, own, shared, fingerprint: sharedContent.fingerprint };
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
