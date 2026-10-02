import { localApiFixture } from '@/test/local-api-fixture';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getServices, initServices } from './index';
import { createCruxspace, listCruxspaces } from './cruxspaces';
import { exportCruxspace } from './cruxspace-package';
import { startCruxspaceTemplate } from './cruxspace-templates';
import { growthHostFor } from './growth';

localApiFixture();
beforeEach(() => initServices());
afterEach(() => vi.unstubAllGlobals());
async function packageBytes() {
  const crux = await getServices().crux.create({
    title: 'A real starting point',
    type: 'workspace',
  });
  await getServices().artifact.create({
    resourceId: crux.id,
    content: 'A first draft',
    meta: { path: 'draft.md' },
  });
  await (
    await growthHostFor(crux.id)
  ).snapshot({ label: 'Actual first draft', requestedBy: 'person' });
  const space = await createCruxspace({
    name: 'Source',
    brief: 'Make a draft.',
    cruxIds: [crux.id],
  });
  return {
    space,
    crux,
    bytes: await (await exportCruxspace({ spaceId: space.id })).blob.arrayBuffer(),
  };
}
it('makes independent copies with the original content and Growth, including a separate example', async () => {
  const source = await packageBytes();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(source.bytes)),
  );
  const a = await startCruxspaceTemplate({ templateId: 'home-page', name: 'My site' });
  const b = await startCruxspaceTemplate({
    templateId: 'home-page',
    name: 'Another site',
    exampleMode: 'start',
  });
  expect(a.space.name).toBe('My site');
  expect(a.exampleSpaceId).toBeTruthy();
  expect(b.exampleSpaceId).toBeUndefined();
  expect(new Set([source.crux.id, ...a.space.cruxIds, ...b.space.cruxIds]).size).toBe(3);
  expect(a.space.origin?.members[source.crux.id]).toBe(a.space.cruxIds[0]);
  const files = await getServices().artifact.findByResource('crux', a.space.cruxIds[0]!);
  expect(
    await getServices().artifact.readContent(files.find((f) => f.filename === 'draft.md')!),
  ).toBe('A first draft');
  const growth = await getServices().dimension.findBySourceAndType(a.space.cruxIds[0]!, 'growth');
  expect(growth.some((g) => g.meta?.label === 'Actual first draft')).toBe(true);
});
it('downloads both editions before creating anything and reports a failed download', async () => {
  const source = await packageBytes();
  const before = (await listCruxspaces()).map((s) => s.id);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.includes('example') ? new Response('', { status: 503 }) : new Response(source.bytes),
    ),
  );
  await expect(startCruxspaceTemplate({ templateId: 'home-page' })).rejects.toThrow(
    'Could not load',
  );
  expect((await listCruxspaces()).map((s) => s.id)).toEqual(before);
});
it('removes the first copy if the example archive is broken', async () => {
  const source = await packageBytes();
  const beforeSpaces = (await listCruxspaces()).map((s) => s.id).sort();
  const beforeCruxes = (await getServices().crux.listAll()).map((c) => c.id).sort();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) => new Response(url.includes('example') ? 'not a ZIP' : source.bytes),
    ),
  );
  await expect(startCruxspaceTemplate({ templateId: 'home-page' })).rejects.toThrow();
  expect((await listCruxspaces()).map((s) => s.id).sort()).toEqual(beforeSpaces);
  expect((await getServices().crux.listAll()).map((c) => c.id).sort()).toEqual(beforeCruxes);
});
it('rejects unknown templates before downloading', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(startCruxspaceTemplate({ templateId: '../unknown' })).rejects.toThrow(
    'available undertaking',
  );
  expect(fetch).not.toHaveBeenCalled();
});
