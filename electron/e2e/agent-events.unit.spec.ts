import { test, expect } from '@playwright/test';
import {
  mapSdkMessage,
  newMapperState,
  describeToolUse,
  toolResultText,
} from '../src/agent-events';

/**
 * The Agent Provider's mapper (ADR 0019): SDK messages → the engine's events.
 * Recorded shapes from the Claude Agent SDK, no process involved.
 */
test.describe('agent-events mapper', () => {
  test('a full turn: init, streamed text, a Write, its result, a result message', () => {
    const s = newMapperState();
    const events = [
      ...mapSdkMessage(
        {
          type: 'system',
          subtype: 'init',
          session_id: 'sess-1',
          model: 'claude-sonnet-5',
          claude_code_version: '2.1.266',
        },
        s,
      ),
      ...mapSdkMessage(
        { type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start' } },
        s,
      ),
      ...mapSdkMessage(
        {
          type: 'stream_event',
          parent_tool_use_id: null,
          event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } },
        },
        s,
      ),
      ...mapSdkMessage(
        {
          type: 'assistant',
          parent_tool_use_id: null,
          message: {
            content: [
              { type: 'text', text: 'Hello ' }, // repeats the delta — must not double
              { type: 'tool_use', id: 't1', name: 'Write', input: { file_path: '/x/a.md' } },
            ],
          },
        },
        s,
      ),
      ...mapSdkMessage(
        {
          type: 'user',
          parent_tool_use_id: null,
          message: {
            content: [{ type: 'tool_result', tool_use_id: 't1', content: 'File created' }],
          },
        },
        s,
      ),
      ...mapSdkMessage(
        {
          type: 'result',
          subtype: 'success',
          is_error: false,
          duration_ms: 900,
          num_turns: 1,
          total_cost_usd: 0.01,
          usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 3 },
        },
        s,
      ),
    ];
    expect(events.map((e) => e.type)).toEqual([
      'session',
      'text',
      'tool_start',
      'tool_result',
      'step_end',
      'usage',
      'result',
      'done',
    ]);
    const done = events.find((e) => e.type === 'done') as {
      textContent: string;
      hadMutation: boolean;
    };
    expect(done.textContent).toBe('Hello ');
    expect(done.hadMutation).toBe(true);
    const tr = events.find((e) => e.type === 'tool_result') as { name: string; result: string };
    expect(tr.name).toBe('Write');
    expect(tr.result).toBe('File created');
  });

  test('unstreamed assistant text is delivered once; sub-agent traffic is skipped', () => {
    const s = newMapperState();
    const events = mapSdkMessage(
      {
        type: 'assistant',
        parent_tool_use_id: null,
        message: { content: [{ type: 'text', text: 'No deltas came first' }] },
      },
      s,
    );
    expect(events).toEqual([{ type: 'text', content: 'No deltas came first' }]);
    expect(
      mapSdkMessage(
        { type: 'assistant', parent_tool_use_id: 'task-1', message: { content: [] } },
        s,
      ),
    ).toEqual([]);
  });

  test('an error result becomes an error event before done; tool errors are prefixed', () => {
    const s = newMapperState();
    mapSdkMessage(
      {
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'x' } }],
        },
      },
      s,
    );
    const [tr] = mapSdkMessage(
      {
        type: 'user',
        parent_tool_use_id: null,
        message: {
          content: [{ type: 'tool_result', tool_use_id: 'b1', is_error: true, content: 'nope' }],
        },
      },
      s,
    );
    expect(tr).toEqual({ type: 'tool_result', id: 'b1', name: 'Bash', result: 'Error: nope' });
    expect(s.hadMutation).toBe(false);
    const events = mapSdkMessage(
      { type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['boom'] },
      s,
    );
    expect(events.map((e) => e.type)).toEqual(['usage', 'error', 'result', 'done']);
    expect((events[1] as { message: string }).message).toBe('boom');
  });

  test('tool descriptions and result text', () => {
    expect(describeToolUse('Bash', { command: 'npm test' })).toBe('npm test');
    expect(describeToolUse('WebFetch', { url: 'https://x' })).toBe('https://x');
    expect(describeToolUse('Edit', { file_path: '/a/b.ts' })).toBe('/a/b.ts');
    expect(
      toolResultText({
        type: 'tool_result',
        content: [{ type: 'text', text: 'a' }, { type: 'image' }],
      }),
    ).toBe('a\n[image]');
  });
});
