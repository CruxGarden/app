import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  walkSnapshotChain,
  collectChainMessages,
  detectPreviewArtifact,
  createSnapshotCore,
  SnapshotPolicy,
  type SnapshotChainNode,
  type GrowthDeps,
  type SnapshotFrequency,
} from './growth';
import type { Artifact, ChatMessage, Crux, Dimension } from '@/api/types';

function node(id: string, parent: string | null, msgs: string[]): SnapshotChainNode {
  return {
    id,
    parentCruxId: parent,
    messages: msgs.map((m) => ({ role: 'user', content: m }) as ChatMessage),
  };
}

function mapLookup(nodes: SnapshotChainNode[]) {
  const map = new Map(nodes.map((n) => [n.id, n]));
  return async (id: string) => map.get(id) ?? null;
}

describe('walkSnapshotChain', () => {
  it('returns the chain in chronological order (root first)', async () => {
    const lookup = mapLookup([node('c', 'b', ['3']), node('b', 'a', ['2']), node('a', null, ['1'])]);
    const chain = await walkSnapshotChain('c', lookup);
    expect(chain.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('stops at a missing node instead of failing', async () => {
    const lookup = mapLookup([node('c', 'b', ['3']), node('b', 'deleted', ['2'])]);
    const chain = await walkSnapshotChain('c', lookup);
    expect(chain.map((n) => n.id)).toEqual(['b', 'c']);
  });

  it('is cycle-safe', async () => {
    const lookup = mapLookup([node('a', 'b', ['1']), node('b', 'a', ['2'])]);
    const chain = await walkSnapshotChain('a', lookup);
    expect(chain.map((n) => n.id)).toEqual(['b', 'a']);
  });
});

describe('collectChainMessages', () => {
  it('concatenates segments chronologically including the tip', async () => {
    const lookup = mapLookup([node('b', 'a', ['m3', 'm4']), node('a', null, ['m1', 'm2'])]);
    const messages = await collectChainMessages('b', lookup);
    expect(messages.map((m) => m.content)).toEqual(['m1', 'm2', 'm3', 'm4']);
  });
});

function art(path: string, overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: `art-${path}`,
    type: 'artifact',
    filename: path.split('/').pop() || path,
    mimeType: 'text/plain',
    encoding: 'utf-8',
    meta: { path },
    ...overrides,
  } as Artifact;
}

describe('detectPreviewArtifact', () => {
  it('prefers index.html, then images, then readme, then text', () => {
    expect(detectPreviewArtifact([])).toBeNull();
    expect(
      detectPreviewArtifact([art('a.txt'), art('src/index.html', { mimeType: 'text/html' })])!.type,
    ).toBe('html');
    expect(
      detectPreviewArtifact([art('a.txt'), art('p.png', { mimeType: 'image/png' })])!.type,
    ).toBe('image');
    expect(detectPreviewArtifact([art('a.txt'), art('README.md')])!.type).toBe('markdown');
    expect(detectPreviewArtifact([art('app.js', { mimeType: 'application/javascript' })])!.type).toBe('code');
    expect(detectPreviewArtifact([art('notes.txt')])!.type).toBe('text');
  });
});

function makeGrowthDeps(snapshotArtifacts: Artifact[]): {
  deps: GrowthDeps;
  created: { cruxes: Record<string, unknown>[]; dimensions: Record<string, unknown>[] };
} {
  const created = { cruxes: [] as Record<string, unknown>[], dimensions: [] as Record<string, unknown>[] };
  const deps: GrowthDeps = {
    crux: {
      create: async (input) => {
        created.cruxes.push(input);
        return { id: 'snap-crux-1', ...input } as unknown as Crux;
      },
      findById: async (id) => ({ id, meta: {} }) as Crux,
    },
    artifact: {
      computeSnapshotFingerprint: async () => 'fp-snapshot',
      cloneArtifactsToSnapshot: async () => {},
      findByResource: async () => snapshotArtifacts,
    },
    dimension: {
      create: async (input) => {
        created.dimensions.push(input);
        return { id: 'growth-1', ...input } as unknown as Dimension;
      },
      update: async () => ({}),
    },
  };
  return { deps, created };
}

describe('createSnapshotCore', () => {
  const baseState = (over: Partial<Parameters<typeof createSnapshotCore>[0]> = {}) => ({
    crux: { id: 'crux-1', title: 'My Crux', meta: {} } as Crux,
    messages: ['a', 'b', 'c'].map((c) => ({ role: 'user', content: c }) as ChatMessage),
    messageSegmentStart: 1,
    growths: [] as Dimension[],
    growthCount: 0,
    artifactCount: 2,
    ...over,
  });

  it('stores only the current segment plus cumulative count, and parents on the latest snapshot', async () => {
    const { deps, created } = makeGrowthDeps([art('index.html', { mimeType: 'text/html' })]);
    const growths = [{ id: 'g0', targetId: 'snap-0', meta: { summary: 'earlier work' } } as unknown as Dimension];
    const result = await createSnapshotCore(baseState({ growths }), {}, deps);

    const snapMeta = created.cruxes[0]!.meta as Record<string, unknown>;
    expect((snapMeta.messages as ChatMessage[]).map((m) => m.content)).toEqual(['b', 'c']);
    expect(snapMeta.cumulativeMessageCount).toBe(3);
    expect(snapMeta.parentCruxId).toBe('snap-0');
    expect(result.newSegmentStart).toBe(3);
    expect(result.previousSummary).toBe('earlier work');
  });

  it('prefers activeBranch as parent and records preview + label on the dimension', async () => {
    const { deps, created } = makeGrowthDeps([
      art('index.html', { mimeType: 'text/html' }),
      art('preview.jpg', { mimeType: 'image/jpeg', encoding: 'binary' }),
      art('.keep'),
    ]);
    const state = baseState({
      crux: { id: 'crux-1', title: 'T', meta: { settings: { activeBranch: 'branch-snap' } } } as unknown as Crux,
    });
    const result = await createSnapshotCore(state, { label: 'Milestone' }, deps);

    expect((created.cruxes[0]!.meta as Record<string, unknown>).parentCruxId).toBe('branch-snap');
    const dimMeta = created.dimensions[0]!.meta as Record<string, unknown>;
    expect(dimMeta.label).toBe('Milestone');
    expect((dimMeta.preview as { type: string }).type).toBe('html');
    expect(dimMeta.thumbnailId).toBe('art-preview.jpg');
    expect(result.artifactNames).toEqual(['index.html', 'preview.jpg']); // .keep excluded
  });
});

describe('SnapshotPolicy', () => {
  afterEach(() => vi.useRealTimers());

  it('fires immediately on ai-turn and never on manual', () => {
    const snap = vi.fn();
    let freq: SnapshotFrequency = 'ai-turn';
    const policy = new SnapshotPolicy(() => freq, snap);
    policy.notifyMutation();
    expect(snap).toHaveBeenCalledTimes(1);

    freq = 'manual';
    policy.notifyMutation();
    expect(snap).toHaveBeenCalledTimes(1);
  });

  it('debounces timed frequencies — each mutation resets the timer', () => {
    vi.useFakeTimers();
    const snap = vi.fn();
    const policy = new SnapshotPolicy(() => '2m', snap);
    policy.notifyMutation();
    vi.advanceTimersByTime(60_000);
    policy.notifyMutation(); // reset
    vi.advanceTimersByTime(110_000);
    expect(snap).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(snap).toHaveBeenCalledTimes(1);
    policy.dispose();
  });

  it('re-checks frequency at fire time (switching to manual cancels)', () => {
    vi.useFakeTimers();
    const snap = vi.fn();
    let freq: SnapshotFrequency = '2m';
    const policy = new SnapshotPolicy(() => freq, snap);
    policy.notifyMutation();
    freq = 'manual';
    vi.advanceTimersByTime(120_001);
    expect(snap).not.toHaveBeenCalled();
    policy.dispose();
  });

  it('dispose cancels a pending snapshot', () => {
    vi.useFakeTimers();
    const snap = vi.fn();
    const policy = new SnapshotPolicy(() => '5m', snap);
    policy.notifyMutation();
    policy.dispose();
    vi.advanceTimersByTime(600_000);
    expect(snap).not.toHaveBeenCalled();
  });
});
