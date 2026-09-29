import { beforeEach, expect, it, vi } from 'vitest';
import { listCloudOnlyCruxes, recoverPublishedCrux } from './recover';
import type { Crux } from '@/api/types';

const fixture = vi.hoisted(() => ({
  get: vi.fn(),
  artifacts: vi.fn(),
  download: vi.fn(),
  create: vi.fn(),
  upload: vi.fn(),
  blob: vi.fn(),
  assertCurrent: vi.fn(),
  finishProjection: vi.fn(),
}));
vi.mock('@/api/client', () => ({ default: { get: fixture.get } }));
vi.mock('@/api/session', () => ({
  captureAuth: () => ({ endpoint: 'https://api.test', revision: 1 }),
  assertAuthCurrent: fixture.assertCurrent,
}));
vi.mock('./sqlite/client', () => ({
  getSqliteClient: () => ({
    createCrux: fixture.create,
    fileContent: { finishProjection: fixture.finishProjection },
  }),
}));
vi.mock('./sqlite/identity', () => ({
  getLocalIdentity: async () => ({ authorId: 'local', homeId: 'home' }),
}));
vi.mock('./blobs', () => ({ putBlob: fixture.blob }));
vi.mock('@/api/public', () => ({
  getArtifacts: fixture.artifacts,
  downloadArtifact: fixture.download,
}));
vi.mock('@/services', () => ({
  getServices: () => ({ crux: { create: fixture.create }, artifact: { upload: fixture.upload } }),
}));
vi.mock('@/services/crux-io', () => ({ importCrux: vi.fn() }));
vi.mock('@/stores/gardenContext', () => ({ captureGardenId: () => 'destination' }));
const remote = (n: number): Crux => ({
  id: `crux-${n}`,
  data: '',
  status: 'living',
  visibility: 'public',
  discoverable: false,
  homeId: 'home',
  created: '2026-09-29',
  updated: '2026-09-29',
  authorId: 'remote-author',
  slug: `site-${n}`,
  title: `Site ${n}`,
  meta: { publishedAt: '2026-09-29T00:00:00Z' },
});

beforeEach(() => {
  vi.resetAllMocks();
  fixture.create.mockImplementation(async (dto) => dto.id);
  fixture.blob.mockResolvedValue('fingerprint');
  fixture.artifacts.mockResolvedValue([
    { id: 'html', filename: 'index.html', mimeType: 'text/html' },
  ]);
  fixture.download.mockResolvedValue(new Blob(['<h1>Recovered</h1>']));
});

it('collects every server page and joins backups while excluding local and unpublished Cruxes', async () => {
  const all = Array.from({ length: 105 }, (_, n) => remote(n));
  all[3] = { ...remote(3), meta: {} };
  fixture.get.mockImplementation(async (path, config) => {
    if (path === '/sync/crux')
      return {
        data: [
          {
            cruxId: 'crux-104',
            title: 'Backup',
            slug: 'site-104',
            updatedAt: '2026-09-30',
            size: 20,
          },
        ],
      };
    const page = Number(config?.params?.page || 1);
    const perPage = Math.min(Number(config?.params?.perPage || 25), 100);
    return {
      data: all.slice((page - 1) * perPage, page * perPage),
      headers: {
        pagination: JSON.stringify({
          currentPage: page,
          perPage,
          total: all.length,
          lastPage: Math.ceil(all.length / perPage),
        }),
      },
    };
  });
  const rows = await listCloudOnlyCruxes(new Set(['crux-0']));
  expect(rows).toHaveLength(103);
  expect(rows[0]).toMatchObject({
    id: 'crux-104',
    synced: { size: 20 },
    published: { authorId: 'remote-author' },
  });
  expect(new Set(rows.map((r) => r.id)).size).toBe(103);
});

it.each(['/sync/crux', '/cruxes'])(
  'reports a failed %s listing instead of claiming an empty account',
  async (failed) => {
    fixture.get.mockImplementation(async (path) => {
      if (path === failed) throw new Error('Connection unavailable');
      return {
        data: [],
        headers: {
          pagination: JSON.stringify({ currentPage: 1, perPage: 100, total: 0, lastPage: 1 }),
        },
      };
    });
    await expect(listCloudOnlyCruxes(new Set())).rejects.toThrow('Connection unavailable');
  },
);

it('refuses missing pagination rather than silently returning an incomplete list', async () => {
  fixture.get.mockResolvedValue({ data: [], headers: {} });
  await expect(listCloudOnlyCruxes(new Set())).rejects.toThrow(/pagination/i);
});

it('recovers published files using the remote author identity and captured destination Garden', async () => {
  await recoverPublishedCrux(remote(4));
  expect(fixture.artifacts).toHaveBeenCalledWith('remote-author', 'site-4');
  expect(fixture.download).toHaveBeenCalledWith('remote-author', 'site-4', 'html');
  expect(fixture.create).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'crux-4', gardenId: 'destination' }),
  );
  expect(fixture.create).toHaveBeenCalledWith(
    expect.objectContaining({
      authorId: 'local',
      initialFiles: [
        expect.objectContaining({
          put: expect.objectContaining({ path: 'index.html', fingerprint: 'fingerprint' }),
        }),
      ],
    }),
  );
  expect(fixture.upload).not.toHaveBeenCalled();
});

it('does not create a partial Crux when a later published download fails, and can retry', async () => {
  fixture.artifacts.mockResolvedValue([
    { id: 'html', filename: 'index.html', mimeType: 'text/html' },
    { id: 'css', filename: 'style.css', mimeType: 'text/css' },
  ]);
  fixture.download
    .mockResolvedValueOnce(new Blob(['<h1>Recovered</h1>']))
    .mockRejectedValueOnce(new Error('Download interrupted'));
  await expect(recoverPublishedCrux(remote(4))).rejects.toThrow('Download interrupted');
  expect(fixture.create).not.toHaveBeenCalled();
  await recoverPublishedCrux(remote(4));
  expect(fixture.create).toHaveBeenCalledTimes(1);
});

it('does not create a partial Crux on a refused Blob Store write', async () => {
  fixture.blob.mockRejectedValueOnce(new Error('Disk write refused'));
  await expect(recoverPublishedCrux(remote(4))).rejects.toThrow('Disk write refused');
  expect(fixture.create).not.toHaveBeenCalled();
  await expect(recoverPublishedCrux(remote(4))).resolves.toMatchObject({
    cruxId: 'crux-4',
    files: 1,
  });
});

it('refuses admission after the account connection changes during a download', async () => {
  fixture.download.mockImplementationOnce(async () => {
    fixture.assertCurrent.mockImplementation(() => {
      throw new Error('Account changed');
    });
    return new Blob(['old account file']);
  });
  await expect(recoverPublishedCrux(remote(4))).rejects.toThrow('Account changed');
  expect(fixture.create).not.toHaveBeenCalled();
});

it('reports saved content and restart recovery when the Project Folder write is refused', async () => {
  fixture.finishProjection.mockRejectedValueOnce(new Error('Folder write refused'));
  await expect(recoverPublishedCrux(remote(4))).rejects.toThrow(
    'Your recovered files are saved in Garden',
  );
  expect(fixture.create).toHaveBeenCalledTimes(1);
  expect(fixture.finishProjection).toHaveBeenCalledWith('crux-4');
});
