import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import type { LanguageModel } from 'ai';
import type { LanguageModelV4StreamPart, LanguageModelV4Usage, LanguageModelV4Prompt } from '@ai-sdk/provider';

/**
 * The scripted language model the e2e suite talks to (CRUX_AI_MOCK=1).
 *
 * Deterministic and provider-free, so the whole Collaboration loop — prompt
 * assembly, tool execution against the real store and Project Folder,
 * streaming into the UI, auto-snapshot — runs in Playwright without a key.
 *
 * Script: a user message containing "write" makes the model call
 * `write_file` (hello.txt); once it sees the tool result it answers with
 * text. Anything else is echoed. Never used outside the mock flag.
 */

const USAGE: LanguageModelV4Usage = {
  inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};

function stream(parts: LanguageModelV4StreamPart[]) {
  return { stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([{ type: 'stream-start', warnings: [] }, ...parts]) };
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
          return textStream('Done — I wrote that file for you.');
        }
        const text = lastUserText(prompt);
        // "slowly": hold the tool call back so a test can act mid-turn
        if (/\bslowly\b/i.test(text)) await new Promise((r) => setTimeout(r, 1500));
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
