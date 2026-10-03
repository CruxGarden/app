import { localApiFixture } from '@/test/local-api-fixture';
import { beforeEach, describe, expect, it } from 'vitest';
import { initServices, getServices } from './index';
import { loadGardenCollaboration, saveGardenCollaboration } from './garden-collaboration';
import { cruxUpsertFields } from './publish';

localApiFixture();

describe('Garden-owned Collaboration', () => {
  beforeEach(async () => {
    await initServices();
  });

  it('keeps each Garden history on its owner and excludes it from public publication', async () => {
    const { crux } = getServices();
    const a = await crux.create({
      title: 'Studio',
      kind: 'garden',
      meta: { brief: 'Preserve me' },
    });
    const b = await crux.create({ title: 'Writing', kind: 'garden' });
    const state = {
      version: 1 as const,
      model: 'test-model',
      activeId: 'one',
      conversations: [
        {
          id: 'one',
          title: 'Private idea',
          createdAt: 1,
          messages: [{ role: 'user' as const, content: 'Private Garden conversation' }],
        },
      ],
    };
    await saveGardenCollaboration(a.id, state);
    expect(await loadGardenCollaboration(a.id)).toEqual(state);
    expect((await loadGardenCollaboration(b.id)).conversations).toEqual([]);
    const saved = await crux.findById(a.id);
    expect(saved.meta?.brief).toBe('Preserve me');
    expect(saved.meta?.gardenCollaboration).toEqual(state);
    expect(JSON.stringify(cruxUpsertFields(saved))).not.toContain('Private Garden conversation');
  });
  it('refuses malformed or unavailable histories without replacing them with an empty list', async () => {
    const { crux } = getServices();
    const invalid = await crux.create({
      title: 'Invalid',
      kind: 'garden',
      meta: { gardenCollaboration: { version: 99, conversations: ['private retained value'] } },
    });
    await expect(loadGardenCollaboration(invalid.id)).rejects.toThrow('has not been replaced');
    expect((await crux.findById(invalid.id)).meta?.gardenCollaboration).toEqual({
      version: 99,
      conversations: ['private retained value'],
    });
    const project = await crux.create({ title: 'Not a Garden' });
    await expect(loadGardenCollaboration(project.id)).rejects.toThrow('unavailable');
    const trashed = await crux.create({ title: 'Trash', kind: 'garden' });
    await crux.trash(trashed.id);
    await expect(loadGardenCollaboration(trashed.id)).rejects.toThrow('unavailable');
  });
});
