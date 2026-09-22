import { afterEach, describe, expect, it } from 'vitest';
import client from '@/api/client';
import { ApiDimensionService } from './dimension.service';
import { SqliteDimensionService } from '../sqlite/dimension.service';

const originalAdapter = client.defaults.adapter;
afterEach(() => {
  client.defaults.adapter = originalAdapter;
});

describe('Dimension transport contract', () => {
  it('sends all portable relationship fields through the HTTP adapter', async () => {
    const sent: { url?: string; body: unknown }[] = [];
    client.defaults.adapter = async (config) => {
      const body = JSON.parse(config.data);
      sent.push({ url: config.url, body });
      return { data: body, status: 200, statusText: 'OK', headers: {}, config };
    };
    const input = {
      sourceId: crypto.randomUUID(),
      targetId: crypto.randomUUID(),
      type: 'garden' as const,
      kind: 'membership',
      weight: 3,
      note: 'In this Garden',
      meta: { displayOrder: 3, origin: { cruxId: 'original' } },
    };
    const api = new ApiDimensionService();
    await api.create(input);
    await api.update('relationship', { kind: 'membership', meta: { displayOrder: 4 } });
    const { sourceId, ...body } = input;
    expect(sent).toEqual([
      { url: `/cruxes/${sourceId}/dimensions`, body },
      { url: '/dimensions/relationship', body: { kind: 'membership', meta: { displayOrder: 4 } } },
    ]);
  });

  it('retains nested metadata and unrelated keys when a local relationship is edited', async () => {
    const local = new SqliteDimensionService();
    const created = await local.create({
      sourceId: crypto.randomUUID(),
      targetId: crypto.randomUUID(),
      type: 'garden',
      kind: 'membership',
      meta: { displayOrder: 1, origin: { cruxId: 'original' } },
    });
    await local.update(created.id, { meta: { displayOrder: 2 } });
    expect(await local.findById(created.id)).toMatchObject({
      kind: 'membership',
      meta: { displayOrder: 2, origin: { cruxId: 'original' } },
    });
    expect(await local.findBySourceAndType(created.sourceId, 'garden')).toHaveLength(1);
  });
});
