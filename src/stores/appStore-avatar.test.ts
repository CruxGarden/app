import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initServices, type Services } from '@/services';
import { localApiFixture } from '@/test/local-api-fixture';

import { putBlob, readBlob } from '@/services/blobs';
import { useAppStore } from './appStore';
import { _avatarUrlCache, resolveAvatarUrlAsync, useAuthStore } from './authStore';

const native = localApiFixture();

let services: Services;
const original = 'Original portrait bytes';

beforeEach(async () => {
  services = await initServices();
  useAuthStore.setState({ isAuthenticated: false });
  const author = await services.author.create({ username: 'portrait', displayName: 'Portrait' });
  const fingerprint = await putBlob(new TextEncoder().encode(original));
  useAppStore.getState().setAuthor(
    await services.author.update(author.id, {
      meta: { avatarFingerprint: fingerprint, avatarMimeType: 'image/png', retained: 'metadata' },
    }),
  );
});

afterEach(() => {
  for (const url of _avatarUrlCache.values()) URL.revokeObjectURL(url);
  _avatarUrlCache.clear();
  useAppStore.getState().setAuthor(null);
});

describe('avatar content preservation', () => {
  it.each(['remove', 'replace'])(
    'keeps the saved portrait and displayed image when %s fails',
    async (action) => {
      const author = useAppStore.getState().author!;
      const url = await resolveAvatarUrlAsync(author);
      await native().faultSql(
        "CREATE TRIGGER refuse_avatar BEFORE UPDATE ON authors BEGIN SELECT RAISE(ABORT, 'Avatar update refused'); END",
      );
      const change =
        action === 'remove'
          ? useAppStore.getState().removeAvatar()
          : useAppStore
              .getState()
              .uploadAvatar(new File(['New portrait'], 'avatar.png', { type: 'image/png' }));
      await expect(change).rejects.toThrow('Avatar update refused');
      expect(useAppStore.getState().author).toEqual(author);
      expect(await services.author.findById(author.id)).toEqual(author);
      expect(
        new TextDecoder().decode(await readBlob(author.meta!.avatarFingerprint as string)),
      ).toBe(original);
      expect(await (await fetch(url!)).text()).toBe(original);
    },
  );
  it.each(['remove', 'replace'])(
    'preserves a shared historical portrait after successful %s',
    async (action) => {
      const author = useAppStore.getState().author!;
      const url = await resolveAvatarUrlAsync(author);
      const history = await services.crux.create({
        title: 'Retained portrait',
        meta: {
          authorSnapshots: { [author.id]: { ...author.meta, displayName: author.displayName } },
        },
      });
      const crux = await services.crux.create({ title: 'Shared file' });
      const file = await services.artifact.create({
        resourceId: crux.id,
        content: original,
        meta: { path: 'portrait.txt' },
      });
      expect(file.fingerprint).toBe(author.meta!.avatarFingerprint);
      if (action === 'remove') await useAppStore.getState().removeAvatar();
      else
        await useAppStore
          .getState()
          .uploadAvatar(new File(['Replacement portrait'], 'avatar.png', { type: 'image/png' }));
      const updated = await services.author.findById(author.id);
      expect(useAppStore.getState().author).toEqual(updated);
      expect(updated.meta?.retained).toBe('metadata');
      if (action === 'remove') expect(updated.meta?.avatarFingerprint).toBeNull();
      else
        expect(
          new TextDecoder().decode(await readBlob(updated.meta!.avatarFingerprint as string)),
        ).toBe('Replacement portrait');
      expect((await services.crux.findById(history.id)).meta?.authorSnapshots).toEqual({
        [author.id]: { ...author.meta, displayName: author.displayName },
      });
      expect(await services.artifact.readContent(file)).toBe(original);
      expect(await (await fetch(url!)).text()).toBe(original);
    },
  );
});
