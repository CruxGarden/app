import { beforeEach, expect, it } from 'vitest';
import { createCruxStore } from './cruxStore';
import { createUIStore } from './uiStore';
import { getServices, initServices } from '@/services';
import { isExcludedFromPublish } from '@/services/shared-conversation';
import type { ChatMessage } from '@/api/types';

beforeEach(async () => {
  await initServices();
});

it('persists the conversation switch and per-message choices with the crux (CR06)', async () => {
  const crux = await getServices().crux.create({ title: 'Private by default' });
  const messages: ChatMessage[] = [
    { role: 'user', content: 'my address is 1 Elm St', timestamp: '2026-10-05T01:00Z' },
    { role: 'assistant', content: 'Noted: 1 Elm St.', timestamp: '2026-10-05T01:01Z' },
    { role: 'user', content: 'Thanks', timestamp: '2026-10-05T01:02Z' },
  ];
  const store = createCruxStore(createUIStore());
  store.setState({ crux, messages, messageSegmentStart: 0 });

  await store.getState().setConversationPublished(true);
  await store.getState().setMessageExcludedFromPublish(store.getState().messages[0]!, true);

  const saved = await getServices().crux.findById(crux.id);
  expect(saved.meta?.conversationPublished).toBe(true);
  const savedMessages = saved.meta?.messages as ChatMessage[];
  expect(savedMessages[0]!.excludedFromPublish).toBe(true);
  expect(isExcludedFromPublish(savedMessages[0]!, saved)).toBe(true);
  // The reply quotes the person, so it leaves with their message; the next turn stays.
  expect(isExcludedFromPublish(savedMessages[1]!, saved)).toBe(true);
  expect(isExcludedFromPublish(savedMessages[2]!, saved)).toBe(false);

  await store.getState().setMessageExcludedFromPublish(store.getState().messages[0]!, false);
  const again = await getServices().crux.findById(crux.id);
  const againMessages = again.meta?.messages as ChatMessage[];
  expect(isExcludedFromPublish(againMessages[0]!, again)).toBe(false);
  expect(isExcludedFromPublish(againMessages[1]!, again)).toBe(false);

  // A reply alone is just that reply.
  await store.getState().setMessageExcludedFromPublish(store.getState().messages[1]!, true);
  const reply = await getServices().crux.findById(crux.id);
  const replyMessages = reply.meta?.messages as ChatMessage[];
  expect(isExcludedFromPublish(replyMessages[0]!, reply)).toBe(false);
  expect(isExcludedFromPublish(replyMessages[1]!, reply)).toBe(true);
});
