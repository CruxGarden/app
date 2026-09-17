import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  workspace: { phase: 'ready', data: { getState: vi.fn() }, operations: new Set() },
  current: null as unknown,
}));
vi.mock('@/stores/workspaceRegistry', () => ({ getWorkspace: () => mocks.current }));
vi.mock('@/ai/tools', () => ({
  createToolExecutor: () => mocks.execute,
  defaultToolDefinitions: () => [
    { name: 'write_file', description: 'Write an artifact', input_schema: { type: 'object' } },
    { name: 'delegate', description: 'Workers', input_schema: {} },
  ],
  didMutate: (name: string) => name === 'write_file',
}));
import { createHostedAgentTools } from './hosted-agent-tools';
const request = {
  requestId: 'req',
  runId: 'run',
  cruxId: 'crux',
  name: 'garden_call_tool',
  input: { name: 'write_file', input: { path: 'note.md', content: 'hello' } },
};
beforeEach(() => {
  mocks.current = mocks.workspace;
  mocks.execute.mockReset().mockResolvedValue('Wrote note.md');
  mocks.workspace.data.getState.mockReturnValue({
    refreshArtifacts: vi.fn(async () => {}),
    requestDeleteApproval: vi.fn(),
  });
});
it('requires discovery, uses the existing executor, and reports mutation without recording a second turn', async () => {
  const call = createHostedAgentTools('crux', 'codex', new AbortController().signal);
  expect((await call(request)).isError).toBe(true);
  expect(mocks.execute).not.toHaveBeenCalled();
  const result = await call({
    ...request,
    name: 'garden_search_tools',
    input: { query: 'write_file' },
  });
  expect(result.content).toEqual([
    expect.objectContaining({ text: expect.stringContaining('write_file') }),
  ]);
  expect(await call(request)).toMatchObject({ hadMutation: true, isError: false });
  expect(mocks.execute).toHaveBeenCalledWith('write_file', { path: 'note.md', content: 'hello' });
  expect(mocks.workspace.operations.size).toBe(0);
});
describe('run lifetime', () => {
  it('rejects another Working Copy and a replaced workspace', async () => {
    const call = createHostedAgentTools('crux', 'codex', new AbortController().signal);
    expect((await call({ ...request, cruxId: 'other' })).isError).toBe(true);
    mocks.current = { ...mocks.workspace };
    expect((await call(request)).isError).toBe(true);
  });
  it('does not dispatch a queued call after Stop', async () => {
    const controller = new AbortController();
    const call = createHostedAgentTools('crux', 'codex', controller.signal);
    await call({ ...request, name: 'garden_search_tools', input: { query: 'write_file' } });
    let finish!: (value: string) => void;
    mocks.execute.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = call(request);
    await Promise.resolve();
    const queued = call(request);
    controller.abort();
    finish('Wrote note.md');
    await first;
    expect((await queued).isError).toBe(true);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
});
