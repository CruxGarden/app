/**
 * Saving text from the editor or the Builder must keep the artifact readable
 * as text. `saveArtifactContent` used to `upload()` a Blob, which rewrote the
 * row as `encoding: 'binary'` — the very next `readContent` (the Builder's
 * frontmatter list, the 5Ws Shelf view) then threw "Cannot read binary
 * content as string".
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useCruxStore } from './cruxStore';
import { initServices, getServices } from '@/services';

describe('saveArtifactContent', () => {
  beforeEach(async () => {
    await initServices('local');
  });

  it('keeps a text artifact readable after a save (utf-8, same id, same path)', async () => {
    const { crux, artifact } = getServices();
    const created = await crux.create({ title: 'Save Test' });
    const file = await artifact.create({
      resourceId: created.id,
      content: '{"entries":[]}\n',
      meta: { path: 'shelf.json' },
    });
    useCruxStore.setState({ crux: created, artifacts: [file] });

    const next = '{"entries":[{"id":"ibn-khaldun","name":"Ibn Khaldūn"}]}\n';
    const updated = await useCruxStore.getState().saveArtifactContent(file.id, next);

    expect(updated?.id).toBe(file.id);
    expect(updated?.encoding).toBe('utf-8');
    expect(updated?.meta?.path).toBe('shelf.json');
    await expect(artifact.readContent(file.id)).resolves.toBe(next);
    // The store row reflects the new fingerprint (the Builder re-reads on it)
    const inStore = useCruxStore.getState().artifacts.find((a) => a.id === file.id)!;
    expect(inStore.fingerprint).toBe(updated?.fingerprint);
    expect(inStore.fingerprint).not.toBe(file.fingerprint);
  });
});
