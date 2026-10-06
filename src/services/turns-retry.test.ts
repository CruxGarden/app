import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationEvent } from '@/ai/engine';
import type { NormalizedMessage } from '@/services/types';
import type { ChatMessage } from '@/api/types';

// The engine is the only thing replaced: each call records the transcript the
// model was shown and plays the next scripted run. No provider, no network.
const runs: ConversationEvent[][] = [];
const seen: NormalizedMessage[][] = [];
vi.mock('@/ai/engine', async (original) => ({
  ...(await original<typeof import('@/ai/engine')>()),
  runConversation: (_key: string, _crux: string, messages: NormalizedMessage[]) => {
    seen.push(structuredClone(messages));
    const events = runs.shift() ?? [];
    return (async function* () {
      for (const event of events) yield event;
    })();
  },
}));
vi.mock('@/ai/keys', async (original) => ({
  ...(await original<typeof import('@/ai/keys')>()),
  getApiKey: async () => 'test-key',
  cruxModel: () => 'claude-opus-5-5',
}));
vi.mock('@/hooks/useAiEnabled', () => ({ aiEnabledNow: () => true, useAiEnabled: () => true }));
vi.mock('@/services/cues', () => ({ playCue: async () => {}, duckAudio: async () => {} }));
vi.mock('./edit-history', async (original) => ({
  ...(await original<typeof import('./edit-history')>()),
  captureEditCheckpoint: async () => {},
}));

import { getServices, initServices } from '@/services';
import { createCruxStore } from '@/stores/cruxStore';
import { createUIStore } from '@/stores/uiStore';
import { newTurnJob, finishJob } from './turn-jobs';
import { retryableRequest, turnsFor } from './turns';

const FAILURE: ConversationEvent[] = [
  { type: 'error', message: 'Anthropic refused this key.', detail: 'invalid x-api-key' },
];
const ANSWER: ConversationEvent[] = [
  { type: 'text', content: 'Here it is.' },
  { type: 'step_end', index: 0 },
  { type: 'done', textContent: 'Here it is.', hadMutation: false },
];

async function workspace() {
  const crux = await getServices().crux.create({ title: 'Retry' });
  const data = createCruxStore(createUIStore(crux.id));
  await data.getState().loadCrux(crux.id);
  return { data, turns: turnsFor(data) };
}

const people = (messages: ChatMessage[]) => messages.filter((m) => m.role === 'user');

beforeEach(async () => {
  await initServices();
  runs.length = 0;
  seen.length = 0;
});
afterEach(() => vi.restoreAllMocks());

describe('Try again on a failed turn', () => {
  it('runs the same request again without a second copy of the message', async () => {
    const { data, turns } = await workspace();
    runs.push(FAILURE, ANSWER);

    await turns.submitTurn('Make a page about moss');
    await turns.drain();
    expect(data.getState().turnJob?.status).toBe('failed');
    expect(data.getState().turnJob?.errorDetail).toBe('invalid x-api-key');
    expect(turns.canRetry()).toBe(true);
    expect(data.getState().messages.map((m) => m.role)).toEqual(['user', 'assistant']);

    await turns.retryTurn();
    await turns.drain();
    const { messages, turnJob } = data.getState();
    expect(turnJob?.status).toBe('done');
    expect(people(messages).map((m) => m.content)).toEqual(['Make a page about moss']);
    // The reply that only carried the error is replaced by the answer.
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[1]!.content).toBe('Here it is.');
    // Both attempts showed the model the same single request, ending on the person's words.
    expect(seen).toHaveLength(2);
    expect(seen[1]).toEqual(seen[0]);
    expect(seen[1]!.at(-1)).toMatchObject({ role: 'user', content: 'Make a page about moss' });
    expect(turns.canRetry()).toBe(false);
  });

  it('keeps a failed reply that did work, and continues from its tool results', async () => {
    const { data, turns } = await workspace();
    runs.push(
      [
        { type: 'tool_start', name: 'list_files', id: 't1', input: {} },
        { type: 'tool_result', name: 'list_files', id: 't1', result: 'No files yet.' },
        { type: 'step_end', index: 0 },
        ...FAILURE,
      ],
      ANSWER,
    );
    await turns.submitTurn('Look around');
    await turns.drain();
    await turns.retryTurn();
    await turns.drain();
    const { messages } = data.getState();
    expect(people(messages)).toHaveLength(1);
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'assistant']);
    expect(messages[1]!.toolCalls).toHaveLength(1);
    expect(seen[1]!.at(-1)!.role).toBe('user'); // the tool results
  });

  it('does nothing while another turn is running, and never queues', async () => {
    const { data, turns } = await workspace();
    runs.push(FAILURE);
    await turns.submitTurn('First');
    await turns.drain();
    data
      .getState()
      .setTurnJob({ ...newTurnJob(data.getState().crux!.id, 'Other'), status: 'running' });
    expect(turns.canRetry()).toBe(false);
    await turns.retryTurn();
    expect(seen).toHaveLength(1);
    expect(data.getState().turnQueue).toEqual([]);
    expect(people(data.getState().messages)).toHaveLength(1);
  });

  it('respects a Task that can no longer be written', async () => {
    const { data, turns } = await workspace();
    runs.push(FAILURE, ANSWER);
    await turns.submitTurn('First');
    await turns.drain();
    const copies = await import('./working-copies');
    vi.spyOn(copies, 'assertCopyWritable').mockRejectedValueOnce(
      new Error('This task is archived.'),
    );
    await expect(turns.retryTurn()).rejects.toThrow('This task is archived.');
    expect(seen).toHaveLength(1);
    expect(data.getState().turnJob?.status).toBe('failed');
    // The refusal leaves the retry available once the Task is writable again.
    await turns.retryTurn();
    await turns.drain();
    expect(data.getState().turnJob?.status).toBe('done');
  });
});

describe('retryableRequest', () => {
  const pf = 'persona-a';
  const failed = finishJob(newTurnJob('c', 'Make a page'), 'failed', { error: 'x' });
  const person = (content: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
    role: 'user',
    content,
    personaFingerprint: pf,
    ...extra,
  });

  it('finds the message that started the failed job', () => {
    expect(retryableRequest(failed, [person('Make a page')], pf)).toBe(0);
    expect(
      retryableRequest(
        failed,
        [person('Earlier'), person('Make a page'), { role: 'assistant', content: '*Error*' }],
        pf,
      ),
    ).toBe(1);
  });

  it.each([
    [
      'a job that did not fail',
      finishJob(newTurnJob('c', 'Make a page'), 'done'),
      [person('Make a page')],
    ],
    [
      'a job stopped by the person',
      finishJob(newTurnJob('c', 'Make a page'), 'interrupted'),
      [person('Make a page')],
    ],
    ['no job', null, [person('Make a page')]],
    ['a later, different message', failed, [person('Make a page'), person('Something else')]],
    [
      "the check's own message",
      failed,
      [person('Make a page'), person('Check found: x', { origin: 'check' })],
    ],
    [
      'a message addressed to another Persona',
      failed,
      [person('Make a page', { personaFingerprint: 'persona-b' })],
    ],
    ['an empty transcript', failed, []],
  ] as const)('offers nothing for %s', (_name, job, messages) => {
    expect(retryableRequest(job, [...messages], pf)).toBeNull();
  });

  it('offers nothing for a failed check', () => {
    const check = { ...failed, check: { status: 'checking' } } as unknown as typeof failed;
    expect(retryableRequest(check, [person('Make a page')], pf)).toBeNull();
  });
});
