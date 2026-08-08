import { describe, it, expect, vi } from 'vitest';
import {
  publishPipeline,
  unpublishPipeline,
  buildFingerprintMap,
  hasContentChanged,
  describePublishFailure,
  type PublishDeps,
  type PublishFile,
  type PublishPhase,
} from './publish';
import type { Crux, Artifact } from '@/api/types';

function makeCrux(overrides: Partial<Crux> = {}): Crux {
  return {
    id: 'crux-1',
    slug: 'test-crux',
    title: 'Test Crux',
    type: 'workspace',
    visibility: 'private',
    discoverable: false,
    meta: { localOnly: 'keep-me' },
    ...overrides,
  } as Crux;
}

function makeArtifact(
  path: string,
  fingerprint: string,
  overrides: Partial<Artifact> = {},
): Artifact {
  return {
    id: `art-${path}`,
    type: 'artifact',
    filename: path.split('/').pop() || path,
    mimeType: 'text/html',
    fingerprint,
    meta: { path },
    ...overrides,
  } as Artifact;
}

interface FakeState {
  apiCruxExists: boolean;
  created: Record<string, unknown>[];
  updated: Record<string, unknown>[];
  publishedFiles: PublishFile[] | null;
  localMetaWrites: Record<string, unknown>[];
  syncedTags: string[][];
  unpublished: string[];
  built: boolean;
}

function makeDeps(opts: {
  exists?: boolean;
  existsThrows?: boolean;
  isSite?: boolean;
  apiPublishMeta?: Record<string, unknown>;
  failTags?: boolean;
  failBlob?: string;
}): { deps: PublishDeps; state: FakeState } {
  const state: FakeState = {
    apiCruxExists: opts.exists ?? false,
    created: [],
    updated: [],
    publishedFiles: null,
    localMetaWrites: [],
    syncedTags: [],
    unpublished: [],
    built: false,
  };
  const deps: PublishDeps = {
    api: {
      exists: async () => {
        if (opts.existsThrows) throw new Error('network down');
        return state.apiCruxExists;
      },
      create: async (input) => {
        state.created.push(input);
        return makeCrux(input as Partial<Crux>);
      },
      update: async (_id, input) => {
        state.updated.push(input);
        return makeCrux(input as Partial<Crux>);
      },
      publish: async (id, files) => {
        state.publishedFiles = files;
        return makeCrux({
          id,
          visibility: 'public',
          meta: {
            publishedAt: '2026-07-31T00:00:00Z',
            publishedVersion: 3,
            ...opts.apiPublishMeta,
          },
        });
      },
      unpublish: async (id) => {
        state.unpublished.push(id);
        return makeCrux({ id });
      },
      syncTags: async (_id, tags) => {
        if (opts.failTags) throw new Error('tags endpoint down');
        state.syncedTags.push(tags);
        return {};
      },
    },
    local: {
      updateCruxMeta: async (_id, meta) => {
        state.localMetaWrites.push(meta);
        return {};
      },
      downloadBlob: async (artifactId) => {
        if (opts.failBlob && artifactId === opts.failBlob) {
          throw new Error('blob missing from store');
        }
        return new Blob([`content-of-${artifactId}`], { type: 'text/html' });
      },
    },
    site: {
      isSiteCrux: () => opts.isSite ?? false,
      buildForPublish: async () => {
        state.built = true;
        return [
          {
            blob: new Blob(['<html>built</html>']),
            path: 'index.html',
            type: 'artifact',
            kind: 'file',
            mimeType: 'text/html',
          },
        ];
      },
    },
  };
  return { deps, state };
}

describe('publishPipeline', () => {
  it('creates the crux on the API when it does not exist yet', async () => {
    const { deps, state } = makeDeps({ exists: false });
    await publishPipeline(makeCrux(), [makeArtifact('index.html', 'fp1')], { deps });
    expect(state.created).toHaveLength(1);
    expect(state.updated).toHaveLength(0);
    expect(state.created[0]!.id).toBe('crux-1');
  });

  it('updates the crux on the API when it already exists', async () => {
    const { deps, state } = makeDeps({ exists: true });
    await publishPipeline(makeCrux(), [makeArtifact('index.html', 'fp1')], { deps });
    expect(state.updated).toHaveLength(1);
    expect(state.created).toHaveLength(0);
  });

  it('aborts instead of creating when the existence check fails', async () => {
    // The API's create hard-deletes any same-slug record, so treating a
    // transient error as "not published" would destroy the live crux.
    const { deps, state } = makeDeps({ exists: true, existsThrows: true });
    await expect(
      publishPipeline(makeCrux(), [makeArtifact('index.html', 'fp1')], { deps }),
    ).rejects.toThrow('network down');
    expect(state.created).toHaveLength(0);
    expect(state.updated).toHaveLength(0);
    expect(state.publishedFiles).toBeNull();
  });

  it('fails the publish when an artifact blob cannot be read', async () => {
    const artifacts = [makeArtifact('index.html', 'fp1'), makeArtifact('app.js', 'fp2')];
    const { deps, state } = makeDeps({ exists: true, failBlob: 'art-app.js' });
    await expect(publishPipeline(makeCrux(), artifacts, { deps })).rejects.toThrow(
      /nothing was published/,
    );
    // Nothing uploaded, and no fingerprints recorded for a site that never shipped
    expect(state.publishedFiles).toBeNull();
    expect(state.localMetaWrites).toHaveLength(0);
  });

  it('never publishes or fingerprints internal files (preview.jpg, .keep)', async () => {
    const artifacts = [
      makeArtifact('index.html', 'fp1'),
      makeArtifact('preview.jpg', 'thumb-v1', { mimeType: 'image/jpeg' }),
      makeArtifact('assets/.keep', 'keep-fp'),
    ];
    const { deps, state } = makeDeps({ exists: true });
    const updated = await publishPipeline(makeCrux(), artifacts, { deps });

    const paths = state.publishedFiles!.map((f) => f.path);
    expect(paths).toEqual(['index.html']);

    const fingerprints = (updated.meta as { publishedFingerprints: Record<string, string> })
      .publishedFingerprints;
    expect(Object.keys(fingerprints)).toEqual(['index.html']);
  });

  it('a re-captured thumbnail alone does not count as an unpublished change', async () => {
    // preview.jpg bytes change on every capture; counting it would leave every
    // previewed crux permanently "changed".
    const before = buildFingerprintMap([
      makeArtifact('index.html', 'fp1'),
      makeArtifact('preview.jpg', 'thumb-v1', { mimeType: 'image/jpeg' }),
    ]);
    const after = [
      makeArtifact('index.html', 'fp1'),
      makeArtifact('preview.jpg', 'thumb-v2', { mimeType: 'image/jpeg' }),
    ];
    expect(hasContentChanged(after, before)).toBe(false);
  });

  it('publishes working artifacts as-is for plain cruxes', async () => {
    const { deps, state } = makeDeps({ exists: true });
    const artifacts = [
      makeArtifact('index.html', 'fp1'),
      makeArtifact('style.css', 'fp2'),
      makeArtifact('old-version', 'fp3', { type: 'version' }),
    ];
    await publishPipeline(makeCrux(), artifacts, { deps });
    expect(state.built).toBe(false);
    expect(state.publishedFiles!.map((f) => f.path)).toEqual(['index.html', 'style.css']);
  });

  it('builds and ships dist output for Site Cruxes', async () => {
    const { deps, state } = makeDeps({ exists: true, isSite: true });
    await publishPipeline(makeCrux(), [makeArtifact('astro.config.mjs', 'fp1')], { deps });
    expect(state.built).toBe(true);
    expect(state.publishedFiles!.map((f) => f.path)).toEqual(['index.html']);
  });

  it('merges API publish meta over local meta, keeps local-only fields, snapshots fingerprints, and persists', async () => {
    const { deps, state } = makeDeps({ exists: true });
    const artifacts = [makeArtifact('index.html', 'fp1'), makeArtifact('a.css', 'fp2')];
    const result = await publishPipeline(makeCrux(), artifacts, { deps });

    const meta = result.meta as Record<string, unknown>;
    expect(meta.localOnly).toBe('keep-me');
    expect(meta.publishedAt).toBe('2026-07-31T00:00:00Z');
    expect(meta.publishedFingerprints).toEqual({ 'index.html': 'fp1', 'a.css': 'fp2' });
    // Persisted locally, not just returned
    expect(state.localMetaWrites).toHaveLength(1);
    expect((state.localMetaWrites[0] as Record<string, unknown>).publishedFingerprints).toEqual({
      'index.html': 'fp1',
      'a.css': 'fp2',
    });
  });

  it('syncs tags when discoverable, clears them when not, and survives tag failure', async () => {
    const { deps: d1, state: s1 } = makeDeps({ exists: true });
    await publishPipeline(
      makeCrux({ discoverable: true, meta: { tags: ['garden', 'blog'] } }),
      [],
      { deps: d1 },
    );
    expect(s1.syncedTags).toEqual([['garden', 'blog']]);

    const { deps: d2, state: s2 } = makeDeps({ exists: true });
    await publishPipeline(makeCrux({ discoverable: false }), [], { deps: d2 });
    expect(s2.syncedTags).toEqual([[]]);

    const { deps: d3 } = makeDeps({ exists: true, failTags: true });
    await expect(
      publishPipeline(makeCrux({ discoverable: true }), [], { deps: d3 }),
    ).resolves.toBeDefined();
  });

  it('reports phases in order', async () => {
    const { deps } = makeDeps({ exists: true, isSite: true });
    const phases: PublishPhase[] = [];
    await publishPipeline(makeCrux(), [], { deps, onProgress: (p) => phases.push(p) });
    expect(phases).toEqual(['sync', 'build', 'upload', 'finalize', 'tags']);
  });

  it('fails the whole publish when the build fails (nothing half-deploys)', async () => {
    const { deps, state } = makeDeps({ exists: true, isSite: true });
    deps.site.buildForPublish = vi.fn().mockRejectedValue(new Error('astro build failed'));
    await expect(publishPipeline(makeCrux(), [], { deps })).rejects.toThrow('astro build failed');
    expect(state.publishedFiles).toBeNull();
    expect(state.localMetaWrites).toHaveLength(0);
  });
});

describe('unpublishPipeline', () => {
  it('clears publish meta and PERSISTS the cleared meta locally', async () => {
    const { deps, state } = makeDeps({ exists: true });
    const crux = makeCrux({
      visibility: 'public',
      meta: {
        localOnly: 'keep-me',
        publishedAt: 'x',
        publishedVersion: 2,
        publishedFingerprints: { 'a.html': 'fp' },
      },
    });
    const result = await unpublishPipeline(crux, { deps });

    expect(state.unpublished).toEqual(['crux-1']);
    expect(result.visibility).toBe('private');
    const meta = result.meta as Record<string, unknown>;
    expect(meta.localOnly).toBe('keep-me');
    expect(meta.publishedAt).toBeUndefined();
    expect(meta.publishedVersion).toBeUndefined();
    expect(meta.publishedFingerprints).toBeUndefined();
    // The regression this module fixed: cleared meta reaches the local store
    expect(state.localMetaWrites).toHaveLength(1);
    expect((state.localMetaWrites[0] as Record<string, unknown>).publishedAt).toBeUndefined();
  });
});

describe('publish-state helpers', () => {
  it('fingerprint map covers only real artifacts with fingerprints', () => {
    const artifacts = [
      makeArtifact('a.html', 'fp1'),
      makeArtifact('v', 'fp2', { type: 'version' }),
      makeArtifact('b.css', '', { fingerprint: undefined }),
    ];
    expect(buildFingerprintMap(artifacts)).toEqual({ 'a.html': 'fp1' });
  });

  it('hasContentChanged detects adds, removes, edits, and never-published', () => {
    const arts = [makeArtifact('a.html', 'fp1')];
    expect(hasContentChanged(arts, undefined)).toBe(true);
    expect(hasContentChanged(arts, { 'a.html': 'fp1' })).toBe(false);
    expect(hasContentChanged(arts, { 'a.html': 'OLD' })).toBe(true);
    expect(hasContentChanged(arts, { 'a.html': 'fp1', 'b.css': 'fp2' })).toBe(true);
    expect(hasContentChanged([...arts, makeArtifact('c.js', 'fp3')], { 'a.html': 'fp1' })).toBe(
      true,
    );
  });
});

describe('describePublishFailure', () => {
  it('surfaces a site build failure with its log', () => {
    const err = Object.assign(new Error('Build failed — nothing was published'), {
      name: 'SiteBuildError',
      log: 'src/pages/index.astro:12 Unexpected token',
    });
    expect(describePublishFailure(err)).toEqual({
      message: 'Build failed — nothing was published',
      log: 'src/pages/index.astro:12 Unexpected token',
    });
  });

  it('translates an expired connection into something to do about it', () => {
    const result = describePublishFailure({ response: { status: 401 } });
    expect(result.message).toMatch(/reconnect/i);
    expect(result.log).toBeUndefined();
  });

  it('repeats what the server said about a rejected payload', () => {
    // The shape a NestJS ValidationPipe 400 actually arrives in.
    const result = describePublishFailure({
      response: { status: 400, data: { message: ['data should not be empty'] } },
    });
    expect(result.message).toBe('data should not be empty');
  });

  it('names the status when the server said nothing useful', () => {
    expect(describePublishFailure({ response: { status: 502 } }).message).toContain('502');
  });

  it('falls back to the error message, then to a generic line', () => {
    expect(describePublishFailure(new Error('offline')).message).toBe('offline');
    expect(describePublishFailure(undefined).message).toBe('Publishing failed.');
  });
});
