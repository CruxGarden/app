/**
 * The shared conversation (CR06): what "How was this made?" shows visitors.
 *
 * A Crux's Collaboration is private unless its creator turns on "Include the
 * conversation" in Share (`meta.conversationPublished === true`). Even then a
 * message can be left out. The per-message choice is recorded twice: on the
 * message itself (`excludedFromPublish`, travels with the current segment) and
 * in the crux's `conversationExclusions` map, which wins — messages in earlier
 * Growth segments live in immutable versions and are only reachable there.
 *
 * Pure functions, so publication shaping is tested without a store or a DOM.
 */
import type { ChatMessage, Crux } from '@/api/types';

/** True only when the creator explicitly chose to share the conversation. */
export function conversationShared(crux: Pick<Crux, 'meta'> | null | undefined): boolean {
  return crux?.meta?.conversationPublished === true;
}

/** A stable identity for a message without an id: role, time and the text's hash. */
export function messageShareKey(message: Pick<ChatMessage, 'role' | 'timestamp' | 'content'>) {
  let hash = 5381;
  const text = message.content ?? '';
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return `${message.role}|${message.timestamp ?? ''}|${(hash >>> 0).toString(36)}`;
}

function exclusions(crux: Pick<Crux, 'meta'> | null | undefined): Record<string, boolean> {
  const raw = crux?.meta?.conversationExclusions;
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, boolean>)
    : {};
}

/** Whether this message stays out of the shared conversation. */
export function isExcludedFromPublish(
  message: ChatMessage,
  crux: Pick<Crux, 'meta'> | null | undefined,
): boolean {
  const map = exclusions(crux);
  const key = messageShareKey(message);
  if (key in map) return map[key] === true;
  return message.excludedFromPublish === true;
}

/**
 * The messages one choice covers. Replies routinely quote what the person
 * wrote, so leaving out a person's message leaves out its whole turn: the
 * message and every reply up to the person's next message. A reply alone is
 * just that reply.
 */
export function shareChoiceTargets(messages: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const at = messages.indexOf(message);
  if (at === -1 || message.role !== 'user') return [message];
  const turn = [message];
  for (const next of messages.slice(at + 1)) {
    if (next.role === 'user') break;
    turn.push(next);
  }
  return turn;
}

/** The crux meta patch that records the choice for these messages. */
export function exclusionPatch(
  crux: Pick<Crux, 'meta'>,
  messages: ChatMessage | ChatMessage[],
  excluded: boolean,
): { conversationExclusions: Record<string, boolean> } {
  const next = { ...exclusions(crux) };
  for (const message of Array.isArray(messages) ? messages : [messages])
    next[messageShareKey(message)] = excluded;
  return { conversationExclusions: next };
}

/**
 * The conversation exactly as it would be shared: null when the creator keeps
 * it private, otherwise the Person/Collaborator messages that were not left out.
 */
export function sharedConversation(
  crux: Pick<Crux, 'meta'>,
  messages: ChatMessage[] | undefined,
): ChatMessage[] | null {
  if (!conversationShared(crux)) return null;
  return (messages ?? []).filter(
    (message) =>
      !!message &&
      (message.role === 'user' || message.role === 'assistant') &&
      !isExcludedFromPublish(message, crux),
  );
}

/** How the public page should present a Crux's conversation. */
export function publicConversationState(
  meta: Record<string, unknown> | null | undefined,
  transcriptLength: number,
): 'shared' | 'private' {
  if (meta?.conversationPublished === false) return 'private';
  return transcriptLength > 0 ? 'shared' : 'private';
}

/** The Person/Collaborator messages a public page can show. */
export function publicTranscript(crux: Pick<Crux, 'meta'> | null | undefined): ChatMessage[] {
  const raw = crux?.meta?.messages;
  return Array.isArray(raw)
    ? raw.filter(
        (message) =>
          !!message &&
          typeof message.content === 'string' &&
          ['user', 'assistant'].includes(message.role),
      )
    : [];
}

/**
 * A short fingerprint of exactly what would be shared ("private" when nothing
 * is). Recorded at publish so the Share pane notices a conversation change —
 * turning it on, or leaving a message out after sharing — even when no file
 * changed. Change detection only; not a security boundary.
 */
export function sharedConversationFingerprint(
  crux: Pick<Crux, 'meta'>,
  messages: ChatMessage[] | undefined,
): string {
  const shared = sharedConversation(crux, messages);
  if (!shared) return 'private';
  const text = JSON.stringify(shared.map((m) => [m.role, m.timestamp ?? null, m.content]));
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${shared.length}:${text.length}:${hash.toString(16)}`;
}
