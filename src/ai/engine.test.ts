/**
 * The eval harness (AI-COLLABORATION-PLAN Phase A6): golden tasks run through
 * the REAL engine + REAL tool executor + REAL service layer, with only the
 * language model mocked (injected via ConversationOptions.languageModel).
 * Everything a live turn does happens here except the network.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import type { LanguageModelV4StreamPart, LanguageModelV4Usage } from '@ai-sdk/provider';
import { runConversation, type ConversationEvent } from './engine';
import { createToolExecutor } from './tools';
import { initServices, getServices } from '@/services';
import type { NormalizedMessage } from '@/services/types';

// ── Mock-stream helpers ─────────────────────────────────────────────────────

const USAGE: LanguageModelV4Usage = {
  inputTokens: { total: 1000, noCache: 200, cacheRead: 800, cacheWrite: 0 },
  outputTokens: { total: 50, text: 50, reasoning: 0 },
};

function toolCallStep(
  id: string,
  toolName: string,
  input: Record<string, unknown>,
): { stream: ReadableStream<LanguageModelV4StreamPart> } {
  return {
    stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
      { type: 'stream-start', warnings: [] },
      { type: 'tool-call', toolCallId: id, toolName, input: JSON.stringify(input) },
      { type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage: USAGE },
    ]),
  };
}

function textStep(text: string): { stream: ReadableStream<LanguageModelV4StreamPart> } {
  return {
    stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
      { type: 'stream-start', warnings: [] },
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: text },
      { type: 'text-end', id: 't1' },
      { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: USAGE },
    ]),
  };
}

async function collect(gen: AsyncGenerator<ConversationEvent>): Promise<ConversationEvent[]> {
  const events: ConversationEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

const userTurn = (content: string): NormalizedMessage =>
  ({ role: 'user', content }) as NormalizedMessage;

function run(
  cruxId: string,
  mock: MockLanguageModelV4,
  messages: NormalizedMessage[],
  executeToolFn = createToolExecutor(cruxId),
  signal?: AbortSignal,
) {
  return runConversation('test-key', cruxId, messages, 'claude-sonnet-5', executeToolFn, signal, {
    languageModel: mock,
  });
}

// ── Golden tasks ────────────────────────────────────────────────────────────

describe('engine golden tasks (mock provider)', () => {
  let cruxId: string;

  beforeEach(async () => {
    await initServices('local');
    const { crux } = getServices();
    const created = await crux.create({ title: 'Golden' });
    cruxId = created.id;
  });

  it('create: a write_file tool loop creates the real file and reports mutation', async () => {
    const mock = new MockLanguageModelV4({
      doStream: [
        toolCallStep('c1', 'write_file', { path: 'index.html', content: '<h1>Hi</h1>' }),
        textStep('Created your page.'),
      ],
    });

    const events = await collect(run(cruxId, mock, [userTurn('Make me a page')]));

    const start = events.find((e) => e.type === 'tool_start');
    expect(start).toMatchObject({ name: 'write_file', input: { path: 'index.html' } });
    const result = events.find((e) => e.type === 'tool_result');
    expect(result).toMatchObject({ result: 'Created file: index.html' });
    const done = events.find((e) => e.type === 'done');
    expect(done).toMatchObject({ hadMutation: true, textContent: 'Created your page.' });

    // The file is really there
    const { artifact } = getServices();
    const artifacts = await artifact.findByResource('crux', cruxId);
    expect(artifacts.some((a) => (a.meta?.path || a.filename) === 'index.html')).toBe(true);
  });

  it('sends the A2 prompt shape over the wire: cached system prefix + workspace_context user block', async () => {
    const mock = new MockLanguageModelV4({ doStream: [textStep('Hello!')] });
    await collect(run(cruxId, mock, [userTurn('hi')]));

    const prompt = mock.doStreamCalls[0]!.prompt;
    const system = prompt.find((m) => m.role === 'system');
    expect(system).toBeDefined();
    expect(String(system!.content)).toContain('## Identity');
    // The volatile state lives in the user block, never the cached prefix
    expect(String(system!.content)).not.toContain('## Current Files');

    const firstUser = prompt.find((m) => m.role === 'user');
    const firstUserText = JSON.stringify(firstUser!.content);
    expect(firstUserText).toContain('<workspace_context>');
    expect(firstUserText).toContain('Current Files');
  });

  it('recover-from-failed-edit: enforcement error → read → retry succeeds (multi-round)', async () => {
    const { artifact } = getServices();
    await artifact.create({
      resourceId: cruxId,
      resourceType: 'crux',
      content: 'const a = 1;',
      mimeType: 'text/javascript',
      meta: { path: 'app.js' },
    });

    const edit = { path: 'app.js', old_string: 'const a = 1;', new_string: 'const a = 2;' };
    const mock = new MockLanguageModelV4({
      doStream: [
        toolCallStep('c1', 'edit_file', edit), // blocked: not read yet
        toolCallStep('c2', 'read_file', { path: 'app.js' }),
        toolCallStep('c3', 'edit_file', edit), // succeeds
        textStep('Fixed.'),
      ],
    });

    const events = await collect(run(cruxId, mock, [userTurn('Change a to 2')]));

    const results = events.filter((e) => e.type === 'tool_result');
    expect(results[0]!.result).toContain('read_file'); // the enforcement error
    expect(results[1]!.result).toBe('const a = 1;'); // the read
    expect(results[2]!.result).toBe('Edited file: app.js'); // the retry
    expect(events.find((e) => e.type === 'done')).toMatchObject({ hadMutation: true });

    const updated = await artifact.findByResource('crux', cruxId);
    const file = updated.find((a) => (a.meta?.path || a.filename) === 'app.js')!;
    expect(await artifact.readContent(file.id)).toBe('const a = 2;');
  });

  it('image gen: generate_image flows through the loop and counts as a mutation', async () => {
    const mock = new MockLanguageModelV4({
      doStream: [
        toolCallStep('c1', 'generate_image', { prompt: 'a garden', path: 'images/hero.png' }),
        textStep('Saved your image.'),
      ],
    });
    // Stub executor: image generation itself needs live keys; the loop contract doesn't.
    const stub = async (name: string) =>
      name === 'generate_image' ? 'Generated and saved image: images/hero.png' : 'unexpected';

    const events = await collect(run(cruxId, mock, [userTurn('Make a hero image')], stub));

    expect(events.find((e) => e.type === 'tool_result')).toMatchObject({
      result: 'Generated and saved image: images/hero.png',
    });
    expect(events.find((e) => e.type === 'done')).toMatchObject({ hadMutation: true });
  });

  it('usage events carry cache reads (A2 gate, wire level)', async () => {
    const mock = new MockLanguageModelV4({ doStream: [textStep('ok')] });
    const events = await collect(run(cruxId, mock, [userTurn('hi')]));
    const usage = events.find((e) => e.type === 'usage');
    expect(usage).toMatchObject({ inputTokens: 1000, outputTokens: 50, cachedInputTokens: 800 });
  });

  it('abort: an aborted signal ends the run with neither done nor error', async () => {
    const controller = new AbortController();
    controller.abort();
    const mock = new MockLanguageModelV4({ doStream: [textStep('never')] });
    const events = await collect(
      run(cruxId, mock, [userTurn('hi')], createToolExecutor(cruxId), controller.signal),
    );
    expect(events.find((e) => e.type === 'done')).toBeUndefined();
    expect(events.find((e) => e.type === 'error')).toBeUndefined();
  });

  it('provider failure surfaces as a friendly error event, not a crash', async () => {
    const mock = new MockLanguageModelV4({
      doStream: () => {
        throw new Error('connection refused');
      },
    });
    const events = await collect(run(cruxId, mock, [userTurn('hi')]));
    const error = events.find((e) => e.type === 'error');
    expect(error && error.type === 'error' ? error.message : '').toContain('connection refused');
    expect(events.find((e) => e.type === 'done')).toBeUndefined();
  });

  it('custom-prompt chats (Keeper Console) skip workspace prompt and tools', async () => {
    const mock = new MockLanguageModelV4({ doStream: [textStep('Greetings.')] });
    const events = await collect(
      runConversation(
        'test-key',
        '',
        [userTurn('hello')],
        'claude-sonnet-5',
        undefined,
        undefined,
        {
          languageModel: mock,
          systemPrompt: 'You are the Keeper.',
          tools: [],
        },
      ),
    );
    expect(events.find((e) => e.type === 'done')).toMatchObject({ textContent: 'Greetings.' });

    const prompt = mock.doStreamCalls[0]!.prompt;
    expect(String(prompt.find((m) => m.role === 'system')!.content)).toBe('You are the Keeper.');
    expect(JSON.stringify(prompt)).not.toContain('<workspace_context>');
    expect(mock.doStreamCalls[0]!.tools ?? []).toEqual([]);
  });
});
