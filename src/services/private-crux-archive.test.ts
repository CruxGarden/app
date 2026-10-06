import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  archive: { export: vi.fn(), inspect: vi.fn(), import: vi.fn(), replacementToken: vi.fn() },
  client: { privateArchive: undefined as unknown },
  find: vi.fn(),
  capture: vi.fn(),
  close: vi.fn(),
  identity: vi.fn(),
}));
vi.mock('./sqlite/client', () => ({ getSqliteClient: () => mock.client }));
vi.mock('./sqlite/identity', () => ({ getLocalIdentity: mock.identity }));
vi.mock('./index', () => ({ getServices: () => ({ crux: { findById: mock.find } }) }));
vi.mock('./tasks', () => ({ withCapturedTaskGraph: mock.capture }));
vi.mock('@/stores/workspaceRegistry', () => ({ withClosedCruxWorkspaces: mock.close }));
import { exportPrivateCrux, importPrivateCrux } from './private-crux-archive';
beforeEach(() => {
  vi.resetAllMocks();
  mock.client.privateArchive = mock.archive;
  mock.identity.mockResolvedValue({ authorId: 'author', homeId: 'home' });
  mock.find.mockResolvedValue({ slug: 'saved' });
  mock.archive.export.mockResolvedValue(new Uint8Array([1, 2]));
  mock.archive.inspect.mockResolvedValue({
    roots: ['root'],
    includeMembers: false,
    root: { title: 'Saved', meta: { layout: { panels: [] } } },
    growthCount: 3,
  });
  mock.archive.import.mockResolvedValue({ roots: ['copied-root'] });
  mock.archive.replacementToken.mockResolvedValue('captured');
  mock.capture.mockImplementation(async (_id, action) => action());
  mock.close.mockImplementation(async (_id, action) => action());
});
it('exports the saved workspace through the same API graph capture used by agents', async () => {
  const result = await exportPrivateCrux({ cruxId: 'root', messages: [] });
  expect(mock.capture).toHaveBeenCalledWith('root', expect.any(Function));
  expect(mock.archive.export).toHaveBeenCalledWith({ roots: ['root'], includeMembers: false });
  expect(result.filename).toMatch(/^saved-.*\.crux$/);
  expect(Array.from(new Uint8Array(await result.blob.arrayBuffer()))).toEqual([1, 2]);
});
it('copies incoming bytes and destination identity before admission and returns archive presentation', async () => {
  const bytes = new Uint8Array([1, 2]);
  const pending = importPrivateCrux({ data: bytes.buffer, mode: 'clone', requestId: 'retry' });
  bytes[0] = 99;
  expect(await pending).toMatchObject({
    cruxId: 'copied-root',
    title: 'Saved',
    growthCount: 3,
    failedArtifacts: [],
  });
  expect(mock.archive.import).toHaveBeenCalledWith(new Uint8Array([1, 2]), {
    mode: 'copy',
    requestId: 'retry',
    destination: { authorId: 'author', homeId: 'home' },
  });
});
it('gets the replacement token only after existing writers have closed', async () => {
  let closed = false;
  mock.close.mockImplementation(async (_id, action) => {
    closed = true;
    return action();
  });
  mock.archive.replacementToken.mockImplementation(async () => {
    expect(closed).toBe(true);
    return 'captured';
  });
  await importPrivateCrux({ data: new ArrayBuffer(0), mode: 'replace' });
  expect(mock.close).toHaveBeenCalledWith('root', expect.any(Function));
  expect(mock.archive.import).toHaveBeenCalledWith(
    expect.any(Uint8Array),
    expect.objectContaining({ mode: 'replace', replacementToken: 'captured' }),
  );
});
it('refuses unavailable archive transport and does not silently use a different database path', async () => {
  mock.client.privateArchive = undefined;
  await expect(exportPrivateCrux({ cruxId: 'root', messages: [] })).rejects.toThrow('unavailable');
  await expect(importPrivateCrux({ data: new ArrayBuffer(0) })).rejects.toThrow('unavailable');
  expect(mock.capture).not.toHaveBeenCalled();
  expect(mock.archive.import).not.toHaveBeenCalled();
});
it('propagates failed capture or replacement without announcing success', async () => {
  mock.capture.mockRejectedValue(new Error('Unsaved files'));
  await expect(exportPrivateCrux({ cruxId: 'root', messages: [] })).rejects.toThrow('Unsaved');
  expect(mock.archive.export).not.toHaveBeenCalled();
  const progress = vi.fn();
  mock.archive.import.mockRejectedValue(new Error('Changed while preparing'));
  await expect(
    importPrivateCrux({ data: new ArrayBuffer(0), mode: 'replace', onProgress: progress }),
  ).rejects.toThrow('Changed');
  expect(progress).not.toHaveBeenCalledWith(1, 1);
});
