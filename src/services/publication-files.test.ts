import { beforeEach, expect, it } from 'vitest';
import { localApiFixture } from '@/test/local-api-fixture';
import { initServices, getServices } from './index';
import { downloadPublicationBlob } from './publication-files';

const native = localApiFixture();
beforeEach(() => initServices());
async function selected() {
  const crux = await getServices().crux.create({ title: 'To share' });
  const file = await getServices().artifact.create({
    resourceId: crux.id,
    content: '<h1>Selected page</h1>',
    meta: { path: 'index.html' },
  });
  return { crux, file };
}
it('keeps the selected page readable after an unrelated internal file advances its head', async () => {
  const { crux, file } = await selected();
  await getServices().artifact.create({
    resourceId: crux.id,
    content: 'Updated guide',
    meta: { path: 'AGENTS.md' },
  });
  expect(await (await downloadPublicationBlob(file)).text()).toBe('<h1>Selected page</h1>');
});
it('refuses a changed selected page instead of silently sharing its latest bytes', async () => {
  const { crux, file } = await selected();
  await getServices().artifact.create({
    resourceId: crux.id,
    content: '<h1>Later page</h1>',
    meta: { path: 'index.html' },
  });
  await expect(downloadPublicationBlob(file)).rejects.toThrow();
});
it('refuses a replacement file even when its path and bytes match the selected file', async () => {
  const { crux, file } = await selected();
  await getServices().artifact.delete(file);
  const next = await getServices().artifact.create({
    resourceId: crux.id,
    content: '<h1>Selected page</h1>',
    meta: { path: 'index.html' },
  });
  expect(next.id).not.toBe(file.id);
  await expect(downloadPublicationBlob(file)).rejects.toThrow();
});
it('refuses a foreign file reference regardless of head changes', async () => {
  const { crux, file } = await selected();
  const other = await getServices().crux.create({ title: 'Other work' });
  await getServices().artifact.create({
    resourceId: crux.id,
    content: 'Guide',
    meta: { path: 'AGENTS.md' },
  });
  await expect(downloadPublicationBlob({ ...file, resourceId: other.id })).rejects.toThrow();
});

it.each([false, true])(
  'refuses missing selected bytes even when the head changed: %s',
  async (advance) => {
    const { crux, file } = await selected();
    if (advance)
      await getServices().artifact.create({
        resourceId: crux.id,
        content: 'Guide',
        meta: { path: 'AGENTS.md' },
      });
    await native().client.blobDelete(file.fingerprint!);
    await expect(downloadPublicationBlob(file)).rejects.toThrow();
  },
);
it('refuses changed publishing attributes even when file identity and bytes match', async () => {
  const { crux, file } = await selected();
  const next = await getServices().artifact.upload({
    resourceId: crux.id,
    blob: new Blob(['<h1>Selected page</h1>']),
    mimeType: 'text/plain',
    meta: { path: 'index.html' },
  });
  expect(next.id).toBe(file.id);
  expect(next.fingerprint).toBe(file.fingerprint);
  await expect(downloadPublicationBlob(file)).rejects.toThrow(/changed/);
});
