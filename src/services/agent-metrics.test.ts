import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConversationEvent } from '@/ai/engine';
import {
  classifyToolResult,
  logEntry,
  toolsAcross,
  emptyHistogram,
  observe,
  mean,
  quantile,
  emptyMetrics,
  foldTurn,
  meterTurn,
  report,
  unknownTargetRate,
  failureCount,
  type TurnRecord,
} from './agent-metrics';

describe('classifyToolResult', () => {
  it('reads a plain result as ok', () => {
    expect(classifyToolResult('{"layers":3}')).toBe('ok');
    expect(classifyToolResult('Wrote index.html')).toBe('ok');
  });

  it('reads a non-string result (an image) as ok', () => {
    expect(classifyToolResult({ type: 'image' })).toBe('ok');
  });

  it('separates a declined delete from a failure', () => {
    expect(classifyToolResult('The user DECLINED the deletion of notes.md')).toBe('declined');
  });

  it('names the model guessing at something that does not exist', () => {
    expect(classifyToolResult('Error: File not found: src/app.ts. Use list_files to see')).toBe(
      'unknown-target',
    );
    expect(classifyToolResult('Error in edit_gdevelop_properties: No such object "Playerr".')).toBe(
      'unknown-target',
    );
    expect(classifyToolResult('Error in update_minipaint_layer: unknown layer id 9.')).toBe(
      'unknown-target',
    );
  });

  it('separates a lost race from a wrong argument', () => {
    expect(
      classifyToolResult('Error in edit_gdevelop_animation: expectedState mismatch; re-inspect.'),
    ).toBe('stale-state');
  });

  it('recognises the ordering and scope refusals', () => {
    expect(classifyToolResult('Error: You must call read_file on "a.md" before editing it.')).toBe(
      'precondition',
    );
    expect(classifyToolResult("Error: path is outside this task's scope.")).toBe('scope');
  });

  it('recognises malformed input and an unavailable tool', () => {
    expect(
      classifyToolResult('Error in search_files: query is required and must be a string.'),
    ).toBe('invalid-input');
    expect(
      classifyToolResult('Error in piskel_add_frame: Open the app in this Crux’s Workshop first.'),
    ).toBe('unavailable');
  });

  it('falls back to a plain failure', () => {
    expect(classifyToolResult('Error in check_site: the build exited with code 1.')).toBe('failed');
  });
});

describe('histogram', () => {
  it('buckets values and reports mean, quantiles and max', () => {
    const h = emptyHistogram();
    for (const v of [10, 40, 90, 300, 4000, 90000]) observe(h, v);
    expect(h.n).toBe(6);
    expect(mean(h)).toBeCloseTo(94440 / 6);
    expect(h.max).toBe(90000);
    // Three of the six values are <=100ms, so the median bucket's bound is 100.
    expect(quantile(h, 0.5)).toBe(100);
    // The overflow bucket reports the observed max.
    expect(quantile(h, 0.99)).toBe(90000);
  });

  it('ignores impossible durations and stays empty-safe', () => {
    const h = emptyHistogram();
    observe(h, -1);
    observe(h, Number.NaN);
    expect(h.n).toBe(0);
    expect(mean(h)).toBe(0);
    expect(quantile(h, 0.5)).toBe(0);
  });
});

/** Drive a turn through the meter on a clock we control. */
function run(events: [number, ConversationEvent][], endAt: number) {
  let clock = 0;
  const committed: TurnRecord[] = [];
  const meter = meterTurn({
    model: 'claude-sonnet-5',
    now: () => clock,
    commit: (t) => committed.push(t),
  });
  for (const [at, event] of events) {
    clock = at;
    meter.observe(event);
  }
  clock = endAt;
  meter.finish('done');
  return committed[0]!;
}

describe('meterTurn', () => {
  it('times the first token, the whole turn and each tool call', () => {
    const turn = run(
      [
        [120, { type: 'text', content: 'Working' }],
        [130, { type: 'text', content: ' on it' }],
        [200, { type: 'tool_start', name: 'read_file', id: 'a', input: {} }],
        [260, { type: 'tool_result', name: 'read_file', id: 'a', result: 'contents' }],
        [300, { type: 'step_end', index: 0 }],
        [900, { type: 'usage', inputTokens: 5000, outputTokens: 400, cachedInputTokens: 4200 }],
      ],
      1000,
    );
    expect(turn.ttftMs).toBe(120);
    expect(turn.durationMs).toBe(1000);
    expect(turn.steps).toBe(1);
    expect(turn.inputTokens).toBe(5000);
    expect(turn.cachedInputTokens).toBe(4200);
    expect(turn.tools).toEqual([
      { name: 'read_file', outcome: 'ok', durationMs: 60, retry: false },
    ]);
  });

  it('counts a repeat of a tool that just failed as a retry', () => {
    const turn = run(
      [
        [10, { type: 'tool_start', name: 'edit_file', id: 'a', input: {} }],
        [20, { type: 'tool_result', name: 'edit_file', id: 'a', result: 'Error: no such file x' }],
        [30, { type: 'tool_start', name: 'edit_file', id: 'b', input: {} }],
        [40, { type: 'tool_result', name: 'edit_file', id: 'b', result: 'Edited x' }],
        [50, { type: 'tool_start', name: 'edit_file', id: 'c', input: {} }],
        [60, { type: 'tool_result', name: 'edit_file', id: 'c', result: 'Edited x again' }],
      ],
      70,
    );
    expect(turn.tools.map((t) => [t.outcome, t.retry])).toEqual([
      ['unknown-target', false],
      ['ok', true],
      ['ok', false],
    ]);
  });

  it('records a tool result whose start was never seen, without a duration', () => {
    const turn = run([[10, { type: 'tool_result', name: 'snapshot', id: 'z', result: 'ok' }]], 20);
    expect(turn.tools).toEqual([
      { name: 'snapshot', outcome: 'ok', durationMs: undefined, retry: false },
    ]);
  });

  it('leaves time-to-first-token unset when the turn produced no text', () => {
    const turn = run([[10, { type: 'step_end', index: 0 }]], 20);
    expect(turn.ttftMs).toBeUndefined();
  });
});

describe('foldTurn', () => {
  const turn = (over: Partial<TurnRecord> = {}): TurnRecord => ({
    model: 'claude-sonnet-5',
    status: 'done',
    ttftMs: 400,
    durationMs: 3000,
    steps: 2,
    inputTokens: 1000,
    outputTokens: 200,
    cachedInputTokens: 800,
    tools: [],
    ...over,
  });

  it('accumulates turns, tokens and per-tool outcomes', () => {
    const m = emptyMetrics('2026-09-18T00:00:00.000Z');
    foldTurn(
      m,
      turn({ tools: [{ name: 'write_file', outcome: 'ok', durationMs: 30, retry: false }] }),
    );
    foldTurn(
      m,
      turn({
        status: 'interrupted',
        tools: [
          { name: 'write_file', outcome: 'unknown-target', durationMs: 20, retry: false },
          { name: 'write_file', outcome: 'ok', durationMs: 25, retry: true },
        ],
      }),
    );

    expect(m.turns).toBe(2);
    expect(m.turnStatus).toEqual({ done: 1, interrupted: 1 });
    const model = m.models['claude-sonnet-5']!;
    expect(model.turns).toBe(2);
    expect(model.inputTokens).toBe(2000);
    expect(model.cachedInputTokens).toBe(1600);
    const tool = model.tools.write_file!;
    expect(tool.calls).toBe(3);
    expect(tool.retries).toBe(1);
    expect(tool.outcomes).toEqual({ ok: 2, 'unknown-target': 1 });
    expect(failureCount(tool)).toBe(1);
  });

  it('keeps models apart, including which tools each one gets wrong', () => {
    const m = emptyMetrics();
    foldTurn(m, turn({ tools: [{ name: 'edit_file', outcome: 'ok', retry: false }] }));
    foldTurn(
      m,
      turn({
        model: 'claude-haiku-4-5-20251001',
        tools: [
          { name: 'edit_file', outcome: 'unknown-target', retry: false },
          { name: 'edit_file', outcome: 'unknown-target', retry: true },
        ],
      }),
    );
    expect(Object.keys(m.models).sort()).toEqual(['claude-haiku-4-5-20251001', 'claude-sonnet-5']);
    expect(unknownTargetRate(m, 'claude-sonnet-5').rate).toBe(0);
    expect(unknownTargetRate(m, 'claude-haiku-4-5-20251001').rate).toBe(1);
    // …and asking for a model nobody used is zero, not a crash.
    expect(unknownTargetRate(m, 'nope')).toEqual({ calls: 0, unknownTarget: 0, rate: 0 });
    // Summed back up, the two models share one table.
    expect(toolsAcross(m).edit_file!.calls).toBe(3);
    expect(toolsAcross(m).edit_file!.retries).toBe(1);
    expect(toolsAcross(m).edit_file!.outcomes).toEqual({ ok: 1, 'unknown-target': 2 });
  });

  it('measures the share of calls that named something nonexistent', () => {
    const m = emptyMetrics();
    foldTurn(
      m,
      turn({
        tools: [
          { name: 'a', outcome: 'ok', retry: false },
          { name: 'a', outcome: 'unknown-target', retry: false },
          { name: 'b', outcome: 'unknown-target', retry: false },
          { name: 'b', outcome: 'failed', retry: false },
        ],
      }),
    );
    expect(unknownTargetRate(m)).toEqual({ calls: 4, unknownTarget: 2, rate: 0.5 });
  });

  it('reports nothing but the header before any turn ran', () => {
    const m = emptyMetrics('2026-09-18T00:00:00.000Z');
    expect(report(m)).toBe('Agent metrics since 2026-09-18T00:00:00.000Z\n0 turns');
    expect(unknownTargetRate(m).rate).toBe(0);
  });

  it('appends a ruled, timestamped entry to the running log', () => {
    const m = emptyMetrics();
    foldTurn(m, turn());
    const entry = logEntry(m, new Date('2026-09-18T12:00:00.000Z'));
    expect(entry).toContain('2026-09-18T12:00:00.000Z');
    expect(entry).toContain('claude-sonnet-5 — 1 turn');
    expect(entry.endsWith('\n\n')).toBe(true);
    // Two saves stack rather than replace.
    expect((entry + entry).match(/2026-09-18T12:00:00/g)).toHaveLength(2);
  });

  it('reports each model with its own tools, worst first', () => {
    const m = emptyMetrics();
    foldTurn(
      m,
      turn({
        tools: [
          { name: 'read_file', outcome: 'ok', durationMs: 10, retry: false },
          {
            name: 'edit_gdevelop_properties',
            outcome: 'unknown-target',
            durationMs: 90,
            retry: false,
          },
          { name: 'edit_gdevelop_properties', outcome: 'stale-state', durationMs: 90, retry: true },
        ],
      }),
    );
    const text = report(m);
    const lines = text.split('\n');
    const header = lines.findIndex((l) => l.startsWith('claude-sonnet-5 —'));
    expect(header).toBeGreaterThan(-1);
    expect(lines[header]).toBe('claude-sonnet-5 — 1 turn');
    // Speed, then spend, then the tools this model used.
    expect(lines[header + 1]).toContain('ttft p50');
    expect(lines[header + 2]).toContain('cached 800');
    expect(lines[header + 3]).toContain('edit_gdevelop_properties: 2 calls');
    expect(lines[header + 3]).toContain('unknown-target 1');
    expect(lines[header + 3]).toContain('stale-state 1');
    expect(lines[header + 3]).toContain('1 retry,');
    expect(lines[header + 4]).toContain('read_file');
    expect(text).toContain('3 tool calls, 2 failed');
    // One model needs no combined table.
    expect(text).not.toContain('All models');
  });

  it('adds a combined table once more than one model has run', () => {
    const m = emptyMetrics();
    foldTurn(m, turn({ tools: [{ name: 'edit_file', outcome: 'ok', retry: false }] }));
    foldTurn(
      m,
      turn({
        model: 'claude-haiku-4-5-20251001',
        tools: [{ name: 'edit_file', outcome: 'unknown-target', retry: false }],
      }),
    );
    const text = report(m);
    expect(text).toContain('All models');
    expect(text.slice(text.indexOf('All models'))).toContain('edit_file: 2 calls, 1 failed');
  });

  it('says so when a model ran without calling a tool', () => {
    const m = emptyMetrics();
    foldTurn(m, turn());
    expect(report(m)).toContain('no tool calls');
  });
});

describe('persistence', () => {
  beforeEach(() => vi.resetModules());

  it('accumulates across sessions through the settings row and resets clean', async () => {
    const store = new Map<string, string>();
    vi.doMock('./settings', () => ({
      getSetting: (k: string) => store.get(k) ?? null,
      setSetting: (k: string, v: string) => void store.set(k, v),
      removeSetting: (k: string) => void store.delete(k),
    }));
    const m = await import('./agent-metrics');

    m.record({
      model: 'm',
      status: 'done',
      durationMs: 10,
      steps: 1,
      inputTokens: 1,
      outputTokens: 1,
      cachedInputTokens: 0,
      tools: [{ name: 't', outcome: 'unknown-target', retry: false }],
    });
    expect(m.readMetrics().turns).toBe(1);

    // A fresh session reads the persisted counters back.
    m.clearMetricsCache();
    expect(m.readMetrics().turns).toBe(1);
    expect(m.unknownTargetRate().unknownTarget).toBe(1);

    m.resetMetrics();
    expect(m.readMetrics().turns).toBe(0);
    expect(store.size).toBe(0);
  });

  it('records nothing while capture is off, and keeps the counters already gathered', async () => {
    const store = new Map<string, string>();
    vi.doMock('./settings', () => ({
      getSetting: (k: string) => store.get(k) ?? null,
      setSetting: (k: string, v: string) => void store.set(k, v),
      removeSetting: (k: string) => void store.delete(k),
    }));
    const m = await import('./agent-metrics');
    const turn = {
      model: 'm',
      status: 'done' as const,
      durationMs: 10,
      steps: 1,
      inputTokens: 1,
      outputTokens: 1,
      cachedInputTokens: 0,
      tools: [],
    };

    expect(m.isCapturing()).toBe(true);
    m.record(turn);

    m.setCapturing(false);
    expect(m.isCapturing()).toBe(false);
    m.record(turn);
    expect(m.readMetrics().turns).toBe(1);

    m.setCapturing(true);
    m.record(turn);
    expect(m.readMetrics().turns).toBe(2);
  });

  it('starts over rather than throwing on an unreadable row', async () => {
    vi.doMock('./settings', () => ({
      getSetting: () => '{ not json',
      setSetting: () => {},
      removeSetting: () => {},
    }));
    const m = await import('./agent-metrics');
    expect(m.readMetrics().turns).toBe(0);
  });
});
