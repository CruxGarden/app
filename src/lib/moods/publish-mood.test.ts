import { describe, it, expect, beforeEach } from 'vitest';
import {
  publishMood,
  moodSummary,
  moodPreviewHtml,
  installMoodFromPublished,
} from './publish-mood';
import { captureCurrentMood, getInstalledMoods, exportMoodPackage } from './packages';
import { addAsset } from './assets';
import type { Crux } from '@/api/types';
import { initServices } from '@/services';
import { setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';

function fakeServices() {
  const cruxes = new Map<string, Crux>();
  const artifacts: {
    id: string;
    resourceId: string;
    path: string;
    content?: string;
    blob?: Blob;
  }[] = [];
  let n = 0;
  const services = {
    crux: {
      async create(input: Record<string, unknown>) {
        const c = { id: `crux-${++n}`, slug: `slug-${n}`, meta: {}, ...input } as unknown as Crux;
        cruxes.set(c.id, c);
        return c;
      },
      async update(id: string, updates: Record<string, unknown>) {
        const c = { ...cruxes.get(id)!, ...updates } as Crux;
        cruxes.set(id, c);
        return c;
      },
      async findById(id: string) {
        return cruxes.get(id) ?? null;
      },
    },
    artifact: {
      async findByResource(_t: string, id: string) {
        return artifacts
          .filter((a) => a.resourceId === id)
          .map((a) => ({ id: a.id, meta: { path: a.path } }));
      },
      async create(input: Record<string, unknown>) {
        artifacts.push({
          id: `a-${++n}`,
          resourceId: input.resourceId as string,
          path: (input.meta as { path: string }).path,
          content: input.content as string,
        });
      },
      async upload(input: Record<string, unknown>) {
        artifacts.push({
          id: `a-${++n}`,
          resourceId: input.resourceId as string,
          path: (input.meta as { path: string }).path,
          blob: input.blob as Blob,
        });
      },
      async delete(id: string) {
        const i = artifacts.findIndex((a) => a.id === id);
        if (i >= 0) artifacts.splice(i, 1);
      },
    },
  };
  return { services, cruxes, artifacts };
}

describe('publishing a Mood', () => {
  beforeEach(async () => {
    await initServices();
    setSetting(SettingsKey.MoodPackages, '');
    setSetting(SettingsKey.MoodAssets, '');
    setSetting(SettingsKey.MoodCover, '');
  });

  it('writes the package, manifest, preview and cover; republish rewrites', async () => {
    addAsset({ fingerprint: 'cov', name: 'cover.jpg', type: 'image/jpeg', size: 3 });
    setSetting(SettingsKey.MoodCover, 'cov');
    const pkg = captureCurrentMood({ name: 'Sea Glass', author: 'tester' });
    expect(moodSummary(pkg).cover).toBe('cover.jpg');
    expect(moodPreviewHtml(pkg)).toContain('src="cover.jpg"');

    const f = fakeServices();
    const blobs = new Map([['cov', new Uint8Array([1, 2, 3])]]);
    let publishedArtifacts = 0;
    const deps = {
      services: async () => f.services,
      readBlob: async (fp: string) => {
        const b = blobs.get(fp);
        if (!b) throw new Error('missing ' + fp);
        return b;
      },
      publish: async (crux: Crux, arts: unknown[]) => {
        publishedArtifacts = arts.length;
        return crux;
      },
      now: () => '2026-09-03T00:00:00.000Z',
    };
    const out = await publishMood(pkg, deps);
    expect(out.publishedCruxId).toBe('crux-1');
    expect(out.publishedAt).toBe('2026-09-03T00:00:00.000Z');
    const paths = f.artifacts.map((a) => a.path).sort();
    expect(paths).toEqual(['cover.jpg', 'index.html', 'mood.cruxmood', 'mood.json']);
    expect(publishedArtifacts).toBe(4);
    const crux = f.cruxes.get('crux-1')!;
    expect(crux.kind).toBe('mood');
    expect(crux.discoverable).toBe(true);
    expect((crux.meta as { mood: { cover: string } }).mood.cover).toBe('cover.jpg');
    expect(getInstalledMoods()[0]?.publishedCruxId).toBe('crux-1');

    // republish: same crux, files replaced, still four
    await publishMood(out, deps);
    expect(f.cruxes.size).toBe(1);
    expect(f.artifacts.filter((a) => a.resourceId === 'crux-1')).toHaveLength(4);
  });

  it('installs from a published package (published file first, API fallback)', async () => {
    const pkg = captureCurrentMood({ name: 'Remote Mood' });
    const zip = await exportMoodPackage(pkg, async () => new Uint8Array());
    const putBlob = async () => 'fp';
    // published file path
    const viaFile = await installMoodFromPublished(
      { id: 'c9', slug: 'remote', author_username: 'ann' },
      {
        publishBaseUrl: (id) => `https://${id}.publish.example`,
        fetchBlob: async (url) => (url.endsWith('/mood.cruxmood') ? zip : null),
        apiArtifacts: async () => [],
        apiDownload: async () => zip,
        putBlob,
      },
    );
    expect(viaFile?.name).toBe('Remote Mood');
    expect(viaFile?.publishedCruxId).toBe('c9');
    // API fallback
    const viaApi = await installMoodFromPublished(
      { id: 'c10', slug: 'remote2', author_username: 'ann' },
      {
        publishBaseUrl: () => 'https://nowhere',
        fetchBlob: async () => null,
        apiArtifacts: async () => [{ id: 'art1', meta: { path: 'mood.cruxmood' } }],
        apiDownload: async () => zip,
        putBlob,
      },
    );
    expect(viaApi?.publishedCruxId).toBe('c10');
    expect(getInstalledMoods()).toHaveLength(1); // same package id → replaced, not duplicated
  });
});
