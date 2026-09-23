import { describe, expect, it } from 'vitest';
import { SqliteArtifactService } from './artifact.service';
import { SqliteAuthorService } from './author.service';
import { SqliteCruxService } from './crux.service';
import { getSqliteClient } from './client';

const artifacts = new SqliteArtifactService();
const authors = new SqliteAuthorService();
const cruxes = new SqliteCruxService();

describe('shared Artifact and avatar content', () => {
  it.each(['delete', 'replace'] as const)(
    'preserves avatar bytes when their last file reference is %s',
    async (action) => {
      const crux = await cruxes.create({ title: 'Shared bytes' });
      const content = `Avatar bytes ${crypto.randomUUID()}`;
      const file = await artifacts.create({
        resourceId: crux.id,
        content,
        meta: { path: 'avatar.txt' },
      });
      const author = await authors.create({
        username: `avatar-${crypto.randomUUID()}`,
        displayName: 'Avatar fixture',
      });
      await authors.update(author.id, { meta: { avatarFingerprint: file.fingerprint } });
      if (action === 'delete') await artifacts.delete(file.id, { writeThrough: false });
      else
        await artifacts.create({
          resourceId: crux.id,
          content: 'Replacement',
          meta: { path: 'avatar.txt' },
          writeThrough: false,
        });
      expect((await authors.findById(author.id)).meta?.avatarFingerprint).toBe(file.fingerprint);
      expect(new TextDecoder().decode(await getSqliteClient().blobRead(file.fingerprint!))).toBe(
        content,
      );
    },
  );

  it('keeps a historical portrait after its last editable file is deleted', async () => {
    const crux = await cruxes.create({ title: 'Historical portrait' });
    const file = await artifacts.create({
      resourceId: crux.id,
      content: 'Historical portrait bytes',
      meta: { path: 'old-portrait.txt' },
    });
    const history = await cruxes.create({
      title: 'Retained conversation',
      meta: { authorSnapshots: { previous: { avatarFingerprint: file.fingerprint } } },
    });
    await artifacts.delete(file.id, { writeThrough: false });
    expect((await cruxes.findById(history.id)).meta?.authorSnapshots).toEqual({
      previous: { avatarFingerprint: file.fingerprint },
    });
    expect(new TextDecoder().decode(await getSqliteClient().blobRead(file.fingerprint!))).toBe(
      'Historical portrait bytes',
    );
  });

  it('retains captured backup bytes after the live file reference is removed', async () => {
    const crux = await cruxes.create({ title: 'Unreferenced bytes' });
    const file = await artifacts.create({
      resourceId: crux.id,
      content: crypto.randomUUID(),
      meta: { path: 'unused.txt' },
    });
    const db = getSqliteClient();
    const captured = await db.export();
    const bytes = await db.blobRead(file.fingerprint!);
    await artifacts.delete(file.id, { writeThrough: false });
    expect(await db.inspectImport(captured)).toContain(file.fingerprint);
    expect(await db.blobRead(file.fingerprint!)).toEqual(bytes);
    await expect(artifacts.findById(file.id)).rejects.toThrow('Artifact not found');
  });
});
