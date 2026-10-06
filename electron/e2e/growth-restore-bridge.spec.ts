import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

test('renderer restores retained content atomically through refusal, retry and desktop restarts', async () => {
  let launch = await launchApp();
  const dir = launch.dir;
  try {
    await enterGarden(launch.page);
    const saved = await launch.page.evaluate(async () => {
      const db = window.electronAPI!.sqlite;
      const content = db.fileContent!;
      const id = await db.createCrux!({
        slug: crypto.randomUUID(),
        title: 'Restore content bridge',
        authorId: crypto.randomUUID(),
        homeId: crypto.randomUUID(),
        type: 'crux',
      });
      const file = async (text: string) => {
        const bytes = new TextEncoder().encode(text);
        const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
          .map((n) => n.toString(16).padStart(2, '0'))
          .join('');
        return {
          put: {
            id: 'shared-file',
            path: 'notes.txt',
            fingerprint,
            size: bytes.length,
            mimeType: 'text/plain',
            encoding: 'utf-8',
            mode: 0o640,
            attributes: { keep: 'metadata' },
          },
          bytes,
        };
      };
      const first = await content.edit({
        cruxId: id,
        expected: null,
        changes: [await file('Earlier version\0')],
      });
      const target = await content.snapshot({
        cruxId: id,
        expected: first,
        snapshotId: crypto.randomUUID(),
        parentId: null,
      });
      const current = await content.edit({
        cruxId: id,
        expected: first,
        changes: [await file('Current work')],
      });
      const messages = [{ role: 'user', content: 'Keep this conversation' }];
      await db.updateCrux!(id, { meta: { messages } });
      const input = {
        safety: { cruxId: id, expected: current },
        target: { cruxId: target.snapshot.id, expected: target.head },
      };
      await db.run(
        "CREATE TRIGGER refuse_restore BEFORE UPDATE ON file_content_heads BEGIN SELECT RAISE(ABORT, 'Root refused'); END",
      );
      let error = '';
      try {
        await content.restore(input);
      } catch (cause) {
        error = String(cause);
      }
      return {
        id,
        input,
        current,
        target,
        error,
        head: await content.head(id),
        safety: (await content.history(id)).checkpoints.filter((p) => p.reason === 'safety'),
        growth: await db.all("SELECT id FROM dimensions WHERE source_id = ? AND type = 'growth'", [
          id,
        ]),
      };
    });
    expect(saved.error).toContain('Root refused');
    expect(saved.head).toEqual(saved.current);
    expect(saved.safety).toEqual([]);
    expect(saved.growth).toHaveLength(1);
    await launch.app.close();
    launch = await launchApp({ dir });
    const retried = await launch.page.evaluate(async (saved) => {
      const db = window.electronAPI!.sqlite;
      const content = db.fileContent!;
      const before = await content.read({
        cruxId: saved.id,
        expected: saved.current,
        path: 'notes.txt',
      });
      await db.run('DROP TRIGGER refuse_restore');
      const notices: string[][] = [];
      const unsubscribe = db.onChange!((change) => {
        if (change.id === saved.id && change.fields) notices.push([...change.fields]);
      });
      try {
        const result = await content.restore(saved.input);
        const current = await content.read({
          cruxId: saved.id,
          expected: result.head,
          path: 'notes.txt',
        });
        return {
          result,
          before: new TextDecoder().decode(before!.bytes),
          current: new TextDecoder().decode(current!.bytes),
          entry: current!.entry,
          notices,
        };
      } finally {
        unsubscribe();
      }
    }, saved);
    expect(retried.before).toBe('Current work');
    expect(retried.current).toBe('Earlier version\0');
    expect(retried.entry).toMatchObject({
      id: 'shared-file',
      mode: 0o640,
      attributes: { keep: 'metadata' },
    });
    expect(retried.notices).toEqual([['editHistory', 'fileContent']]);
    await launch.app.close();
    launch = await launchApp({ dir });
    const reopened = await launch.page.evaluate(
      async ({ saved, retried }) => {
        const db = window.electronAPI!.sqlite;
        const content = db.fileContent!;
        const read = async (cruxId: string, expected: typeof saved.current) =>
          new TextDecoder().decode(
            (await content.read({ cruxId, expected, path: 'notes.txt' }))!.bytes,
          );
        return {
          live: await read(saved.id, retried.result.head),
          safety: await content.inspectCheckpoint(saved.id, retried.result.safety.id),
          target: await read(saved.target.snapshot.id, saved.target.head),
          artifacts: await db.all('SELECT id FROM artifacts'),
          growth: await db.all("SELECT id FROM dimensions WHERE source_id=? AND type='growth'", [
            saved.id,
          ]),
        };
      },
      { saved, retried },
    );
    expect(reopened.live).toBe('Earlier version\0');
    expect(reopened.target).toBe('Earlier version\0');
    expect(reopened.safety.checkpoint.root).toBe(saved.current.root);
    expect(reopened.growth).toHaveLength(1);
    expect(reopened.artifacts).toEqual([]);
    expect(reopened.safety.checkpoint.workspace!.messages).toEqual([
      { role: 'user', content: 'Keep this conversation' },
    ]);
  } finally {
    await launch.app.close();
  }
});
