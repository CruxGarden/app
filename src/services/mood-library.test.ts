import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  db: {
    fileContent: { head: vi.fn(), read: vi.fn(), edit: vi.fn() },
    gardenMembership: { list: vi.fn(), parents: vi.fn() },
    createCrux: vi.fn(),
    blobRead: vi.fn(),
    blobWrite: vi.fn(),
    get: vi.fn(),
    setCruxTrashed: vi.fn(),
  },
  pack: vi.fn(),
  unpack: vi.fn(),
  identity: vi.fn(),
}));
vi.mock('./sqlite/client', () => ({ getSqliteClient: () => mock.db }));
vi.mock('./sqlite/identity', () => ({ getLocalIdentity: mock.identity }));
vi.mock('@/lib/moods/packages', () => ({
  exportMoodPackage: mock.pack,
  importMoodPackage: mock.unpack,
}));
import { useGardenContext } from '@/stores/gardenContext';
import {
  cachedMoodLibrary,
  refreshMoodLibrary,
  saveMoodCrux,
  retainCurrentMoodPackages,
} from './mood-library';
import type { MoodPackage } from '@/lib/moods/packages';
const pkg = () => ({ id: 'portable', name: 'Dusk', version: 1 }) as MoodPackage;
const head = { cruxId: 'mood', revision: 1, formatVersion: 1 as const, root: 'a'.repeat(64) };
beforeEach(() => {
  vi.resetAllMocks();
  useGardenContext.getState().initialize({ id: 'root', slug: 'root' });
  mock.pack.mockResolvedValue(new Blob([new Uint8Array([1, 2])]));
  mock.unpack.mockImplementation(async () => pkg());
  mock.identity.mockResolvedValue({ authorId: 'author', homeId: 'home' });
  mock.db.fileContent.head.mockResolvedValue(head);
  mock.db.fileContent.read.mockResolvedValue({ bytes: new Uint8Array([1, 2]), head });
  mock.db.gardenMembership.list.mockResolvedValue({
    items: [{ id: 'mood', kind: 'mood', title: 'Dusk' }],
    next: null,
  });
  mock.db.gardenMembership.parents.mockResolvedValue([{ id: 'root' }]);
});
it('captures the package and destination before preparing bytes, even after navigation', async () => {
  let release!: (blob: Blob) => void;
  mock.pack.mockReturnValue(
    new Promise<Blob>((resolve) => {
      release = resolve;
    }),
  );
  const input = pkg();
  const pending = saveMoodCrux(input);
  input.name = 'Later';
  useGardenContext.getState().select({ id: 'elsewhere', slug: 'elsewhere' });
  release(new Blob([new Uint8Array([1, 2])]));
  await pending;
  expect(mock.db.createCrux).toHaveBeenCalledWith(
    expect.objectContaining({
      gardenId: 'root',
      title: 'Dusk',
      kind: 'mood',
      initialFiles: [expect.objectContaining({ bytes: new Uint8Array([1, 2]) })],
    }),
  );
  expect(mock.db.fileContent.edit).not.toHaveBeenCalled();
  expect(cachedMoodLibrary()).toEqual([]);
});
it('refuses a profile change after preparation instead of writing into a replacement profile', async () => {
  mock.pack.mockImplementation(async () => {
    useGardenContext.getState().initialize({ id: 'root', slug: 'root' });
    return new Blob(['x']);
  });
  await expect(saveMoodCrux(pkg())).rejects.toThrow('connection changed');
  expect(mock.db.createCrux).not.toHaveBeenCalled();
});
it('replacement uses the inspected head and propagates a conflict without creating a substitute', async () => {
  const [selected] = await refreshMoodLibrary();
  mock.db.fileContent.edit.mockRejectedValue(new Error('File content changed'));
  mock.db.fileContent.head.mockResolvedValue({ ...head, revision: 2 });
  await expect(saveMoodCrux({ ...selected!, author: 'New author' }, selected)).rejects.toThrow(
    'changed',
  );
  expect(mock.db.fileContent.edit).toHaveBeenCalledWith(
    expect.objectContaining({ cruxId: 'mood', expected: head }),
  );
  expect(mock.db.createCrux).not.toHaveBeenCalled();
  expect(cachedMoodLibrary()[0]?.name).toBe('Dusk');
});
it('an older library read cannot replace a newer completed read or survive a profile change', async () => {
  let release!: (value: unknown) => void;
  mock.db.fileContent.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const earlier = refreshMoodLibrary();
  await vi.waitFor(() => expect(mock.db.fileContent.read).toHaveBeenCalled());
  mock.db.gardenMembership.list.mockResolvedValue({
    items: [{ id: 'mood', kind: 'mood', title: 'Newer' }],
    next: null,
  });
  await refreshMoodLibrary();
  release({ bytes: new Uint8Array([1]), head });
  await earlier;
  expect(cachedMoodLibrary()[0]?.name).toBe('Newer');
  useGardenContext.getState().initialize({ id: 'root', slug: 'root' });
  expect(cachedMoodLibrary()).toEqual([]);
});
it('failed current-data retirement retries the same admitted identity without duplicate packages', async () => {
  const retire = vi
    .fn()
    .mockRejectedValueOnce(new Error('Settings refused'))
    .mockResolvedValue(undefined);
  await expect(retainCurrentMoodPackages([pkg()], retire)).rejects.toThrow('Settings refused');
  const admitted = mock.db.createCrux.mock.calls[0]![0];
  mock.db.get.mockResolvedValue({ kind: 'mood' });
  await retainCurrentMoodPackages([pkg()], retire);
  expect(mock.db.createCrux).toHaveBeenCalledTimes(1);
  expect(mock.db.get).toHaveBeenLastCalledWith(expect.any(String), [admitted.id]);
  expect(retire).toHaveBeenCalledTimes(2);
});
it('missing retained content preserves the current package list for recovery', async () => {
  mock.db.get.mockResolvedValue({ kind: 'mood' });
  mock.db.fileContent.read.mockResolvedValue(null);
  const retire = vi.fn();
  await expect(retainCurrentMoodPackages([pkg()], retire)).rejects.toThrow('unavailable');
  expect(retire).not.toHaveBeenCalled();
});
