import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

test('renderer content commands use the actual API and host blob store through failure, Growth and restart', async () => {
  let launch = await launchApp();
  const dir = launch.dir;
  try {
    await enterGarden(launch.page);
    const saved = await launch.page.evaluate(async () => {
      const db = window.electronAPI!.sqlite;
      const content = db.fileContent!;
      const id = await db.createCrux!({
        slug: `bridge-${crypto.randomUUID()}`,
        title: 'Content bridge',
        authorId: crypto.randomUUID(),
        homeId: crypto.randomUUID(),
        type: 'crux',
      });
      const bytes = new TextEncoder().encode('Saved through the renderer\0');
      const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
        .map((n) => n.toString(16).padStart(2, '0'))
        .join('');
      const entry = {
        id: crypto.randomUUID(),
        path: 'document.bin',
        fingerprint,
        size: bytes.length,
        mimeType: 'application/octet-stream',
        encoding: 'binary',
        mode: 0o644,
        attributes: { note: 'portable' },
      };
      const notices: string[][] = [];
      const unsubscribe = db.onChange!((change) => {
        if (change.id === id && change.fields) notices.push([...change.fields]);
      });
      try {
        const emptyHead = await content.head(id);
        const head = await content.edit({
          cruxId: id,
          expected: null,
          changes: [{ put: entry, bytes }],
        });
        const snapshotId = crypto.randomUUID();
        const input = {
          cruxId: id,
          expected: head,
          snapshotId,
          parentId: null,
          meta: { messages: [{ role: 'user', content: 'Keep this' }] },
        };
        await db.run(
          "CREATE TRIGGER refuse_bridge_growth BEFORE INSERT ON dimensions WHEN NEW.type = 'growth' BEGIN SELECT RAISE(ABORT, 'Growth refused'); END",
        );
        let refused = false;
        try {
          await content.snapshot(input);
        } catch (error) {
          refused = String(error).includes('Growth refused');
        }
        const partial = await db.all('SELECT id FROM cruxes WHERE id = ?', [snapshotId]);
        await db.run('DROP TRIGGER refuse_bridge_growth');
        const snapshot = await content.snapshot(input);
        const latest = await content.edit({
          cruxId: id,
          expected: head,
          changes: [{ remove: entry.path }, { put: { ...entry, path: 'renamed.bin' } }],
        });
        let staleRefused = false;
        try {
          await content.read({ cruxId: id, expected: head, path: entry.path });
        } catch (error) {
          staleRefused = String(error).includes('changed');
        }
        let staleListRefused = false;
        try {
          await content.list({ cruxId: id, expected: head });
        } catch (error) {
          staleListRefused = String(error).includes('changed');
        }
        let snapshotEditRefused = false;
        try {
          await content.edit({ cruxId: snapshotId, expected: snapshot.head, changes: [] });
        } catch (error) {
          snapshotEditRefused = String(error).includes('editable');
        }
        // Round-trip another named read so committed-change events have reached the renderer.
        const current = await content.read({ cruxId: id, expected: latest, path: 'renamed.bin' });
        return {
          id,
          entry,
          emptyHead,
          head,
          snapshotId,
          snapshot,
          latest,
          refused,
          partial,
          staleRefused,
          staleListRefused,
          snapshotEditRefused,
          notices,
          current: new TextDecoder().decode(current!.bytes),
        };
      } finally {
        unsubscribe();
      }
    });
    expect(saved.emptyHead).toBeNull();
    expect(saved.refused).toBe(true);
    expect(saved.partial).toEqual([]);
    expect(saved.staleRefused).toBe(true);
    expect(saved.staleListRefused).toBe(true);
    expect(saved.snapshotEditRefused).toBe(true);
    expect(saved.current).toBe('Saved through the renderer\0');
    expect(saved.notices).toEqual([['fileContent'], ['growth'], ['fileContent']]);
    await launch.app.close();
    launch = await launchApp({ dir });
    const reopened = await launch.page.evaluate(async (saved) => {
      const db = window.electronAPI!.sqlite;
      const content = db.fileContent!;
      const old = await content.read({
        cruxId: saved.snapshotId,
        expected: saved.snapshot.head,
        path: saved.entry.path,
      });
      const now = await content.read({
        cruxId: saved.id,
        expected: saved.latest,
        path: 'renamed.bin',
      });
      return {
        old: new TextDecoder().decode(old!.bytes),
        now: new TextDecoder().decode(now!.bytes),
        entry: old!.entry,
        head: await content.head(saved.id),
        historicalList: await content.list({
          cruxId: saved.snapshotId,
          expected: saved.snapshot.head,
        }),
        currentList: await content.list({ cruxId: saved.id, expected: saved.latest }),
        artifacts: await db.all('SELECT id FROM artifacts WHERE resource_id IN (?, ?)', [
          saved.id,
          saved.snapshotId,
        ]),
        growth: await db.all(
          "SELECT source_id, target_id FROM dimensions WHERE type = 'growth' AND source_id = ?",
          [saved.id],
        ),
      };
    }, saved);
    expect(reopened.old).toBe(saved.current);
    expect(reopened.now).toBe(saved.current);
    expect(reopened.entry).toEqual(saved.entry);
    expect(reopened.head).toEqual(saved.latest);
    expect(reopened.historicalList).toEqual({ head: saved.snapshot.head, entries: [saved.entry] });
    expect(reopened.currentList).toEqual({
      head: saved.latest,
      entries: [{ ...saved.entry, path: 'renamed.bin' }],
    });
    expect(reopened.artifacts).toEqual([]);
    expect(reopened.growth).toEqual([{ source_id: saved.id, target_id: saved.snapshotId }]);
  } finally {
    await launch.app.close();
  }
});
