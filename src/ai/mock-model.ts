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
      doStream: async ({ prompt }) => {
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
