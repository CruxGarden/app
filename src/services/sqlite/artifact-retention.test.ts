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

  it('still reclaims bytes that neither files nor authors retain', async () => {
    const crux = await cruxes.create({ title: 'Unreferenced bytes' });
    const file = await artifacts.create({
      resourceId: crux.id,
      content: crypto.randomUUID(),
      meta: { path: 'unused.txt' },
    });
    await artifacts.delete(file.id, { writeThrough: false });
    await expect(getSqliteClient().blobRead(file.fingerprint!)).rejects.toThrow();
  });
});
