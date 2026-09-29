import { beforeEach, expect, it, vi } from 'vitest';
import { listCloudOnlyCruxes, recoverPublishedCrux } from './recover';
import type { Crux } from '@/api/types';

const fixture = vi.hoisted(() => ({
  get: vi.fn(),
  artifacts: vi.fn(),
  download: vi.fn(),
  create: vi.fn(),
  upload: vi.fn(),
}));
vi.mock('@/api/client', () => ({ default: { get: fixture.get } }));
vi.mock('@/api/session', () => ({
  captureAuth: () => ({ endpoint: 'https://api.test', revision: 1 }),
}));
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
  fixture.create.mockImplementation(async (dto) => dto);
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
  expect(fixture.upload).toHaveBeenCalledWith(
    expect.objectContaining({ resourceId: 'crux-4', meta: { path: 'index.html' } }),
  );
});
