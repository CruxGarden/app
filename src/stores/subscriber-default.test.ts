import { expect, it } from 'vitest';
import { localApiFixture } from '@/test/local-api-fixture';
import { initServices, getServices } from '@/services';
import { setDefaultModel, cruxModel } from '@/ai/keys';
import { createCruxStore } from './cruxStore';
import { loadGardenCollaboration } from '@/services/garden-collaboration';

localApiFixture();
it('uses the chosen included default in new Crux and Garden Collaborations', async () => {
  await initServices();
  await setDefaultModel('garden-included');
  const store = createCruxStore();
  const crux = await store.getState().createCrux('Included without keys');
  expect(crux.meta?.settings?.model).toBe('garden-included');
  const garden = await getServices().crux.create({ title: 'Included Garden', kind: 'garden' });
  expect((await loadGardenCollaboration(garden.id)).model).toBe('garden-included');
});

it('follows a changed default for automatic creations but preserves explicit choices', async () => {
  await initServices();
  await setDefaultModel('garden-included');
  const store = createCruxStore();
  const created = await store.getState().createCrux('Automatic');
  await setDefaultModel('ollama/personal');
  expect(cruxModel(created)).toBe('ollama/personal');
  expect(
    cruxModel({
      ...created,
      meta: {
        ...created.meta,
        settings: { ...created.meta?.settings, model: 'garden-included', modelAutomatic: false },
      },
    }),
  ).toBe('garden-included');
});
