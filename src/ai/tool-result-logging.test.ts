import { afterEach, expect, it, vi } from 'vitest';
import * as platform from '@/lib/platform';
import { runGardenTool } from './garden-tools';
import { runWorkspaceTool } from './workspace-tools';

const privateResult = 'fixture-private-result-do-not-log';
vi.mock('@/services', () => ({
  getServices: () => ({
    crux: { findById: async () => ({ id: 'fixture-crux', title: 'Private work' }) },
    artifact: {
      findByResource: async () => [{ type: 'artifact', filename: 'private.txt', encoding: 'text' }],
      downloadBlob: async () => new Blob(['fixture-private-result-do-not-log']),
    },
  }),
}));
vi.mock('@/services/functions-runner', () => ({
  emitLocal: vi.fn(),
  callLocalFunction: async () => ({
    status: 200,
    ms: 1,
    body: 'fixture-private-result-do-not-log',
    logs: [],
  }),
}));
afterEach(() => vi.restoreAllMocks());

it.each([false, true])(
  'tool results stay in the conversation; console tracing requires the scripted test model (%s)',
  async (scripted) => {
    vi.spyOn(platform, 'isAiMock').mockReturnValue(scripted);
    const consoleOutput = vi.spyOn(console, 'info').mockImplementation(() => {});
    expect(
      await runGardenTool('read_garden_file', { cruxId: 'fixture-crux', path: 'private.txt' }),
    ).toBe(privateResult);
    expect(
      await runWorkspaceTool('test_function', { name: 'private' }, { cruxId: 'fixture-crux' }),
    ).toContain(privateResult);
    const logs = consoleOutput.mock.calls.flat().join('\n');
    if (scripted) {
      expect(logs).toContain('[garden-tool]');
      expect(logs).toContain('[workspace-tool]');
      expect(logs).toContain(privateResult);
    } else expect(logs).not.toContain(privateResult);
  },
);
