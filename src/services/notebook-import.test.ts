import { beforeEach, expect, it, vi } from 'vitest';
import { initServices, getServices } from './index';
import { createCruxStore } from '@/stores/cruxStore';
import { notebookSession } from './notebook';
import { validateVaultFiles } from './notebook-import';
import { exportCrux, importCrux } from './crux-io';

const markdown =
  '---\r\nid: a-tigrana-note\r\ncreated_at: 2026-09-10\r\n---\r\n# Note\r\n![Image](../.assets/image.png)\r\n';
const files = [
  { path: 'Folder/Note.md', content: markdown },
  { path: '.assets/image.png', content: 'data:image/png;base64,AQID' },
  { path: '.tigrana/metadata.json', content: '{"pinnedNotes":["a-tigrana-note"]}' },
  { path: 'Folder/.tigrana/folder.json', content: '{"id":"a-tigrana-folder"}' },
];
beforeEach(async () => {
  await initServices('local');
});
async function fixture() {
  const store = createCruxStore();
  const crux = await getServices().crux.create({
    title: 'Notebook',
    kind: 'notes',
    type: 'workspace',
  });
  store.setState({ crux });
  return { store, crux, call: notebookSession(store) };
}
it.each([
  [{ path: '../escape.md', content: '' }],
  [{ path: 'publish.json', content: '{"pages":["Private.md"]}' }, ...files],
  [
    { path: 'note.md', content: '' },
    { path: 'NOTE.md', content: '' },
  ],
  [{ path: '.tigrana/secrets.md', content: '' }],
  [
    { path: 'Café.md', content: '' },
    { path: 'Cafe\u0301.md', content: '' },
  ],
  [{ path: '.env', content: '' }, ...files],
  [{ path: 'image.png', content: 'data:image/png;base64,A' }, ...files],
  [{ path: '.tigrana/metadata.json', content: 'invalid' }, ...files],
  [{ path: 'huge.md', content: 'a'.repeat(8_000_001) }],
])('rejects invalid imports before writing anything', async (invalid) => {
  const { call, crux, store } = await fixture();
  await expect(call({ op: 'import', name: 'Vault', files: invalid })).rejects.toThrow();
  expect(await getServices().artifact.findByResource('crux', crux.id)).toHaveLength(0);
  expect(store.getState().growths).toHaveLength(0);
});
it('preserves folders, frontmatter, metadata and image bytes, remains private, and survives export', async () => {
  const { call, crux, store } = await fixture();
  await call({
    op: 'write',
    path: 'publish.json',
    content: '{"title":"Selected","pages":[]}',
    expected: null,
  });
  const before = store.getState().growths.length;
  expect(await call({ op: 'import', name: 'Vault', files })).toMatchObject({
    root: 'Imported/Vault',
    imported: 4,
    notes: 1,
  });
  expect(store.getState().growths.length).toBe(before + 1);
  expect(store.getState().growths.at(-1)?.meta?.appChanges).toEqual({ app: 0, content: 4 });
  expect(await call({ op: 'read', path: 'Imported/Vault/Folder/Note.md' })).toMatchObject({
    content: markdown,
  });
  expect(await call({ op: 'read', path: 'Imported/Vault/.assets/image.png' })).toMatchObject({
    content: files[1]!.content,
  });
  expect(await call({ op: 'read', path: 'publish.json' })).toMatchObject({
    content: '{"title":"Selected","pages":[]}',
  });
  expect(await call({ op: 'import', name: 'vault', files })).toMatchObject({
    root: 'Imported/vault 2',
  });
  const archive = await exportCrux({ cruxId: crux.id });
  const restored = await importCrux({ data: archive.blob, mode: 'clone' });
  const artifacts = await getServices().artifact.findByResource('crux', restored.cruxId);
  for (const file of files.filter((f) => !f.path.endsWith('.png'))) {
    const artifact = artifacts.find(
      (a) => a.meta?.path === `notebook/Imported/Vault/${file.path}`,
    )!;
    expect(await getServices().artifact.readContent(artifact.id)).toBe(file.content);
  }
  expect(validateVaultFiles(files)).toEqual(files);
});
it('retains a recoverable partial copy when storage fails and never replaces existing content', async () => {
  const { call, store } = await fixture();
  await call({ op: 'write', path: 'Original.md', content: 'Keep me', expected: null });
  const artifact = getServices().artifact;
  vi.spyOn(artifact, 'upload').mockRejectedValueOnce(new Error('Disk full'));
  await expect(call({ op: 'import', name: 'Vault', files })).rejects.toThrow(
    '1 of 4 files were copied',
  );
  expect(await call({ op: 'read', path: 'Original.md' })).toMatchObject({ content: 'Keep me' });
  expect(await call({ op: 'read', path: 'Imported/Vault/Folder/Note.md' })).toMatchObject({
    content: markdown,
  });
  expect(store.getState().growths.at(-1)?.meta?.label).toBe('Partial notebook import: 1 files');
  vi.restoreAllMocks();
});
