import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initServices, getServices } from './index';
import { seedWelcomeCrux } from './welcome-crux';

beforeEach(async () => {
  await initServices();
});
afterEach(() => vi.restoreAllMocks());

describe('first home page', () => {
  it('seeds once under concurrent setup and preserves edits on retry without inventing a conversation', async () => {
    const [id, same] = await Promise.all([seedWelcomeCrux(), seedWelcomeCrux()]);
    expect(same).toBe(id);
    const { crux, artifact } = getServices();
    const project = await crux.findById(id);
    expect(project.meta?.messages).toEqual([]);
    expect(project.meta?.contentModel).toMatchObject({ guide: { title: 'Your first home page' } });
    await artifact.create({
      resourceId: id,
      content: '{"name":"My own name"}',
      meta: { path: 'src/config.json' },
    });
    expect(await seedWelcomeCrux()).toBe(id);
    const files = await artifact.findByResource('crux', id);
    const config = files.find((file) => file.meta?.path === 'src/config.json')!;
    expect(await artifact.readContent(config.id)).toContain('My own name');
    expect((await crux.listAll()).filter((item) => item.meta?.welcome)).toHaveLength(1);
  });

  it('retries an interrupted file registration in the same project', async () => {
    vi.spyOn(getServices().artifact, 'registerMany').mockRejectedValueOnce(new Error('Disk full'));
    await expect(seedWelcomeCrux()).rejects.toThrow('Disk full');
    const pending = (await getServices().crux.listAll()).find((item) => item.meta?.welcome)!;
    expect(pending.meta?.template).toBeUndefined();
    expect(await seedWelcomeCrux()).toBe(pending.id);
    expect((await getServices().crux.findById(pending.id)).meta?.template).toBe('hello-world');
  });
});
