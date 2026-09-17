// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  AgentRuntimeRegistry,
  AgentToolBroker,
  type AgentRuntime,
} from '../../electron/src/agent-runtime';
import { mapCodexNotification, newCodexState } from '../../electron/src/codex-events';
import type { AgentToolRequest } from '../../electron/src/bridge';

function runtime(id: string): AgentRuntime {
  return {
    id,
    status: vi.fn(async () => ({ installed: true, path: id, version: 'test', reason: null })),
    start: vi.fn(async () => {}),
    interrupt: vi.fn(async () => {}),
    answer: vi.fn(),
    stopAll: vi.fn(async () => {}),
  };
}
const options = {
  provider: 'codex',
  runId: 'run',
  cruxId: 'crux',
  cwd: '/tmp/project',
  prompt: 'Hello',
};

describe('agent runtime registry', () => {
  it('routes a second provider without borrowing Claude sessions or runtime calls', async () => {
    const claude = runtime('claude-code'),
      codex = runtime('codex');
    const registry = new AgentRuntimeRegistry([claude, codex]);
    await registry.start({ ...options, sessionId: 'codex-session' });
    expect(codex.start).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'codex-session' }),
    );
    expect(claude.start).not.toHaveBeenCalled();
    expect(await registry.status(false, 'codex')).toMatchObject({ path: 'codex' });
    await expect(registry.start({ ...options, provider: 'missing' })).rejects.toThrow(
      'Unsupported',
    );
  });
  it('refuses competing writers and routes Stop to the active runtime', async () => {
    const codex = runtime('codex');
    let finish!: () => void;
    vi.mocked(codex.start).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const registry = new AgentRuntimeRegistry([codex]);
    const running = registry.start(options);
    await expect(registry.start({ ...options, runId: 'other' })).rejects.toThrow('already working');
    await registry.interrupt('run');
    expect(codex.interrupt).toHaveBeenCalledWith('run');
    finish();
    await running;
    await registry.interrupt('run');
    expect(codex.interrupt).toHaveBeenCalledTimes(1);
  });
});

describe('private tool broker', () => {
  it('correlates interleaved responses and rejects stopped requests including late replies', async () => {
    const sent: AgentToolRequest[] = [];
    const broker = new AgentToolBroker((request) => {
      sent.push(request);
      return true;
    });
    const first = new AbortController(),
      second = new AbortController();
    const a = broker.call(options, 'garden_search_tools', {}, first.signal);
    const b = broker.call({ ...options, runId: 'second' }, 'garden_call_tool', {}, second.signal);
    broker.answer(sent[1]!.requestId, { content: [{ type: 'text', text: 'second' }] });
    await expect(b).resolves.toMatchObject({ content: [{ text: 'second' }] });
    const aborted = expect(a).rejects.toThrow('stopped');
    first.abort();
    await aborted;
    broker.answer(sent[0]!.requestId, { content: [] });
    await expect(broker.call(options, 'garden_call_tool', {}, first.signal)).rejects.toThrow(
      'stopped',
    );
  });
});

describe('Codex event projection', () => {
  it('does not duplicate streamed or repeated completed messages', () => {
    const state = newCodexState();
    expect(
      mapCodexNotification('item/agentMessage/delta', { itemId: 'msg', delta: 'Hello' }, state),
    ).toEqual([{ type: 'text', content: 'Hello' }]);
    const complete = { item: { type: 'agentMessage', id: 'msg', text: 'Hello' } };
    expect(mapCodexNotification('item/completed', complete, state)).toEqual([]);
    expect(mapCodexNotification('item/completed', complete, state)).toEqual([]);
    expect(state.text).toBe('Hello');
  });
  it('retains partial command mutations on failure and closes each tool once', () => {
    const state = newCodexState();
    const complete = {
      item: {
        type: 'commandExecution',
        id: 'cmd',
        command: 'build',
        status: 'failed',
        aggregatedOutput: 'failed after writing',
      },
    };
    const events = mapCodexNotification('item/completed', complete, state);
    expect(events.map((event) => event.type)).toEqual(['tool_start', 'tool_result', 'step_end']);
    expect(state.hadMutation).toBe(true);
    expect(mapCodexNotification('item/completed', complete, state)).toEqual([]);
  });
});

it('counts new usage once across repeated updates and excludes previous turns', () => {
  const state = newCodexState();
  const update = (input: number, output: number, lastInput: number, lastOutput: number) =>
    mapCodexNotification(
      'thread/tokenUsage/updated',
      {
        tokenUsage: {
          total: { inputTokens: input, outputTokens: output },
          last: { inputTokens: lastInput, outputTokens: lastOutput },
        },
      },
      state,
    );
  update(1100, 110, 100, 10);
  update(1100, 110, 100, 10);
  update(1250, 130, 150, 20);
  expect(state.usage).toEqual({ inputTokens: 250, outputTokens: 30, cachedInputTokens: 0 });
});
it('keeps media out of the Collaboration text while retaining a readable tool result', () => {
  const state = newCodexState();
  const result = mapCodexNotification(
    'item/completed',
    {
      item: {
        type: 'dynamicToolCall',
        id: 'image',
        tool: 'garden_call_tool',
        status: 'completed',
        contentItems: [
          { type: 'inputImage', imageUrl: 'data:image/png;base64,private-pixels' },
          { type: 'inputText', text: 'Rendered the scene' },
        ],
      },
    },
    state,
  );
  expect(JSON.stringify(result)).not.toContain('private-pixels');
  expect(JSON.stringify(result)).toContain('Rendered the scene');
});
