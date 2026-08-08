import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  estimateMessageTokens,
  fitToContextWindow,
  evictedTranscript,
  compactionNote,
} from './context';
import type { NormalizedMessage } from '@/services/types';

function user(content: string): NormalizedMessage {
  return { role: 'user', content } as NormalizedMessage;
}

function assistant(content: string): NormalizedMessage {
  return { role: 'assistant', content } as NormalizedMessage;
}

/** An assistant tool_use turn followed by its user tool_result carrier. */
function toolPair(id: string, filler = ''): [NormalizedMessage, NormalizedMessage] {
  return [
    {
      role: 'assistant',
      content: [
        { type: 'text', text: `Reading a file${filler}` },
        { type: 'tool_use', id, name: 'read_file', input: { path: 'index.html' } },
      ],
    } as NormalizedMessage,
    {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: id, content: `file contents${filler}` }],
    } as NormalizedMessage,
  ];
}

const hasToolResult = (m: NormalizedMessage) =>
  typeof m.content !== 'string' && m.content.some((b) => b.type === 'tool_result');

describe('estimateTokens', () => {
  it('estimates ~3.5 chars per token', () => {
    expect(estimateTokens('hello world')).toBe(4); // 11 / 3.5 = 3.14, ceil = 4
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a'.repeat(100))).toBe(29); // 100 / 3.5 = 28.57, ceil = 29
  });
});

describe('estimateMessageTokens', () => {
  it('estimates tokens for string content', () => {
    const messages = [user('hello world'), assistant('hi there')];
    const tokens = estimateMessageTokens(messages);
    expect(tokens).toBe(estimateTokens('hello world') + estimateTokens('hi there'));
  });

  it('estimates tokens for content block arrays', () => {
    const [call] = toolPair('t1');
    expect(estimateMessageTokens([call])).toBeGreaterThan(0);
  });
});

describe('fitToContextWindow', () => {
  const base = { contextWindow: 200_000, maxOutput: 16_384, fixedTokens: 5_000 };

  it('returns messages unchanged when under budget', () => {
    const messages = [user('short'), assistant('reply')];
    const result = fitToContextWindow(messages, base);
    expect(result.trimmed).toBe(false);
    expect(result.messages).toEqual(messages);
    expect(result.evicted).toEqual([]);
  });

  it('evicts oldest messages when over budget and stays within it', () => {
    const messages: NormalizedMessage[] = [];
    for (let i = 0; i < 100; i++) {
      messages.push(i % 2 === 0 ? user('x'.repeat(10_000)) : assistant('x'.repeat(10_000)));
    }
    const opts = { contextWindow: 100_000, maxOutput: 8_192, fixedTokens: 5_000 };
    const result = fitToContextWindow(messages, opts);
    expect(result.trimmed).toBe(true);
    expect(result.messages.length + result.evicted.length).toBe(100);
    expect(estimateMessageTokens(result.messages)).toBeLessThanOrEqual(
      opts.contextWindow - opts.fixedTokens - opts.maxOutput,
    );
    // The newest messages survive
    expect(result.messages[result.messages.length - 1]).toBe(messages[99]);
  });

  it('budget scales with the model: a small window trims what a large one keeps', () => {
    const messages: NormalizedMessage[] = [];
    for (let i = 0; i < 20; i++) {
      messages.push(i % 2 === 0 ? user('x'.repeat(10_000)) : assistant('x'.repeat(10_000)));
    }
    const large = fitToContextWindow(messages, {
      contextWindow: 1_000_000,
      maxOutput: 128_000,
      fixedTokens: 5_000,
    });
    const small = fitToContextWindow(messages, {
      contextWindow: 32_768,
      maxOutput: 8_192,
      fixedTokens: 5_000,
    });
    expect(large.trimmed).toBe(false);
    expect(small.trimmed).toBe(true);
  });

  it('never starts the kept window on an orphaned tool_result (pair-safety)', () => {
    // Alternating real turns and tool pairs, sized so the cut lands mid-pair
    const messages: NormalizedMessage[] = [];
    for (let i = 0; i < 30; i++) {
      messages.push(user(`question ${i} ${'x'.repeat(5_000)}`));
      messages.push(...toolPair(`t${i}`, 'x'.repeat(5_000)));
      messages.push(assistant(`answer ${i} ${'x'.repeat(5_000)}`));
    }
    for (let window = 20_000; window <= 120_000; window += 10_000) {
      const result = fitToContextWindow(messages, {
        contextWindow: window,
        maxOutput: 4_096,
        fixedTokens: 2_000,
      });
      const first = result.messages[0]!;
      expect(first.role).toBe('user');
      expect(hasToolResult(first)).toBe(false);
    }
  });

  it('100-turn synthetic conversation with tool use always yields a valid window', () => {
    // The plan's A5 gate, in estimation space: for every window size the kept
    // history starts clean, keeps the newest message, and fits the budget.
    const messages: NormalizedMessage[] = [];
    for (let i = 0; i < 100; i++) {
      messages.push(user(`turn ${i} ${'x'.repeat(2_000)}`));
      const [call, result] = toolPair(`t${i}`, 'x'.repeat(3_000));
      messages.push(call, result);
      messages.push(assistant(`done ${i} ${'x'.repeat(2_000)}`));
    }
    for (const contextWindow of [16_384, 32_768, 128_000, 200_000, 1_000_000]) {
      const opts = { contextWindow, maxOutput: 4_096, fixedTokens: 3_000 };
      const fit = fitToContextWindow(messages, opts);
      const first = fit.messages[0]!;
      expect(first.role).toBe('user');
      expect(hasToolResult(first)).toBe(false);
      expect(fit.messages[fit.messages.length - 1]).toBe(messages[messages.length - 1]);
      if (fit.trimmed) {
        expect(estimateMessageTokens(fit.messages)).toBeLessThanOrEqual(
          contextWindow - opts.fixedTokens - opts.maxOutput,
        );
      }
    }
  });

  it('repairs the first kept message when no clean start exists (the real 400)', () => {
    // useChat merges tool_results onto the FOLLOWING user message, so a
    // tool-heavy conversation can have no clean user turn after the cut. The
    // window must still not begin with an orphaned tool_result.
    const messages: NormalizedMessage[] = [user('start')];
    for (let i = 0; i < 40; i++) {
      messages.push(...toolPair(`t${i}`, 'x'.repeat(6_000)));
    }
    const fit = fitToContextWindow(messages, {
      contextWindow: 16_384,
      maxOutput: 4_096,
      fixedTokens: 2_000,
    });
    expect(fit.trimmed).toBe(true);
    const first = fit.messages[0]!;
    expect(hasToolResult(first)).toBe(false);
    // The repair keeps a marker rather than silently dropping content
    expect(JSON.stringify(first.content)).toContain('tool results');
  });

  it('counts image blocks in tool results instead of scoring them as ~4 tokens', () => {
    const withImage: NormalizedMessage = {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 't1',
          content: [
            { type: 'text', text: 'here is the image' },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
          ],
        },
      ],
    } as NormalizedMessage;
    // Must dwarf the "[object Object]" estimate the old code produced
    expect(estimateMessageTokens([withImage])).toBeGreaterThan(1000);
  });

  it('always keeps the newest message even when it alone exceeds the budget', () => {
    const messages = [user('old'), assistant('older reply'), user('x'.repeat(200_000))];
    const result = fitToContextWindow(messages, {
      contextWindow: 32_768,
      maxOutput: 8_192,
      fixedTokens: 1_000,
    });
    expect(result.messages.length).toBeGreaterThanOrEqual(1);
    expect(result.messages[result.messages.length - 1]).toBe(messages[2]);
  });

  it('evicted + kept preserves original order and content', () => {
    const messages: NormalizedMessage[] = [];
    for (let i = 0; i < 40; i++) {
      messages.push(
        i % 2 === 0 ? user(`m${i} ${'x'.repeat(8_000)}`) : assistant(`m${i} ${'x'.repeat(8_000)}`),
      );
    }
    const result = fitToContextWindow(messages, {
      contextWindow: 50_000,
      maxOutput: 4_096,
      fixedTokens: 1_000,
    });
    expect([...result.evicted, ...result.messages]).toEqual(messages);
  });
});

describe('evictedTranscript', () => {
  it('flattens text and tool calls, skipping tool result payloads', () => {
    const [call, result] = toolPair('t1');
    const transcript = evictedTranscript([user('make a site'), call, result, assistant('done')]);
    expect(transcript).toContain('user: make a site');
    expect(transcript).toContain('[called read_file]');
    expect(transcript).toContain('assistant: done');
    expect(transcript).not.toContain('file contents');
  });

  it('keeps the newest end of an over-long transcript', () => {
    const many = Array.from({ length: 100 }, (_, i) => user(`msg ${i} ${'x'.repeat(1_000)}`));
    const transcript = evictedTranscript(many, 5_000);
    expect(transcript.length).toBeLessThanOrEqual(5_000);
    expect(transcript).toContain('msg 99');
    expect(transcript).not.toContain('msg 0 ');
  });
});

describe('compactionNote', () => {
  it('includes the summary when present', () => {
    const note = compactionNote(12, 'They built a blog.');
    expect(note).toContain('12 earliest messages');
    expect(note).toContain('They built a blog.');
  });

  it('is a bare note without a summary', () => {
    const note = compactionNote(5, null);
    expect(note).toContain('5 earliest messages');
    expect(note).not.toContain('Summary');
  });
});
