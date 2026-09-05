import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  walkSnapshotChain,
  collectChainMessages,
  detectPreviewArtifact,
  createSnapshotCore,
  createSnapshotIfChanged,
  workspaceUnchangedSinceTip,
  resolveSnapshotRef,
  diffArtifactSets,
  diffIsEmpty,
  registerGrowthHost,
  registeredGrowthHost,
  growthHostFor,
  workspaceGrowthHost,
  UnknownSnapshotError,
  SnapshotPolicy,
  type SnapshotChainNode,
  type GrowthDeps,
  type GrowthHost,
  type WorkspaceGrowthActions,
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
    const lookup = mapLookup([
      node('c', 'b', ['3']),
      node('b', 'a', ['2']),
      node('a', null, ['1']),
    ]);
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
    expect(
      detectPreviewArtifact([art('app.js', { mimeType: 'application/javascript' })])!.type,
    ).toBe('code');
    expect(detectPreviewArtifact([art('notes.txt')])!.type).toBe('text');
  });

  it('never picks the generated agent guide or .keep markers as the face of a snapshot', () => {
    expect(
      detectPreviewArtifact([art('AGENTS.md'), art('CLAUDE.md'), art('img/.keep')]),
    ).toBeNull();
    expect(
      detectPreviewArtifact([art('AGENTS.md'), art('CLAUDE.md'), art('hello.txt')])!.path,
    ).toBe('hello.txt');
  });
});

function makeGrowthDeps(snapshotArtifacts: Artifact[]): {
  deps: GrowthDeps;
  created: {
    cruxes: Record<string, unknown>[];
    dimensions: Record<string, unknown>[];
    cruxUpdates: { id: string; input: Record<string, unknown> }[];
  };
} {
  const created = {
    cruxes: [] as Record<string, unknown>[],
    dimensions: [] as Record<string, unknown>[],
    cruxUpdates: [] as { id: string; input: Record<string, unknown> }[],
  };
  const deps: GrowthDeps = {
    crux: {
      create: async (input) => {
        created.cruxes.push(input);
        return { id: 'snap-crux-1', ...input } as unknown as Crux;
      },
      findById: async (id) => ({ id, meta: {} }) as Crux,
      update: async (id, input) => {
        created.cruxUpdates.push({ id, input });
        return {};
      },
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
    const growths = [
      { id: 'g0', targetId: 'snap-0', meta: { summary: 'earlier work' } } as unknown as Dimension,
    ];
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
      crux: {
        id: 'crux-1',
        title: 'T',
        meta: { settings: { activeBranch: 'branch-snap' } },
      } as unknown as Crux,
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

// ── Growth as an API (B0) ───────────────────────────────────────────────────

describe('createSnapshotCore attribution', () => {
  it('stamps requestedBy on the growth dimension when given, and not otherwise', async () => {
    const { deps, created } = makeGrowthDeps([]);
    const state = {
      crux: { id: 'crux-1', title: 'T', meta: {} } as Crux,
      messages: [] as ChatMessage[],
      messageSegmentStart: 0,
      growths: [] as Dimension[],
      growthCount: 0,
      artifactCount: 0,
    };
    await createSnapshotCore(state, { requestedBy: 'agent:codex' }, deps);
    await createSnapshotCore(state, {}, deps);
    const metas = created.dimensions.map((d) => d.meta as Record<string, unknown>);
    expect(metas[0]!.requestedBy).toBe('agent:codex');
    expect(metas[1]!.requestedBy).toBeUndefined();
  });
});

function growth(id: string, weight: number, targetId = `snap-${id}`): Dimension {
  return { id: `g-${id}`, targetId, weight, created: `2026-01-0${weight}` } as unknown as Dimension;
}

describe('resolveSnapshotRef', () => {
  const growths = [growth('c', 3), growth('a', 1), growth('b', 2)]; // unsorted on purpose

  it('resolves snapshot crux ids, growth ids, "#N" and "latest"', () => {
    expect(resolveSnapshotRef(growths, 'snap-b')?.id).toBe('g-b');
    expect(resolveSnapshotRef(growths, 'g-c')?.id).toBe('g-c');
    expect(resolveSnapshotRef(growths, '#1')?.id).toBe('g-a');
    expect(resolveSnapshotRef(growths, ' 2 ')?.id).toBe('g-b');
    expect(resolveSnapshotRef(growths, 'latest')?.id).toBe('g-c');
  });

  it('returns null for anything else', () => {
    expect(resolveSnapshotRef(growths, '#9')).toBeNull();
    expect(resolveSnapshotRef(growths, '#0')).toBeNull();
    expect(resolveSnapshotRef(growths, 'nope')).toBeNull();
    expect(resolveSnapshotRef(growths, '')).toBeNull();
    expect(resolveSnapshotRef([], 'latest')).toBeNull();
  });
});

describe('diffArtifactSets', () => {
  const fp = (path: string, fingerprint: string, size: number) =>
    art(path, { fingerprint, size } as Partial<Artifact>);

  it('classifies by path and fingerprint, ignoring app-state files', () => {
    const from = [
      fp('index.html', 'aaa', 10),
      fp('old.css', 'bbb', 5),
      fp('same.js', 'ccc', 7),
      fp('preview.jpg', 'x1', 900),
      fp('img/.keep', 'k', 0),
    ];
    const to = [
      fp('index.html', 'aa2', 12),
      fp('same.js', 'ccc', 7),
      fp('new.md', 'ddd', 3),
      fp('preview.jpg', 'x2', 950),
    ];
    const d = diffArtifactSets(from, to);
    expect(d.added).toEqual([{ path: 'new.md', size: 3 }]);
    expect(d.removed).toEqual([{ path: 'old.css', size: 5 }]);
    expect(d.modified).toEqual([{ path: 'index.html', size: 12, previousSize: 10 }]);
    expect(diffIsEmpty(d)).toBe(false);
    expect(diffIsEmpty(diffArtifactSets(to, to))).toBe(true);
  });

  it('skips non-artifact rows (versions) on both sides', () => {
    const v = art('v.html', { type: 'version', fingerprint: 'v' } as Partial<Artifact>);
    expect(diffIsEmpty(diffArtifactSets([v], []))).toBe(true);
  });
});

describe('workspaceUnchangedSinceTip / createSnapshotIfChanged', () => {
  function depsWith(tipFingerprint: string | undefined, workingFingerprint: string) {
    const { deps, created } = makeGrowthDeps([]);
    deps.crux.findById = async (id) =>
      ({ id, meta: tipFingerprint ? { fingerprint: tipFingerprint } : {} }) as unknown as Crux;
    deps.artifact.computeSnapshotFingerprint = async () => workingFingerprint;
    return { deps, created };
  }
  const crux = (activeBranch?: string) =>
    ({ id: 'crux-1', meta: activeBranch ? { settings: { activeBranch } } : {} }) as unknown as Crux;
  const state = (growths: Dimension[]) => ({
    crux: crux(),
    messages: [] as ChatMessage[],
    messageSegmentStart: 0,
    growths,
    growthCount: growths.length,
    artifactCount: 1,
  });

  it('is unchanged only when the tip fingerprint equals the working fingerprint', async () => {
    const growths = [growth('a', 1)];
    expect(await workspaceUnchangedSinceTip(crux(), growths, depsWith('same', 'same').deps)).toBe(
      true,
    );
    expect(await workspaceUnchangedSinceTip(crux(), growths, depsWith('old', 'new').deps)).toBe(
      false,
    );
    // Legacy snapshot without a fingerprint, or no snapshots at all → not provably unchanged
    expect(await workspaceUnchangedSinceTip(crux(), growths, depsWith(undefined, 'x').deps)).toBe(
      false,
    );
    expect(await workspaceUnchangedSinceTip(crux(), [], depsWith('x', 'x').deps)).toBe(false);
  });

  it('compares against the active branch tip when one is set', async () => {
    const { deps } = makeGrowthDeps([]);
    deps.crux.findById = async (id) =>
      ({ id, meta: { fingerprint: id === 'branch-tip' ? 'W' : 'other' } }) as unknown as Crux;
    deps.artifact.computeSnapshotFingerprint = async () => 'W';
    expect(await workspaceUnchangedSinceTip(crux('branch-tip'), [growth('a', 1)], deps)).toBe(true);
  });

  it('createSnapshotIfChanged skips (null) when unchanged and snapshots otherwise', async () => {
    const same = depsWith('same', 'same');
    expect(await createSnapshotIfChanged(state([growth('a', 1)]), {}, same.deps)).toBeNull();
    expect(same.created.dimensions).toHaveLength(0);

    const changed = depsWith('old', 'new');
    expect(await createSnapshotIfChanged(state([growth('a', 1)]), {}, changed.deps)).not.toBeNull();
    expect(changed.created.dimensions).toHaveLength(1);
  });
});

describe('growth host registry', () => {
  it('returns the registered host for a crux and unregisters cleanly', async () => {
    const host = {} as GrowthHost;
    const off = registerGrowthHost('crux-x', host);
    expect(registeredGrowthHost('crux-x')).toBe(host);
    expect(await growthHostFor('crux-x')).toBe(host);
    off();
    expect(registeredGrowthHost('crux-x')).toBeNull();
  });

  it('a stale unregister does not remove a newer registration', () => {
    const first = {} as GrowthHost;
    const second = {} as GrowthHost;
    const offFirst = registerGrowthHost('crux-y', first);
    registerGrowthHost('crux-y', second);
    offFirst();
    expect(registeredGrowthHost('crux-y')).toBe(second);
    registerGrowthHost('crux-y', second)();
  });
});

describe('workspaceGrowthHost (over the store actions)', () => {
  function fakeWorkspace() {
    let growths: Dimension[] = [];
    let files: Artifact[] = [
      art('index.html', { fingerprint: 'v1', size: 2 } as Partial<Artifact>),
    ];
    const calls: string[] = [];
    let n = 0;
    const addGrowth = (label?: string) => {
      n++;
      growths = [
        ...growths,
        {
          id: `g${n}`,
          targetId: `s${n}`,
          weight: n,
          created: `t${n}`,
          meta: label ? { label } : {},
        } as unknown as Dimension,
      ];
    };
    const actions: WorkspaceGrowthActions = {
      cruxId: 'crux-1',
      getCrux: () => ({ id: 'crux-1', meta: {} }) as Crux,
      getGrowths: () => growths,
      createSnapshot: async (o) => {
        calls.push(`snapshot:${o.label ?? ''}:${o.requestedBy ?? ''}`);
        addGrowth(o.label);
      },
      revertToSnapshot: async (id) => {
        calls.push(`revert:${id}`);
        addGrowth('Before revert'); // the store's own safety snapshot
        files = [art('index.html', { fingerprint: 'v0', size: 1 } as Partial<Artifact>)];
      },
      branchFromSnapshot: async (id, label) => {
        calls.push(`branch:${id}:${label}`);
        addGrowth('Before branch');
        files = [];
      },
    };
    const deps = {
      crux: {
        create: async () => ({}) as Crux,
        update: async () => ({}),
        findById: async (id: string) =>
          ({ id, meta: { parentCruxId: null, fingerprint: `fp-${id}` } }) as unknown as Crux,
      },
      artifact: {
        computeSnapshotFingerprint: async () => 'x',
        cloneArtifactsToSnapshot: async () => {},
        findByResource: async (_t: string, id: string) =>
          id === 'crux-1'
            ? files
            : [art('index.html', { fingerprint: `fp-${id}` } as Partial<Artifact>)],
      },
      dimension: {
        create: async () => ({}) as Dimension,
        update: async () => ({}),
        findBySourceAndType: async () => growths,
      },
    };
    return { actions, deps, calls };
  }

  it('snapshot goes through the store action and returns the new growth with attribution', async () => {
    const { actions, deps, calls } = fakeWorkspace();
    const host = workspaceGrowthHost(actions, deps);
    const info = await host.snapshot({ label: 'Mark', requestedBy: 'collaborator' });
    expect(calls).toEqual(['snapshot:Mark:collaborator']);
    expect(info).toMatchObject({ id: 's1', growthId: 'g1', number: 1, label: 'Mark' });
    expect((await host.list()).map((s) => s.number)).toEqual([1]);
  });

  it('restore uses the store revert, reports its safety snapshot and the file changes', async () => {
    const { actions, deps, calls } = fakeWorkspace();
    const host = workspaceGrowthHost(actions, deps);
    await host.snapshot({ label: 'good', requestedBy: 'collaborator' });
    const report = await host.restore('#1', { requestedBy: 'collaborator' });
    expect(calls[1]).toBe('revert:s1');
    expect(report.target).toMatchObject({ id: 's1', label: 'good' });
    expect(report.safety).toMatchObject({ id: 's2', label: 'Before revert', number: 2 });
    expect(report.changes.modified).toEqual([{ path: 'index.html', size: 1, previousSize: 2 }]);
  });

  it('branch and diff resolve references the same way; unknown ids are refused before any action', async () => {
    const { actions, deps, calls } = fakeWorkspace();
    const host = workspaceGrowthHost(actions, deps);
    await host.snapshot({ requestedBy: 'collaborator' });
    await expect(host.restore('zzz', { requestedBy: 'collaborator' })).rejects.toBeInstanceOf(
      UnknownSnapshotError,
    );
    expect(calls).toHaveLength(1);
    const report = await host.branch('latest', 'Alt', { requestedBy: 'collaborator' });
    expect(calls[1]).toBe('branch:s1:Alt');
    expect(report.safety?.label).toBe('Before branch');
    expect(report.changes.removed.map((f) => f.path)).toEqual(['index.html']);
    // diff: snapshot vs working (files now empty)
    const d = await host.diff('s1');
    expect(d.removed.map((f) => f.path)).toEqual(['index.html']);
  });
});
