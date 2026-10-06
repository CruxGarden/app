import { describe, expect, it } from 'vitest';
import type { Artifact, ChatMessage, Crux } from '@/api/types';
import { cruxUpsertFields, publishPipeline, publishWarningsOf, type PublishDeps } from './publish';
import {
  exclusionPatch,
  isExcludedFromPublish,
  shareChoiceTargets,
  sharedConversationFingerprint,
  messageShareKey,
  publicConversationState,
  sharedConversation,
} from './shared-conversation';

const messages: ChatMessage[] = [
  {
    role: 'user',
    content: 'Make me a page. My phone is 555-0100.',
    timestamp: '2026-10-01T10:00Z',
  },
  { role: 'assistant', content: 'Here is your page.', timestamp: '2026-10-01T10:01Z' },
  { role: 'user', content: 'Add a footer.', timestamp: '2026-10-01T10:02Z' },
];

function crux(meta: Record<string, unknown> = {}): Crux {
  return {
    id: 'crux-1',
    slug: 'page',
    title: 'Page',
    type: 'workspace',
    visibility: 'private',
    discoverable: true,
    meta: { messages, ...meta },
  } as Crux;
}

function deps() {
  const sent: Record<string, unknown>[] = [];
  const value: PublishDeps = {
    api: {
      exists: async () => false,
      create: async (input) => {
        sent.push(input);
        return crux() as Crux;
      },
      update: async (_id, input) => {
        sent.push(input);
        return crux() as Crux;
      },
      publish: async (id) =>
        ({
          ...crux(),
          id,
          meta: { publishedAt: '2026-10-05T00:00:00Z', publishedVersion: 1 },
          warnings: [
            {
              kind: 'storage_soft_limit',
              message: 'You have used 85% of your storage.',
              usedBytes: 85,
              limitBytes: 100,
            },
          ],
        }) as unknown as Crux,
      unpublish: async () => crux(),
      syncTags: async () => ({}),
    },
    local: {
      updateCruxMeta: async () => ({}),
      downloadBlob: async () => new Blob(['<h1>hi</h1>'], { type: 'text/html' }),
    },
    site: { isSiteCrux: () => false, buildForPublish: async () => [] },
  };
  return { deps: value, sent };
}

const page = [
  {
    id: 'a1',
    type: 'artifact',
    filename: 'index.html',
    mimeType: 'text/html',
    fingerprint: 'f1',
    meta: { path: 'index.html' },
  } as Artifact,
];

describe('shared conversation (CR06)', () => {
  it('keeps the conversation private unless the creator turned it on', () => {
    const fields = cruxUpsertFields(crux(), messages);
    const meta = fields.meta as Record<string, unknown>;
    expect(meta.conversationPublished).toBe(false);
    expect(meta).not.toHaveProperty('messages');
  });

  it('never leaks the stored segment transcript when no messages are handed in', () => {
    const meta = cruxUpsertFields(crux()).meta as Record<string, unknown>;
    expect(meta).not.toHaveProperty('messages');
  });

  it('shares the conversation without messages that were left out', () => {
    const on = crux({
      conversationPublished: true,
      ...exclusionPatch(crux(), messages[0]!, true),
    });
    const meta = cruxUpsertFields(on, messages).meta as Record<string, unknown>;
    expect(meta.conversationPublished).toBe(true);
    expect((meta.messages as ChatMessage[]).map((m) => m.content)).toEqual([
      'Here is your page.',
      'Add a footer.',
    ]);
    // The per-message choices are private working state.
    expect(meta).not.toHaveProperty('conversationExclusions');
  });

  it('honours a flag on the message, and the crux override wins', () => {
    const flagged = { ...messages[2]!, excludedFromPublish: true };
    const base = crux({ conversationPublished: true });
    expect(isExcludedFromPublish(flagged, base)).toBe(true);
    const included = crux({ conversationPublished: true, ...exclusionPatch(base, flagged, false) });
    expect(isExcludedFromPublish(flagged, included)).toBe(false);
    expect(sharedConversation(included, [flagged])).toHaveLength(1);
  });

  it('identifies a message by role, time and text', () => {
    expect(messageShareKey(messages[0]!)).not.toBe(messageShareKey(messages[2]!));
    expect(messageShareKey(messages[0]!)).toBe(messageShareKey({ ...messages[0]! }));
  });

  it('first share sends no messages; a shared one sends only included messages', async () => {
    const first = deps();
    await publishPipeline(crux(), page, { deps: first.deps, messages });
    expect(first.sent[0]!.meta).toMatchObject({ conversationPublished: false });
    expect(first.sent[0]!.meta).not.toHaveProperty('messages');

    const second = deps();
    const on = crux({
      conversationPublished: true,
      ...exclusionPatch(crux(), messages[1]!, true),
    });
    await publishPipeline(on, page, { deps: second.deps, messages });
    expect(
      ((second.sent[0]!.meta as Record<string, unknown>).messages as ChatMessage[]).length,
    ).toBe(2);
  });

  it('reports soft-limit warnings and keeps them out of the stored crux', async () => {
    const { deps: d } = deps();
    let seen: unknown[] = [];
    const result = await publishPipeline(crux(), page, {
      deps: d,
      onWarnings: (warnings) => (seen = warnings),
    });
    expect(seen).toEqual([
      {
        kind: 'storage_soft_limit',
        message: 'You have used 85% of your storage.',
        usedBytes: 85,
        limitBytes: 100,
      },
    ]);
    expect(result).not.toHaveProperty('warnings');
  });

  it('reads warnings defensively', () => {
    expect(publishWarningsOf(undefined, {}, { warnings: 'nope' })).toEqual([]);
    expect(
      publishWarningsOf(
        { warnings: [{ kind: 'bandwidth_soft_limit', message: 'a' }] },
        { warnings: [{ kind: 'bandwidth_soft_limit', message: 'b' }, { kind: 1 }] },
      ),
    ).toEqual([{ kind: 'bandwidth_soft_limit', message: 'b' }]);
  });

  it('tells the public page when the creator kept the conversation private', () => {
    expect(publicConversationState({ conversationPublished: false }, 4)).toBe('private');
    expect(publicConversationState({}, 0)).toBe('private');
    expect(publicConversationState({ conversationPublished: true }, 2)).toBe('shared');
  });

  it("a person's message carries its replies; a reply carries only itself", () => {
    expect(shareChoiceTargets(messages, messages[0]!)).toEqual([messages[0], messages[1]]);
    expect(shareChoiceTargets(messages, messages[1]!)).toEqual([messages[1]]);
    expect(shareChoiceTargets(messages, messages[2]!)).toEqual([messages[2]]);
    const patch = exclusionPatch(crux(), shareChoiceTargets(messages, messages[0]!), true);
    const shared = crux({ conversationPublished: true, ...patch });
    expect(isExcludedFromPublish(messages[1]!, shared)).toBe(true);
    expect(isExcludedFromPublish(messages[2]!, shared)).toBe(false);
  });

  it('fingerprints what would be shared, so a conversation change is an unpublished change', () => {
    expect(sharedConversationFingerprint(crux(), messages)).toBe('private');
    const on = crux({ conversationPublished: true });
    const before = sharedConversationFingerprint(on, messages);
    expect(before).not.toBe('private');
    expect(sharedConversationFingerprint(on, messages)).toBe(before);
    const leftOut = crux({
      conversationPublished: true,
      ...exclusionPatch(on, messages[2]!, true),
    });
    expect(sharedConversationFingerprint(leftOut, messages)).not.toBe(before);
    expect(sharedConversationFingerprint(on, [...messages, messages[1]!])).not.toBe(before);
  });
});
