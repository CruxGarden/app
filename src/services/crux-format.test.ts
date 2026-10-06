import { beforeEach, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { localApiFixture } from '@/test/local-api-fixture';
import { initServices, getServices } from './index';
import { exportCrux, importCrux, peekImport } from './crux-io';
import { growthHostFor } from './growth';

const native = localApiFixture();
beforeEach(() => initServices());
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function fixture() {
  const crux = await getServices().crux.create({ title: 'Format Crux', slug: 'format-crux' });
  const file = await getServices().artifact.create({
    resourceId: crux.id,
    content: 'Hello',
    meta: { path: 'hello.txt' },
  });
  return { crux, file };
}

it('exports a verified archive3 graph and content-addressed inventory without duplicate bytes', async () => {
  const { crux, file } = await fixture();
  await (await growthHostFor(crux.id)).snapshot({ label: 'First', requestedBy: 'person' });
  await getServices().artifact.create({
    resourceId: crux.id,
    content: 'Hello',
    meta: { path: 'also.txt' },
  });
  const archive = await exportCrux({ cruxId: crux.id });
  expect(archive.filename).toMatch(/^format-crux-\d+\.crux$/);
  const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
  const envelope = JSON.parse(await zip.file('manifest.json')!.async('text'));
  expect(envelope).toMatchObject({
    archiveVersion: 3,
    purpose: 'private-backup',
    graphVersion: 3,
    payloadVersion: 1,
  });
  const graphBytes = await zip.file('graph.json')!.async('uint8array');
  expect(hash(graphBytes)).toBe(envelope.graphFingerprint);
  const graph = JSON.parse(new TextDecoder().decode(graphBytes));
  expect(graph.selection.roots).toEqual([crux.id]);
  const content = Object.keys(zip.files).filter(
    (name) => name.startsWith('content/') && !zip.files[name]!.dir,
  );
  expect(content).toHaveLength(graph.fingerprints.length);
  expect(content.filter((name) => name === `content/${file.fingerprint}`)).toHaveLength(1);
  for (const name of content)
    expect(hash(await zip.file(name)!.async('uint8array'))).toBe(name.slice('content/'.length));
  expect(zip.file('crux.json')).toBeNull();
  expect(zip.file('dimensions.json')).toBeNull();
});

it('refuses corrupted incoming content before replacement even when its original bytes are cached', async () => {
  const { crux, file } = await fixture();
  const archive = await exportCrux({ cruxId: crux.id });
  const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
  zip.file(`content/${file.fingerprint}`, 'Corrupt bytes');
  await getServices().artifact.create({
    resourceId: crux.id,
    content: 'Keep local work',
    meta: { path: 'hello.txt' },
  });
  await expect(
    importCrux({ data: await zip.generateAsync({ type: 'blob' }), mode: 'replace' }),
  ).rejects.toThrow();
  const [local] = await getServices().artifact.findByResource('crux', crux.id);
  expect(await getServices().artifact.readContent(local!)).toBe('Keep local work');
});

for (const damage of ['missing graph', 'unsupported version', 'unexpected entry'] as const)
  it(`refuses ${damage} without admitting records`, async () => {
    const { crux } = await fixture();
    const archive = await exportCrux({ cruxId: crux.id });
    const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
    if (damage === 'missing graph') zip.remove('graph.json');
    if (damage === 'unexpected entry') zip.file('unexpected.json', '{}');
    if (damage === 'unsupported version') {
      const envelope = JSON.parse(await zip.file('manifest.json')!.async('text'));
      zip.file('manifest.json', JSON.stringify({ ...envelope, archiveVersion: 999 }));
    }
    const before = await native().client.all('SELECT id, deleted FROM cruxes ORDER BY id');
    await expect(
      importCrux({ data: await zip.generateAsync({ type: 'blob' }), mode: 'clone' }),
    ).rejects.toThrow();
    expect(await native().client.all('SELECT id, deleted FROM cruxes ORDER BY id')).toEqual(before);
  });

it.each(['1.0', '2.0'])(
  'refuses retired archive format %s instead of manufacturing history',
  async (version) => {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ version }));
    zip.file('crux.json', JSON.stringify({ id: crypto.randomUUID(), title: 'Retired archive' }));
    const before = await native().client.all('SELECT id, deleted FROM cruxes ORDER BY id');
    await expect(importCrux({ data: await zip.generateAsync({ type: 'blob' }) })).rejects.toThrow();
    expect(await native().client.all('SELECT id, deleted FROM cruxes ORDER BY id')).toEqual(before);
  },
);

it('refuses all archive entry points without their native port', async () => {
  const { crux } = await fixture();
  const archive = await exportCrux({ cruxId: crux.id });
  const client = native().client;
  const saved = { fileContent: client.fileContent, privateArchive: client.privateArchive };
  client.fileContent = undefined;
  client.privateArchive = undefined;
  try {
    await expect(peekImport(archive.blob)).rejects.toThrow(/API archive service is unavailable/);
    await expect(exportCrux({ cruxId: crux.id })).rejects.toThrow(
      /API archive service is unavailable/,
    );
    await expect(importCrux({ data: archive.blob })).rejects.toThrow(
      /API archive service is unavailable/,
    );
  } finally {
    Object.assign(client, saved);
  }
});

it('computes a stable file fingerprint that changes with content and paths', async () => {
  const { crux } = await fixture();
  const artifact = getServices().artifact;
  const before = await artifact.computeSnapshotFingerprint(crux.id);
  expect(await artifact.computeSnapshotFingerprint(crux.id)).toBe(before);
  const updated = await artifact.create({
    resourceId: crux.id,
    content: 'Changed',
    meta: { path: 'hello.txt' },
  });
  const changed = await artifact.computeSnapshotFingerprint(crux.id);
  expect(changed).not.toBe(before);
  await artifact.update(updated, { meta: { path: 'renamed.txt' } });
  expect(await artifact.computeSnapshotFingerprint(crux.id)).not.toBe(changed);
});

it('edits a renamed native file in place without a duplicate identity', async () => {
  const { crux, file } = await fixture();
  const artifact = getServices().artifact;
  await artifact.update(file, { meta: { path: 'renamed.txt' } });
  await artifact.create({ resourceId: crux.id, content: 'Changed', meta: { path: 'renamed.txt' } });
  const after = await artifact.findByResource('crux', crux.id);
  expect(after).toHaveLength(1);
  expect(after[0]!.id).toBe(file.id);
  expect(after[0]!.filename).toBe('renamed.txt');
  expect(await artifact.readContent(after[0]!)).toBe('Changed');
});
