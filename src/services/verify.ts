import { generateText, jsonSchema, Output, type LanguageModel } from 'ai';
import { isSiteCrux } from '@/services/site';
import { pathOf, type ArtifactPathSource } from '@/lib/artifact-path';
import { getProviderForModel } from '@/ai/providers';

/**
 * Verify before done (AI-COLLABORATION-V3 B4, ADR 0013).
 *
 * A check is three bounded stages, each optional on its own:
 *
 *   1. BUILD — Site Cruxes run `check_site` (the production build). A failed
 *      build is a problem in itself; plain HTML cruxes have nothing to build.
 *   2. SCREENSHOT — the preview's front page, through the same desktop capture
 *      path snapshot thumbnails use. Saved as the workspace `preview.jpg` so
 *      the next snapshot carries it.
 *   3. INSPECT — one vision request with the screenshot, the person's prompt,
 *      the plan, the reply and the build log, asking for a strict JSON verdict.
 *      Skipped when the model has no vision or there is no screenshot; the
 *      build result alone then decides. A verdict that cannot be read never
 *      blocks: it counts as ok, with a note.
 *
 * This module is the pure half: what to check, how to ask, how to read the
 * answer. `defaultCheckDeps` binds it to the real services; `services/turns`
 * decides when a check runs and what happens after.
 */

export interface Verdict {
  ok: boolean;
  problems: string[];
  fix?: string;
}

export interface CheckInput {
  cruxId: string;
  /** The person's request that started the job (full text). */
  prompt: string;
  /** Plan step titles, when the model emitted a plan. */
  plan: string[];
  /** The model's final reply — the completion claim. */
  reply: string;
  siteCrux: boolean;
  /** The chat model can look at images. */
  vision: boolean;
}

export interface CheckOutcome {
  ok: boolean;
  problems: string[];
  fix?: string;
  /** Blob Store fingerprint of the screenshot this verdict was made on. */
  shotFingerprint?: string;
  /** Why the check was partial. */
  note?: string;
  buildLog?: string;
}

export interface CheckShotResult {
  bytes: Uint8Array;
  fingerprint?: string;
}

export interface CheckDeps {
  /** Run the site build; null when building is unavailable here. */
  build?: (cruxId: string) => Promise<{ ok: boolean; log: string } | null>;
  /** Screenshot the preview front page; null when there is nothing to shoot. */
  screenshot?: (cruxId: string, signal?: AbortSignal) => Promise<CheckShotResult | null>;
  /** One inspection turn; null when no verdict could be obtained. */
  inspect?: (image: Uint8Array, text: string, signal?: AbortSignal) => Promise<Verdict | null>;
}

/** Stage budgets — the whole check is capped, a slow stage becomes a note, not a hang. */
export const CHECK_BUDGET_MS = {
  build: 180_000,
  screenshot: 30_000,
  inspect: 60_000,
} as const;

/** Site Crux (Astro config) or a plain HTML crux with a root index.html. */
export function isVisualCrux(artifacts: ArtifactPathSource[]): boolean {
  if (isSiteCrux(artifacts)) return true;
  return artifacts.some((a) => pathOf(a).toLowerCase() === 'index.html');
}

/**
 * Vision by provider: the three cloud providers accept image parts on every
 * chat model we list; local models vary and the server does not say, so the
 * check skips inspection there and lets the build decide.
 */
export function modelHasVision(model: string): boolean {
  const provider = getProviderForModel(model);
  return provider === 'anthropic' || provider === 'openai' || provider === 'google';
}

// ── The verdict ─────────────────────────────────────────────────────────────

export const VERDICT_SCHEMA = jsonSchema<Verdict>({
  type: 'object',
  properties: {
    ok: {
      type: 'boolean',
      description: 'True when the page does what was asked, with no visible defects.',
    },
    problems: {
      type: 'array',
      items: { type: 'string' },
      description: 'Concrete, visible problems — one short sentence each. Empty when ok.',
    },
    fix: { type: 'string', description: 'Optional one-line suggestion for the fix.' },
  },
  required: ['ok', 'problems'],
  additionalProperties: false,
});

/**
 * The inspection system prompt. `strict JSON verdict` is the marker the e2e
 * mock model keys on to answer this request and no other.
 */
export const INSPECTION_SYSTEM =
  'You inspect a screenshot of a web page someone just built with an assistant and give a strict JSON verdict. ' +
  'Compare the screenshot with what was asked. Report only what is visibly wrong or missing: blank or broken page, ' +
  'missing elements that were asked for, unreadable text, overlapping layout, obvious errors. Do not comment on taste. ' +
  'Answer with JSON only: {"ok": boolean, "problems": string[], "fix"?: string}.';

export function buildInspectionText(input: CheckInput, buildLog?: string): string {
  const parts = [`What was asked:\n${input.prompt.trim() || '(no prompt)'}`];
  if (input.plan.length > 0) {
    parts.push(`The plan:\n${input.plan.map((s, i) => `${i + 1}. ${s}`).join('\n')}`);
  }
  if (input.reply.trim()) parts.push(`The assistant's final reply:\n${input.reply.trim()}`);
  if (buildLog) parts.push(`Build output (tail):\n${tailOf(buildLog)}`);
  parts.push('The screenshot of the preview front page is attached. Give the verdict.');
  return parts.join('\n\n');
}

/**
 * Read a verdict out of free text: the first balanced JSON object with a
 * boolean `ok`. Null when there is none — the caller falls back to ok.
 */
export function parseVerdict(text: string | undefined | null): Verdict | null {
  if (!text) return null;
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return normalizeVerdict(JSON.parse(text.slice(start, i + 1)));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function normalizeVerdict(raw: unknown): Verdict | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.ok !== 'boolean') return null;
  const problems = Array.isArray(r.problems)
    ? r.problems.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    : [];
  const fix = typeof r.fix === 'string' && r.fix.trim() ? r.fix.trim() : undefined;
  // A "not ok" with nothing named is not actionable — treat it as ok with a note downstream.
  if (!r.ok && problems.length === 0) return { ok: true, problems: [], ...(fix ? { fix } : {}) };
  return { ok: r.ok, problems, ...(fix ? { fix } : {}) };
}

/**
 * One inspection turn against a LanguageModel: structured output where the
 * provider supports it, JSON parsed out of the text otherwise, null when
 * neither yields a verdict (never throws).
 */
export async function inspectWithModel(
  model: LanguageModel,
  image: Uint8Array,
  text: string,
  signal?: AbortSignal,
): Promise<Verdict | null> {
  try {
    const result = await generateText({
      model,
      output: Output.object({ schema: VERDICT_SCHEMA, name: 'verdict' }),
      system: INSPECTION_SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text },
            { type: 'file', data: image, mediaType: 'image/jpeg' },
          ],
        },
      ],
      maxOutputTokens: 600,
      abortSignal: signal,
    });
    const structured = normalizeVerdict(result.output);
    return structured ?? parseVerdict(result.text);
  } catch (err: unknown) {
    if ((err as Error)?.name === 'AbortError' || signal?.aborted) throw err;
    // NoObjectGeneratedError carries the raw text — one more chance to read it.
    const text = (err as { text?: string })?.text;
    return parseVerdict(text);
  }
}

// ── The check ───────────────────────────────────────────────────────────────

export async function runCheck(
  input: CheckInput,
  deps: CheckDeps,
  signal?: AbortSignal,
): Promise<CheckOutcome> {
  const notes: string[] = [];
  let buildLog: string | undefined;

  // 1. Build (Site Cruxes only)
  if (input.siteCrux && deps.build) {
    try {
      const built = await withBudget(deps.build(input.cruxId), CHECK_BUDGET_MS.build, signal);
      if (built === null) {
        notes.push('Building is not available here');
      } else {
        buildLog = built.log;
        if (!built.ok) {
          return {
            ok: false,
            problems: [`Build failed:\n${tailOf(built.log, 1500)}`],
            note: 'build failed',
            buildLog,
          };
        }
      }
    } catch (err: unknown) {
      throwIfAborted(err, signal);
      const e = err as { message?: string; log?: string };
      return {
        ok: false,
        problems: [
          `Build failed (${e.message ?? 'unknown error'})${e.log ? `:\n${tailOf(e.log, 1500)}` : ''}`,
        ],
        note: 'build failed',
        buildLog: e.log,
      };
    }
  }

  // 2. Screenshot
  let shot: CheckShotResult | null = null;
  if (deps.screenshot) {
    try {
      shot = await withBudget(
        deps.screenshot(input.cruxId, signal),
        CHECK_BUDGET_MS.screenshot,
        signal,
      );
    } catch (err: unknown) {
      throwIfAborted(err, signal);
      notes.push('Screenshot failed');
    }
  }
  if (!shot) notes.push('No preview to screenshot');

  // 3. Inspect
  if (!input.vision) notes.push('Model has no vision — build result only');
  const canInspect = !!shot && input.vision && !!deps.inspect;
  if (!canInspect) {
    return {
      ok: true,
      problems: [],
      note: notes.join('; ') || undefined,
      ...(shot?.fingerprint ? { shotFingerprint: shot.fingerprint } : {}),
      buildLog,
    };
  }

  let verdict: Verdict | null;
  try {
    verdict = await withBudget(
      deps.inspect!(shot!.bytes, buildInspectionText(input, buildLog), signal),
      CHECK_BUDGET_MS.inspect,
      signal,
    );
  } catch (err: unknown) {
    throwIfAborted(err, signal);
    verdict = null;
  }
  if (!verdict) notes.push('Verdict unavailable — passed on the build and screenshot alone');

  return {
    ok: verdict?.ok ?? true,
    problems: verdict?.problems ?? [],
    ...(verdict?.fix ? { fix: verdict.fix } : {}),
    ...(shot?.fingerprint ? { shotFingerprint: shot.fingerprint } : {}),
    note: notes.join('; ') || undefined,
    buildLog,
  };
}

/** The message the check hands back to the model on a failed first attempt. */
export function checkFoundMessage(problems: string[], fix?: string): string {
  const lines = problems.length === 1 ? problems[0]! : problems.map((p) => `- ${p}`).join('\n');
  return `Check found: ${lines}${fix ? `\n\nSuggested fix: ${fix}` : ''}`;
}

/**
 * The line for the system prompt (B6 splices it): tells the model a check
 * follows its "done" and how to treat the check's message.
 */
export const VERIFY_PROMPT_LINE =
  'When you say a visual task is done, the app checks it: it builds the site, screenshots the preview and inspects the result. ' +
  'If a message starting with "Check found:" arrives, it lists what that check saw — fix exactly those problems, then reply briefly.';

// ── Helpers ─────────────────────────────────────────────────────────────────

function tailOf(log: string, maxChars = 4000): string {
  const trimmed = log.trim();
  return trimmed.length <= maxChars ? trimmed : `…${trimmed.slice(-maxChars)}`;
}

function throwIfAborted(err: unknown, signal?: AbortSignal): void {
  if ((err as Error)?.name === 'AbortError' || signal?.aborted) throw err;
}

function withBudget<T>(p: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`check stage timed out after ${ms / 1000}s`)), ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    p.then(
      (v) => {
        clearTimeout(t);
        signal?.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        signal?.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}

// ── Real deps ───────────────────────────────────────────────────────────────

/**
 * Bind the check to the desktop services. The screenshot stage starts the
 * crux's preview (static server, or `astro dev` for a Site Crux) when none is
 * running, releases it afterwards, and files the JPEG as the workspace
 * `preview.jpg` — exactly what snapshot thumbnails are.
 */
export async function defaultCheckDeps(args: {
  model: string;
  apiKey: string | null;
}): Promise<CheckDeps> {
  const [{ checkSiteBuild, startDevServer, stopDevServer }, preview, capture, registry, store] =
    await Promise.all([
      import('@/services/site'),
      import('@/services/preview-server'),
      import('@/services/preview-capture'),
      import('@/lib/preview-registry'),
      import('@/stores/cruxStore'),
    ]);

  const screenshot: CheckDeps['screenshot'] = async (cruxId) => {
    const s = store.useCruxStore.getState();
    const site = isSiteCrux(s.artifacts);
    let url = registry.activePreviewUrl(cruxId);
    let started = false;
    if (!url) {
      const base = site ? await startDevServer(cruxId) : await preview.startPreviewServer(cruxId);
      if (!base) return null;
      url = `${base}/`;
      started = true;
    }
    try {
      const blob = await capture.captureLocalPreview(url);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const saved = await capture.saveWorkspacePreviewJpeg(cruxId, blob);
      // Mirror what createSnapshot does so the Artifacts list sees the new preview.jpg.
      const live = store.useCruxStore.getState();
      if (live.crux?.id === cruxId) {
        if (live.artifacts.some((a) => a.id === saved.id)) live.updateArtifact(saved.id, saved);
        else live.addArtifact(saved);
      }
      return { bytes, fingerprint: saved.fingerprint };
    } finally {
      if (started) void (site ? stopDevServer(cruxId) : preview.stopPreviewServer(cruxId));
    }
  };

  let inspect: CheckDeps['inspect'];
  if (args.apiKey) {
    const { languageModelFor } = await import('@/ai/engine');
    const lm = languageModelFor(args.model, args.apiKey);
    inspect = (image, text, signal) => inspectWithModel(lm, image, text, signal);
  }

  return { build: checkSiteBuild, screenshot, inspect };
}
