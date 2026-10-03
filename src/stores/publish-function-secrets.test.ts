import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { initServices, getServices } from '@/services';
import { createCruxStore } from './cruxStore';
import * as publish from '@/services/publish';
import * as secrets from '@/services/function-secrets';
import * as functions from '@/services/crux-functions';
import * as cues from '@/services/cues';
import { captureAuth } from '@/api/session';

beforeEach(async () => {
  await initServices();
  vi.spyOn(cues, 'playCue').mockImplementation(async () => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

async function workspace() {
  const crux = await getServices().crux.create({ title: 'Function credentials' });
  const artifact = await getServices().artifact.create({
    resourceId: crux.id,
    content: 'export default () => true;',
    meta: { path: 'functions/hello.js' },
  });
  const store = createCruxStore();
  store.setState({ crux, artifacts: [artifact] });
  return store;
}

it('refuses publication before any remote change when local secrets cannot be read', async () => {
  const store = await workspace();
  const pipeline = vi.spyOn(publish, 'publishPipeline');
  vi.spyOn(secrets, 'localSecrets').mockRejectedValue(new Error('Keychain locked'));
  expect(await store.getState().publishCrux()).toBe(false);
  expect(pipeline).not.toHaveBeenCalled();
  expect(store.getState().publishFailure?.message).toContain('Keychain locked');
});

it('reports a partial publication safely and only reports success after credentials are synchronized', async () => {
  const store = await workspace();
  vi.spyOn(publish, 'publishPipeline').mockImplementation(async (crux) => ({
    ...crux,
    meta: { ...crux.meta, publishedAt: new Date().toISOString() },
  }));
  vi.spyOn(secrets, 'localSecrets').mockResolvedValue({ TOKEN: 'fixture-private-value' });
  const upload = vi.spyOn(functions, 'putRemoteSecret').mockRejectedValue({
    config: { data: '{"value":"fixture-private-value"}' },
  });
  const activate = vi.spyOn(functions, 'listPublishedFunctions').mockResolvedValue([]);
  expect(await store.getState().publishCrux()).toBe(false);
  expect(store.getState().crux?.meta?.publishedAt).toBeTruthy();
  expect(store.getState().publishFailure?.message).toContain('is published, but');
  expect(activate).not.toHaveBeenCalled();
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
    'fixture-private-value',
  );
  expect(vi.mocked(cues.playCue).mock.calls.some(([cue]) => cue === 'published')).toBe(false);
  upload.mockResolvedValue(undefined);
  const context = captureAuth();
  expect(await store.getState().publishCrux()).toBe(true);
  expect(activate).toHaveBeenCalledWith(store.getState().crux!.id, context);
  expect(store.getState().publishFailure).toBeNull();
});
