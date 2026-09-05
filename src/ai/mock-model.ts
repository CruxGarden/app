import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import type { LanguageModel } from 'ai';
import type {
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
  LanguageModelV4Prompt,
} from '@ai-sdk/provider';

/**
 * The scripted language model the e2e suite talks to (CRUX_AI_MOCK=1).
 *
 * Deterministic and provider-free, so the whole Collaboration loop — prompt
 * assembly, tool execution against the real store and Project Folder,
 * streaming into the UI, auto-snapshot — runs in Playwright without a key.
 *
 * Script: a user message containing "write" makes the model call
 * `write_file` (hello.txt); "paint" makes it call `set_theme` (preview);
 * once it sees a tool result it answers with text. Anything else is echoed. Never used outside the mock flag.
 */

const USAGE: LanguageModelV4Usage = {
  inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};

function stream(parts: LanguageModelV4StreamPart[]) {
  return {
    stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
      { type: 'stream-start', warnings: [] },
      ...parts,
    ]),
  };
}

function textStream(text: string) {
  return stream([
    { type: 'text-start', id: 't1' },
    { type: 'text-delta', id: 't1', delta: text },
    { type: 'text-end', id: 't1' },
    { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: USAGE },
  ]);
}

function toolCallStream(toolName: string, input: Record<string, unknown>) {
  return stream([
    { type: 'tool-call', toolCallId: `mock-${Date.now()}`, toolName, input: JSON.stringify(input) },
    { type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage: USAGE },
  ]);
}

function lastUserText(prompt: LanguageModelV4Prompt): string {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const m = prompt[i]!;
    if (m.role === 'user') {
      return m.content.map((c) => (c.type === 'text' ? c.text : '')).join(' ');
    }
  }
  return '';
}

let instance: MockLanguageModelV4 | null = null;

export function getMockLanguageModel(): LanguageModel {
  if (!instance) {
    instance = new MockLanguageModelV4({
      doStream: async ({ prompt, abortSignal }) => {
        // B0 growth scenario ("rewind") — scripted at the end of this file
        const growth = growthScript(prompt);
        if (growth) return growth;
        // B3 Background Turn scenario ("three steps") — scripted at the end of this file
        const plan = planScript(prompt, abortSignal);
        if (plan) return plan;
        const last = prompt[prompt.length - 1];
        if (last?.role === 'tool') {
          const used = (name: string) =>
            last.content.some((c) => c.type === 'tool-result' && c.toolName === name);
          return textStream(
            used('set_theme')
              ? 'Done — I painted it.'
              : used('set_background')
                ? 'Done — new backdrop.'
                : used('set_resonance')
                  ? 'Done — adjusted the room.'
                  : 'Done — I wrote that file for you.',
          );
        }
        const text = lastUserText(prompt);
        // "slowly": hold the tool call back so a test can act mid-turn
        if (/\bslowly\b/i.test(text)) await new Promise((r) => setTimeout(r, 1500));
        // "quiet" / "rain": the model steers the soundscape
        if (/\bquiet\b/i.test(text)) {
          return toolCallStream('set_resonance', { volume: 0.2, duck: false });
        }
        if (/\blofi\b/i.test(text)) {
          return toolCallStream('set_resonance', {
            createMix: {
              name: 'Lofi Study Beats',
              root: 'F',
              scale: 'major',
              tempo: 74,
              layers: [
                {
                  type: 'keys',
                  gain: -14,
                  params: { instrument: 'rhodes', progression: 'lofi', rhythm: 'half' },
                  effects: [{ type: 'tape', params: { wobble: 0.4 } }],
                },
                {
                  type: 'beat',
                  gain: -16,
                  params: { pattern: 'lofi', swing: 0.6 },
                  effects: [{ type: 'bitcrusher', params: { bits: 8 } }],
                },
                { type: 'bass', gain: -16, params: { pattern: 'root', progression: 'lofi' } },
                { type: 'vinyl', gain: -22 },
              ],
              master: { reverbDecay: 2.5, reverbWet: 0.2 },
            },
          });
        }
        if (/\brain\b/i.test(text)) {
          return toolCallStream('set_resonance', { mix: 'Night Rain', cue: 'chime' });
        }
        // "backdrop": the model sets a workspace image as the Mood background
        if (/\bbackdrop\b/i.test(text)) {
          return toolCallStream('set_background', { path: 'backdrop.png' });
        }
        // "paint": the model signals with the theme (preview layer)
        if (/\bpaint\b/i.test(text)) {
          return toolCallStream('set_theme', {
            tokens: {
              accent: '#ff2d95',
              paneCollaborationBody: '#112233',
              paneCollaborationBorder: 'linear-gradient(135deg, #00f0ff, #7cff00)',
              paneBorderWidth: '3px',
            },
            mode: 'preview',
          });
        }
        if (/\bwrite\b/i.test(text)) {
          return toolCallStream('write_file', {
            path: 'hello.txt',
            content: 'Hello from the mock AI.\n',
          });
        }
        return textStream(`Mock reply: ${text}`);
      },
    });
  }
  return instance as unknown as LanguageModel;
}

// ── B0: Growth tools scenario ───────────────────────────────────────────────
//
// "rewind": the model checkpoints, breaks a file, and restores the checkpoint —
// snapshot → read_file → write_file(hello.txt, broken) → restore(<id>) → text.
// The snapshot id is read back out of the snapshot tool's own result, so the
// script exercises the real id round-trip the way a model would.

const REWIND_LABEL = 'Checkpoint';

function toolResultText(prompt: LanguageModelV4Prompt, toolName: string): string | null {
  for (const m of prompt) {
    if (m.role !== 'tool') continue;
    for (const c of m.content) {
      if (c.type !== 'tool-result' || c.toolName !== toolName) continue;
      const out = c.output;
      if (out.type === 'text' || out.type === 'error-text') return out.value;
      if (out.type === 'json' || out.type === 'error-json') return JSON.stringify(out.value);
    }
  }
  return null;
}

function growthScript(prompt: LanguageModelV4Prompt): ReturnType<typeof stream> | null {
  if (!/\brewind\b/i.test(lastUserText(prompt))) return null;
  const last = prompt[prompt.length - 1];
  if (last?.role !== 'tool') {
    return toolCallStream('snapshot', { label: REWIND_LABEL });
  }
  const used = (name: string) =>
    last.content.some((c) => c.type === 'tool-result' && c.toolName === name);
  if (used('snapshot')) return toolCallStream('read_file', { path: 'hello.txt' });
  if (used('read_file')) {
    return toolCallStream('write_file', { path: 'hello.txt', content: 'BROKEN by the mock AI.\n' });
  }
  if (used('write_file')) {
    const id = /id: (\S+)/.exec(toolResultText(prompt, 'snapshot') ?? '')?.[1];
    return toolCallStream('restore', { snapshotId: id ?? 'latest' });
  }
  return textStream('Done — rewound to the checkpoint.');
}

// ── B3: Background Turn scenario ────────────────────────────────────────────
//
// "three steps": the model opens with a ```plan block of three steps, then
// writes one file per round (step-1.txt … step-3.txt — write_file refuses to
// overwrite a file it has not read) and closes with text. It "thinks" between rounds — long before step 2 — so a test can
// type, stop, or relaunch mid-step while the job card shows the steps advance.

export const PLAN_STEPS = ['Lay the foundation', 'Raise the walls', 'Put on the roof'];
export const planStepFile = (n: number) => `step-${n}.txt`;
/** Think time before each round's write (ms): step 2 is the slow one, step 3 long enough to watch. */
const PLAN_THINK_MS = [0, 5000, 2500];

function countToolResults(prompt: LanguageModelV4Prompt, toolName: string): number {
  let n = 0;
  for (const m of prompt) {
    if (m.role !== 'tool') continue;
    for (const c of m.content) if (c.type === 'tool-result' && c.toolName === toolName) n++;
  }
  return n;
}

/** Wait like a provider would — and die with the request when it is aborted. */
function think(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

function planScript(
  prompt: LanguageModelV4Prompt,
  abortSignal?: AbortSignal,
): Promise<ReturnType<typeof stream>> | null {
  if (!/\bthree steps\b/i.test(lastUserText(prompt))) return null;
  const n = countToolResults(prompt, 'write_file');
  return (async () => {
    if (n >= PLAN_STEPS.length) return textStream('Done — all three steps are in.');
    const ms = PLAN_THINK_MS[n] ?? 0;
    if (ms > 0) await think(ms, abortSignal);
    const parts: LanguageModelV4StreamPart[] = [];
    if (n === 0) {
      const plan = ['```plan', ...PLAN_STEPS.map((t, i) => `${i + 1}. ${t}`), '```', ''].join('\n');
      parts.push(
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: plan },
        { type: 'text-end', id: 't1' },
      );
    }
    parts.push(
      {
        type: 'tool-call',
        toolCallId: `mock-plan-${n + 1}-${Date.now()}`,
        toolName: 'write_file',
        input: JSON.stringify({ path: planStepFile(n + 1), content: `step ${n + 1}\n` }),
      },
      { type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage: USAGE },
    );
    return stream(parts);
  })();
}
