/**
 * Agent metrics — what the collaborator actually cost, in time and in wasted
 * work.
 *
 * Every turn already streams the facts through `ConversationEvent`; this
 * module is the meter on that pipe. It answers three questions the app could
 * not answer before:
 *
 *   - **Speed.** Time to first token, whole-turn duration, per-tool latency.
 *   - **Waste.** How many tool calls fail, *why* they fail, and how often the
 *     model burns another round retrying the same tool.
 *   - **Spend.** Input, output and cached-input tokens, per model.
 *
 * The failure classification is the point. A call that fails because the model
 * named an object that does not exist (`unknown-target`) is a different
 * problem from one that fails because the app moved under it (`stale-state`)
 * or because the person said no (`declined`). Only the first is the model
 * guessing, and only the first is fixable by constraining what it may say.
 *
 * Nothing here records content: no paths, no prose, no tool inputs, no error
 * text — only the tool's name, a classification, and numbers. Counters live in
 * one settings row and accumulate across sessions until reset.
 */

import type { ConversationEvent } from '@/ai/engine';
import type { TurnJobStatus } from './turn-jobs';
import { SettingsKey } from '@/lib/constants';
import { getSetting, setSetting, removeSetting } from './settings';

/** Why a tool call ended the way it did. */
export type ToolOutcome =
  /** Returned a result. */
  | 'ok'
  /** The model named something that does not exist — an object, layer, file, property. */
  | 'unknown-target'
  /** A guarded edit lost its race: expectedState/expectedHash no longer matches. */
  | 'stale-state'
  /** Malformed arguments: a missing field, the wrong type, an unknown tool. */
  | 'invalid-input'
  /** Refused by the write scope a Subagent was given. */
  | 'scope'
  /** Refused by an ordering rule, e.g. read-before-edit. */
  | 'precondition'
  /** The tool could not run here: the app is closed, the Capability is absent. */
  | 'unavailable'
  /** The person declined it. */
  | 'declined'
  /** Anything else the tool threw. */
  | 'failed';

export const TOOL_OUTCOMES: readonly ToolOutcome[] = [
  'ok',
  'unknown-target',
  'stale-state',
  'invalid-input',
  'scope',
  'precondition',
  'unavailable',
  'declined',
  'failed',
];

/**
 * Classify a tool result string.
 *
 * `createToolExecutor` funnels every failure through `formatToolError`, so a
 * failed call is a string starting with "Error". The patterns below read that
 * text once, here, and it is never stored.
 */
export function classifyToolResult(result: string | unknown): ToolOutcome {
  if (typeof result !== 'string') return 'ok';
  if (result.startsWith('The user DECLINED')) return 'declined';
  if (!result.startsWith('Error')) return 'ok';

  const m = result;
  if (/scope|may only change|outside this task/i.test(m)) return 'scope';
  if (/must call read_file|read the file first|before (editing|overwriting)/i.test(m))
    return 'precondition';
  if (
    /expected ?state|expected ?hash|state (token )?(mismatch|is stale)|changed since|out of date|stale/i.test(
      m,
    )
  )
    return 'stale-state';
  if (
    /not found|no such|does not exist|unknown (object|scene|layer|animation|property|behavi|frame|node|resource|note|book)|no (object|layer|scene|frame) named|invalid (id|index|name)/i.test(
      m,
    )
  )
    return 'unknown-target';
  if (
    /is required|must be a|must not contain|should not start with|unknown tool|invalid input|maximum|minimum/i.test(
      m,
    )
  )
    return 'invalid-input';
  if (
    /open the app|not available here|needs a project folder|before using its tools|no api key/i.test(
      m,
    )
  )
    return 'unavailable';
  return 'failed';
}

// ── Histograms ──────────────────────────────────────────────────────────────

/**
 * Upper bounds in milliseconds. Fixed so accumulated counters stay comparable
 * across versions; the last bucket is everything above the final bound.
 */
export const BUCKETS_MS = [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000] as const;

export interface Histogram {
  /** One count per bucket, plus a final overflow bucket. */
  b: number[];
  n: number;
  sum: number;
  max: number;
}

export const emptyHistogram = (): Histogram => ({
  b: new Array(BUCKETS_MS.length + 1).fill(0),
  n: 0,
  sum: 0,
  max: 0,
});

export function observe(h: Histogram, ms: number): Histogram {
  if (!Number.isFinite(ms) || ms < 0) return h;
  let i = BUCKETS_MS.findIndex((bound) => ms <= bound);
  if (i < 0) i = BUCKETS_MS.length;
  h.b[i] = (h.b[i] ?? 0) + 1;
  h.n += 1;
  h.sum += ms;
  h.max = Math.max(h.max, ms);
  return h;
}

export const mean = (h: Histogram): number => (h.n ? h.sum / h.n : 0);

/**
 * Approximate quantile — the upper bound of the bucket the quantile falls in.
 * Coarse by construction: use it to compare runs, not to quote a latency SLO.
 */
export function quantile(h: Histogram, q: number): number {
  if (!h.n) return 0;
  const target = q * h.n;
  let seen = 0;
  for (let i = 0; i < h.b.length; i++) {
    seen += h.b[i] ?? 0;
    if (seen >= target) return BUCKETS_MS[i] ?? h.max;
  }
  return h.max;
}

// ── The record ──────────────────────────────────────────────────────────────

export interface ToolStat {
  calls: number;
  /** Called again right after this same tool failed in the same turn. */
  retries: number;
  outcomes: Partial<Record<ToolOutcome, number>>;
  durationMs: Histogram;
}

export interface ModelStat {
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  ttftMs: Histogram;
  durationMs: Histogram;
  steps: Histogram;
  /**
   * Tool accuracy for this model. Kept per model on purpose: "which model
   * invents object names" is the question, and a pooled number cannot answer
   * it. `toolsAcross` sums them back up when the total is what you want.
   */
  tools: Record<string, ToolStat>;
}

export interface AgentMetrics {
  version: 2;
  since: string;
  turns: number;
  turnStatus: Partial<Record<TurnJobStatus, number>>;
  models: Record<string, ModelStat>;
}

export const METRICS_VERSION = 2;

export const emptyMetrics = (since = new Date().toISOString()): AgentMetrics => ({
  version: 2,
  since,
  turns: 0,
  turnStatus: {},
  models: {},
});

const emptyModelStat = (): ModelStat => ({
  turns: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  ttftMs: emptyHistogram(),
  durationMs: emptyHistogram(),
  steps: emptyHistogram(),
  tools: {},
});

const emptyToolStat = (): ToolStat => ({
  calls: 0,
  retries: 0,
  outcomes: {},
  durationMs: emptyHistogram(),
});

/** One turn's observations, ready to fold into the running totals. */
export interface TurnRecord {
  model: string;
  status: TurnJobStatus;
  ttftMs?: number;
  durationMs: number;
  steps: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  tools: { name: string; outcome: ToolOutcome; durationMs?: number; retry: boolean }[];
}

/** Fold a finished turn into the totals. Pure: returns the same object, mutated. */
export function foldTurn(metrics: AgentMetrics, turn: TurnRecord): AgentMetrics {
  metrics.turns += 1;
  metrics.turnStatus[turn.status] = (metrics.turnStatus[turn.status] ?? 0) + 1;

  const model = (metrics.models[turn.model] ??= emptyModelStat());
  model.turns += 1;
  model.inputTokens += turn.inputTokens;
  model.outputTokens += turn.outputTokens;
  model.cachedInputTokens += turn.cachedInputTokens;
  if (turn.ttftMs !== undefined) observe(model.ttftMs, turn.ttftMs);
  observe(model.durationMs, turn.durationMs);
  observe(model.steps, turn.steps);

  for (const call of turn.tools) {
    const tool = (model.tools[call.name] ??= emptyToolStat());
    tool.calls += 1;
    if (call.retry) tool.retries += 1;
    tool.outcomes[call.outcome] = (tool.outcomes[call.outcome] ?? 0) + 1;
    if (call.durationMs !== undefined) observe(tool.durationMs, call.durationMs);
  }
  return metrics;
}

/** Add `b` into `a`, bucket by bucket. */
function mergeHistogram(a: Histogram, b: Histogram): Histogram {
  for (let i = 0; i < a.b.length; i++) a.b[i] = (a.b[i] ?? 0) + (b.b[i] ?? 0);
  a.n += b.n;
  a.sum += b.sum;
  a.max = Math.max(a.max, b.max);
  return a;
}

/** Every model's tool stats summed into one table — the whole-garden view. */
export function toolsAcross(metrics: AgentMetrics = readMetrics()): Record<string, ToolStat> {
  const total: Record<string, ToolStat> = {};
  for (const model of Object.values(metrics.models)) {
    for (const [name, stat] of Object.entries(model.tools)) {
      const into = (total[name] ??= emptyToolStat());
      into.calls += stat.calls;
      into.retries += stat.retries;
      for (const outcome of TOOL_OUTCOMES)
        if (stat.outcomes[outcome])
          into.outcomes[outcome] = (into.outcomes[outcome] ?? 0) + stat.outcomes[outcome]!;
      mergeHistogram(into.durationMs, stat.durationMs);
    }
  }
  return total;
}

// ── Recording a live turn ───────────────────────────────────────────────────

export interface TurnMeter {
  /** Feed every event the turn streams. */
  observe(event: ConversationEvent): void;
  /** Close the turn out and fold it into the totals. */
  finish(status: TurnJobStatus): TurnRecord;
}

/**
 * Meter one turn. `now` and `commit` are injected so tests can drive the clock
 * and read the record without touching settings.
 */
export function meterTurn(args: {
  model: string;
  now?: () => number;
  commit?: (turn: TurnRecord) => void;
}): TurnMeter {
  const now = args.now ?? (() => Date.now());
  const commit = args.commit ?? record;
  const startedAt = now();

  let ttftMs: number | undefined;
  let steps = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;
  const open = new Map<string, { name: string; at: number }>();
  const tools: TurnRecord['tools'] = [];
  /** The tools whose most recent call in this turn failed — the retry signal. */
  const failing = new Set<string>();

  return {
    observe(event) {
      switch (event.type) {
        case 'text':
          ttftMs ??= now() - startedAt;
          break;
        case 'tool_start':
          open.set(event.id, { name: event.name, at: now() });
          break;
        case 'tool_result': {
          const started = open.get(event.id);
          open.delete(event.id);
          const outcome = classifyToolResult(event.result);
          tools.push({
            name: event.name,
            outcome,
            durationMs: started ? now() - started.at : undefined,
            retry: failing.has(event.name),
          });
          if (outcome === 'ok') failing.delete(event.name);
          else failing.add(event.name);
          break;
        }
        case 'step_end':
          steps = event.index + 1;
          break;
        case 'usage':
          inputTokens += event.inputTokens;
          outputTokens += event.outputTokens;
          cachedInputTokens += event.cachedInputTokens;
          break;
        default:
          break;
      }
    },
    finish(status) {
      const turn: TurnRecord = {
        model: args.model,
        status,
        ttftMs,
        durationMs: now() - startedAt,
        steps,
        inputTokens,
        outputTokens,
        cachedInputTokens,
        tools,
      };
      commit(turn);
      return turn;
    },
  };
}

// ── Persistence ─────────────────────────────────────────────────────────────

let cached: AgentMetrics | null = null;

/** The running totals, loaded from settings on first use. */
export function readMetrics(): AgentMetrics {
  if (cached) return cached;
  const raw = getSetting(SettingsKey.AgentMetrics);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as AgentMetrics;
      if (parsed?.version === METRICS_VERSION) return (cached = parsed);
    } catch {
      /* unreadable counters are not worth a failed turn — start again */
    }
  }
  return (cached = emptyMetrics());
}

/** The default path Save writes to, relative to the Garden Root. */
export const DEFAULT_METRICS_PATH = 'agent-metrics.log';

/**
 * One entry for the running log: a rule, the moment it was taken, and the
 * report as it stood. Appending rather than overwriting means the file shows
 * the trend — whether the failure rate moved after a change — which a single
 * overwritten snapshot cannot.
 */
export function logEntry(metrics: AgentMetrics = readMetrics(), at = new Date()): string {
  const rule = '='.repeat(72);
  return `${rule}\n${at.toISOString()}\n${rule}\n${report(metrics)}\n\n`;
}

/**
 * Is recording on? On unless the person switched it off — the counters hold no
 * content, and metrics nobody collected cannot answer anything.
 */
export function isCapturing(): boolean {
  return getSetting(SettingsKey.AgentMetricsCapture) !== 'false';
}

/** Switch recording on or off. Off leaves the counters already gathered intact. */
export function setCapturing(on: boolean): void {
  setSetting(SettingsKey.AgentMetricsCapture, on ? 'true' : 'false');
}

/** Fold a turn into the totals and persist them. Never throws. */
export function record(turn: TurnRecord): void {
  if (!isCapturing()) return;
  try {
    const metrics = foldTurn(readMetrics(), turn);
    setSetting(SettingsKey.AgentMetrics, JSON.stringify(metrics));
  } catch (err) {
    console.warn('Agent metrics not recorded:', err);
  }
}

/** Forget everything and start the window again. */
export function resetMetrics(): void {
  cached = emptyMetrics();
  removeSetting(SettingsKey.AgentMetrics);
}

/** Test seam: drop the in-memory copy so the next read comes from settings. */
export function clearMetricsCache(): void {
  cached = null;
}

// ── Readout ─────────────────────────────────────────────────────────────────

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);
const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`);

/**
 * A plain-text readout of the totals — the thing to paste into a plan or a
 * BUILD-LOG entry when deciding what to fix next.
 */
export function report(metrics: AgentMetrics = readMetrics()): string {
  const lines: string[] = [];
  lines.push(`Agent metrics since ${metrics.since}`);
  lines.push(`${metrics.turns} ${plural(metrics.turns, 'turn')}`);
  if (!metrics.turns) return lines.join('\n');

  const status = Object.entries(metrics.turnStatus)
    .map(([k, v]) => `${k} ${v}`)
    .join(', ');
  if (status) lines.push(`  ${status}`);

  const overall = toolsAcross(metrics);
  const allCalls = Object.values(overall).reduce((n, t) => n + t.calls, 0);
  const allBad = Object.values(overall).reduce((n, t) => n + failureCount(t), 0);
  if (allCalls)
    lines.push(
      `${allCalls} tool calls, ${allBad} failed (${pct(allBad, allCalls)}%), ${
        unknownTargetRate(metrics).unknownTarget
      } named something that does not exist`,
    );

  for (const [name, m] of Object.entries(metrics.models)) {
    lines.push('');
    lines.push(`${name} — ${m.turns} ${plural(m.turns, 'turn')}`);
    lines.push(
      `  ttft p50 ${ms(quantile(m.ttftMs, 0.5))} p95 ${ms(quantile(m.ttftMs, 0.95))}, turn p50 ${ms(
        quantile(m.durationMs, 0.5),
      )} p95 ${ms(quantile(m.durationMs, 0.95))}, steps mean ${mean(m.steps).toFixed(1)} max ${
        m.steps.max
      }`,
    );
    lines.push(
      `  tokens in ${m.inputTokens} (cached ${m.cachedInputTokens}, ${pct(
        m.cachedInputTokens,
        m.inputTokens,
      )}%), out ${m.outputTokens}`,
    );
    const tools = sortedTools(m.tools);
    if (!tools.length) {
      lines.push('  no tool calls');
      continue;
    }
    for (const [tool, t] of tools) lines.push(`  ${describeTool(tool, t)}`);
  }

  const tools = sortedTools(overall);
  if (Object.keys(metrics.models).length > 1 && tools.length) {
    lines.push('');
    lines.push('All models');
    for (const [tool, t] of tools) lines.push(`  ${describeTool(tool, t)}`);
  }
  return lines.join('\n');
}

/** Worst failure count first, then busiest. */
function sortedTools(tools: Record<string, ToolStat>): [string, ToolStat][] {
  return Object.entries(tools).sort(
    (a, b) => failureCount(b[1]) - failureCount(a[1]) || b[1].calls - a[1].calls,
  );
}

function describeTool(name: string, t: ToolStat): string {
  const bad = failureCount(t);
  const detail = TOOL_OUTCOMES.filter((o) => o !== 'ok' && t.outcomes[o])
    .map((o) => `${o} ${t.outcomes[o]}`)
    .join(', ');
  return `${name}: ${t.calls} ${plural(t.calls, 'call')}, ${bad} failed (${pct(
    bad,
    t.calls,
  )}%), ${t.retries} ${plural(t.retries, 'retry').replace('retrys', 'retries')}, p50 ${ms(
    quantile(t.durationMs, 0.5),
  )}${detail ? ` — ${detail}` : ''}`;
}

/** Calls that did not return a result. */
export function failureCount(t: ToolStat): number {
  return t.calls - (t.outcomes.ok ?? 0);
}

/**
 * The share of tool calls that failed because the model named something that
 * does not exist — the number that says whether constraining tool arguments to
 * the values an app actually has would pay for itself.
 */
export function unknownTargetRate(
  metrics: AgentMetrics = readMetrics(),
  model?: string,
): { calls: number; unknownTarget: number; rate: number } {
  const tables = model
    ? [metrics.models[model]?.tools ?? {}]
    : Object.values(metrics.models).map((m) => m.tools);
  let calls = 0;
  let unknownTarget = 0;
  for (const tools of tables)
    for (const t of Object.values(tools)) {
      calls += t.calls;
      unknownTarget += t.outcomes['unknown-target'] ?? 0;
    }
  return { calls, unknownTarget, rate: calls ? unknownTarget / calls : 0 };
}
