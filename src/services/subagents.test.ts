import { describe, it, expect } from 'vitest';
import type { Artifact } from '@/api/types';
import type { ConversationEvent } from '@/ai/engine';
import {
  partitionChanges,
  chosenApplies,
  conflictsDecided,
  withConflictChoice,
  runSubagents,
  newSubagentRun,
  describeMerge,
  subagentSummary,
  taskPrompt,
  mergeLabel,
  MAX_CONCURRENCY,
  type SubagentTask,
  type SubagentRun,
  type MergeState,
} from './subagents';

const art = (path: string, fingerprint: string, extra: Partial<Artifact> = {}): Artifact =>
  ({
    id: `${path}:${fingerprint}`,
    type: 'artifact',
    kind: 'file',
    filename: path.split('/').pop()!,
    meta: { path },
    mimeType: 'text/plain',
    encoding: 'utf-8',
    size: 10,
    fingerprint,
    resourceId: 'x',
    resourceType: 'crux',
    homeId: 'h',
    created: '',
    updated: '',
    ...extra,
  }) as Artifact;

const BASE = [art('index.md', 'i0'), art('notes.md', 'n0'), art('AGENTS.md', 'g0')];

describe('partitionChanges (merge rules)', () => {
  it('applies files touched by exactly one branch; two different versions conflict', () => {
    const a = [...BASE, art('alpha.md', 'a1'), art('notes.md', 'nA')].filter(
      (x) => x.fingerprint !== 'n0',
    );
    const b = [...BASE, art('beta.md', 'b1'), art('notes.md', 'nB')].filter(
      (x) => x.fingerprint !== 'n0',
    );
    const p = partitionChanges(BASE, [
      { branch: 0, artifacts: a },
      { branch: 1, artifacts: b },
    ]);
    expect(p.unique).toEqual([
      { path: 'alpha.md', branch: 0, kind: 'added' },
      { path: 'beta.md', branch: 1, kind: 'added' },
    ]);
    expect(p.conflicts).toEqual([
      {
        path: 'notes.md',
        options: [
          { branch: 0, kind: 'modified' },
          { branch: 1, kind: 'modified' },
        ],
      },
    ]);
  });

  it('is not a conflict when two branches made the identical change', () => {
    const same = (branch: number) => ({
      branch,
      artifacts: BASE.map((x) => (x.fingerprint === 'n0' ? art('notes.md', 'nSame') : x)),
    });
    const p = partitionChanges(BASE, [same(3), same(5)]);
    expect(p.conflicts).toEqual([]);
    expect(p.unique).toEqual([{ path: 'notes.md', branch: 3, kind: 'modified' }]);
  });

  it('reports removals, and a remove-vs-edit as a conflict', () => {
    const removed = { branch: 0, artifacts: BASE.filter((x) => x.fingerprint !== 'n0') };
    const edited = {
      branch: 1,
      artifacts: BASE.map((x) => (x.fingerprint === 'n0' ? art('notes.md', 'n1') : x)),
    };
    expect(partitionChanges(BASE, [removed]).unique).toEqual([
      { path: 'notes.md', branch: 0, kind: 'removed' },
    ]);
    const p = partitionChanges(BASE, [removed, edited]);
    expect(p.unique).toEqual([]);
    expect(p.conflicts[0]!.options).toEqual([
      { branch: 0, kind: 'removed' },
      { branch: 1, kind: 'modified' },
    ]);
  });

  it('ignores app-managed files (the generated guide, thumbnails, .keep)', () => {
    const noisy = [
      ...BASE.filter((x) => x.fingerprint !== 'g0'),
      art('AGENTS.md', 'g1'),
      art('preview.jpg', 'p1'),
      art('posts/.keep', 'k1'),
    ];
    const p = partitionChanges(BASE, [{ branch: 0, artifacts: noisy }]);
    expect(p.unique).toEqual([]);
    expect(p.conflicts).toEqual([]);
  });

  it('uses the caller’s branch indexes and sorts by path', () => {
    const p = partitionChanges(BASE, [
      { branch: 4, artifacts: [...BASE, art('z.md', 'z')] },
      { branch: 2, artifacts: [...BASE, art('a.md', 'a')] },
    ]);
    expect(p.unique.map((u) => [u.path, u.branch])).toEqual([
      ['a.md', 2],
      ['z.md', 4],
    ]);
  });
});

describe('merge decisions', () => {
  const merge: MergeState = {
    baseId: 'base',
    status: 'pending',
    applied: [],
    conflicts: [
      {
        path: 'notes.md',
        options: [
          { branch: 0, kind: 'modified' },
          { branch: 1, kind: 'modified' },
        ],
      },
      {
        path: 'x.md',
        options: [
          { branch: 0, kind: 'added' },
          { branch: 2, kind: 'removed' },
        ],
      },
    ],
  };

  it('is decided only when every conflict has a choice', () => {
    expect(conflictsDecided(merge.conflicts)).toBe(false);
    const one = withConflictChoice(merge, 'notes.md', 1);
    expect(conflictsDecided(one.conflicts)).toBe(false);
    const both = withConflictChoice(one, 'x.md', 'keep');
    expect(conflictsDecided(both.conflicts)).toBe(true);
  });

  it('plans exactly the chosen branches’ changes; "keep" applies nothing', () => {
    const decided = withConflictChoice(withConflictChoice(merge, 'notes.md', 1), 'x.md', 'keep');
    expect(chosenApplies(decided.conflicts)).toEqual([
      { path: 'notes.md', branch: 1, kind: 'modified' },
    ]);
    const removal = withConflictChoice(decided, 'x.md', 2);
    expect(chosenApplies(removal.conflicts)).toContainEqual({
      path: 'x.md',
      branch: 2,
      kind: 'removed',
    });
    // A choice that is not one of the options is ignored, not applied
    expect(chosenApplies(withConflictChoice(merge, 'notes.md', 9).conflicts)).toEqual([]);
  });

  it('labels the merge snapshot by count', () => {
    expect(mergeLabel(1)).toBe('Merged 1 subagent');
    expect(mergeLabel(3)).toBe('Merged 3 subagents');
  });
});

// ── Runner ──────────────────────────────────────────────────────────────────

const task = (title: string): SubagentTask => ({
  title,
  instructions: `Do ${title}`,
  scope: { paths: [`${title}.md`] },
});

/** A scripted worker: waits, writes one file, ends — and dies on abort. */
function fakeConversation(opts: {
  onStart: () => void;
  onEnd: () => void;
  delayMs: number;
  rounds?: number;
  path: string;
}) {
  return async function* (signal: AbortSignal): AsyncGenerator<ConversationEvent> {
    opts.onStart();
    try {
      for (let r = 0; r < (opts.rounds ?? 1); r++) {
        await new Promise<void>((resolve, reject) => {
          if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
          const t = setTimeout(resolve, opts.delayMs);
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(t);
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true },
          );
        });
        yield { type: 'tool_start', name: 'write_file', id: `t${r}`, input: { path: opts.path } };
        yield {
          type: 'tool_result',
          name: 'write_file',
          id: `t${r}`,
          result: `Created file: ${opts.path}`,
        };
        yield { type: 'step_end', index: r };
      }
      yield { type: 'text', content: 'All done here.' };
      yield { type: 'done', textContent: 'All done here.', hadMutation: true };
    } finally {
      opts.onEnd();
    }
  };
}

describe('runSubagents', () => {
  it('runs at most `concurrency` workers at once and finishes them all', async () => {
    const tasks = Array.from({ length: 7 }, (_, i) => task(`t${i}`));
    let running = 0;
    let peak = 0;
    const runs = await runSubagents(tasks, tasks.map(newSubagentRun), {
      concurrency: 3,
      converse: (t, _i, signal) =>
        fakeConversation({
          onStart: () => {
            running++;
            peak = Math.max(peak, running);
          },
          onEnd: () => {
            running--;
          },
          delayMs: 5,
          path: `${t.title}.md`,
        })(signal),
      update: () => {},
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
    expect(runs.every((r) => r.status === 'done')).toBe(true);
    expect(runs.map((r) => r.files)).toEqual(tasks.map((t) => [`${t.title}.md`]));
    expect(runs.every((r) => r.steps === 1 && r.reply === 'All done here.')).toBe(true);
    expect(runs.every((r) => r.startedAt && r.endedAt)).toBe(true);
  });

  it('caps concurrency at the maximum', async () => {
    const tasks = Array.from({ length: 8 }, (_, i) => task(`t${i}`));
    let running = 0;
    let peak = 0;
    await runSubagents(tasks, tasks.map(newSubagentRun), {
      concurrency: 50,
      converse: (t, _i, signal) =>
        fakeConversation({
          onStart: () => {
            running++;
            peak = Math.max(peak, running);
          },
          onEnd: () => {
            running--;
          },
          delayMs: 5,
          path: `${t.title}.md`,
        })(signal),
      update: () => {},
    });
    expect(peak).toBeLessThanOrEqual(MAX_CONCURRENCY);
  });

  it('propagates Stop: running workers are interrupted, waiting ones never start', async () => {
    const tasks = Array.from({ length: 4 }, (_, i) => task(`t${i}`));
    const parent = new AbortController();
    const started: string[] = [];
    const updates: SubagentRun[][] = [];
    const promise = runSubagents(tasks, tasks.map(newSubagentRun), {
      concurrency: 2,
      signal: parent.signal,
      converse: (t, _i, signal) =>
        fakeConversation({
          onStart: () => started.push(t.title),
          onEnd: () => {},
          delayMs: 10_000,
          path: `${t.title}.md`,
        })(signal),
      update: (runs) => {
        updates.push(runs);
      },
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(started).toEqual(['t0', 't1']);
    parent.abort();
    const runs = await promise;
    expect(runs.map((r) => r.status)).toEqual([
      'interrupted',
      'interrupted',
      'interrupted',
      'interrupted',
    ]);
    expect(started).toEqual(['t0', 't1']); // the pool did not start t2/t3 after the stop
    expect(runs.every((r) => r.files.length === 0)).toBe(true);
    // Every state change was reported, and the runner never mutates a published array
    expect(updates.length).toBeGreaterThan(0);
    expect(updates.at(-1)!.map((r) => r.status)).toEqual(runs.map((r) => r.status));
  });

  it('stops a worker at the step budget and reports it as failed with the reason', async () => {
    const t = task('long');
    const runs = await runSubagents([t], [newSubagentRun(t)], {
      stepBudget: 2,
      converse: (_t, _i, signal) =>
        fakeConversation({
          onStart: () => {},
          onEnd: () => {},
          delayMs: 1,
          rounds: 10,
          path: 'long.md',
        })(signal),
      update: () => {},
    });
    expect(runs[0]!.status).toBe('failed');
    expect(runs[0]!.steps).toBe(2);
    expect(runs[0]!.error).toMatch(/step budget \(2 rounds\)/);
  });

  it('stops a worker at the time budget', async () => {
    const t = task('slow');
    const runs = await runSubagents([t], [newSubagentRun(t)], {
      timeBudgetMs: 30,
      converse: (_t, _i, signal) =>
        fakeConversation({
          onStart: () => {},
          onEnd: () => {},
          delayMs: 5_000,
          path: 'slow.md',
        })(signal),
      update: () => {},
    });
    expect(runs[0]!.status).toBe('failed');
    expect(runs[0]!.error).toMatch(/Ran out of time/);
  });

  it('records an engine error as failed and applies the finish patch', async () => {
    const t = task('bad');
    async function* broken(): AsyncGenerator<ConversationEvent> {
      yield { type: 'error', message: 'provider down' };
    }
    const runs = await runSubagents([t], [newSubagentRun(t)], {
      converse: () => broken(),
      update: () => {},
      finish: async () => ({ files: ['from-diff.md'] }),
    });
    expect(runs[0]!.status).toBe('failed');
    expect(runs[0]!.error).toBe('The worker hit an error');
    expect(runs[0]!.files).toEqual(['from-diff.md']);
  });

  it('does not start when the parent is already stopped', async () => {
    const parent = new AbortController();
    parent.abort();
    let started = false;
    const t = task('never');
    const runs = await runSubagents([t], [newSubagentRun(t)], {
      signal: parent.signal,
      converse: (_t, _i, signal) =>
        fakeConversation({
          onStart: () => {
            started = true;
          },
          onEnd: () => {},
          delayMs: 1,
          path: 'never.md',
        })(signal),
      update: () => {},
    });
    expect(started).toBe(false);
    expect(runs[0]!.status).toBe('interrupted');
  });
});

describe('words', () => {
  const runs: SubagentRun[] = [
    { title: 'Alpha', status: 'done', scope: {}, steps: 2, files: ['alpha.md', 'notes.md'] },
    { title: 'Beta', status: 'interrupted', scope: {}, steps: 1, files: [] },
  ];

  it('describes the merge for the model: what applied, what needs the person', () => {
    const text = describeMerge(runs, {
      baseId: 'b',
      status: 'pending',
      applied: [{ path: 'alpha.md', branch: 0, kind: 'added' }],
      conflicts: [
        {
          path: 'notes.md',
          options: [
            { branch: 0, kind: 'modified' },
            { branch: 1, kind: 'modified' },
          ],
        },
      ],
    });
    expect(text).toContain('2 workers ran in parallel: 1 finished, 1 did not (Beta: interrupted).');
    expect(text).toContain('Merged 1 file onto the main line: alpha.md (added, from Alpha).');
    expect(text).toContain('1 file needs a decision');
    expect(text).toContain('notes.md (Alpha vs Beta)');
    expect(text).toContain('do not write those files now');
    expect(text).not.toContain('Snapshot "Merged');
  });

  it('says so when nothing merged', () => {
    expect(describeMerge(runs, null)).toContain('Nothing was merged');
  });

  it('gives each worker one compact line for the Collaboration', () => {
    expect(subagentSummary(runs[0]!)).toBe('Changed 2 files: alpha.md, notes.md.');
    expect(subagentSummary(runs[1]!)).toBe('Stopped before finishing.');
    expect(subagentSummary({ ...runs[0]!, reply: 'Captions added.' })).toContain(
      '\n\nCaptions added.',
    );
  });

  it('briefs the worker with its title, instructions and scope', () => {
    const p = taskPrompt({
      title: 'Alpha',
      instructions: 'Write it.',
      scope: { paths: ['a.md'], folder: 'posts' },
    });
    expect(p.startsWith('[Subagent] Alpha\n')).toBe(true);
    expect(p).toContain('Write it.');
    expect(p).toContain('the folder posts/ and the file a.md');
  });
});
