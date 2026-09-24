import type { ChatMessage } from '@/api/types';
import { DEFAULT_MODEL } from '@/ai/providers';
import { getServices } from './index';

export interface KeeperConversation {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMessage[];
  /** Association with an existing collection package; not the conversation owner. */
  cruxspaceId?: string;
}

/** Private payload of the Garden Crux. Messages and conversations are not graph nodes. */
export interface GardenCollaboration {
  version: 1;
  model: string;
  activeId: string | null;
  conversations: KeeperConversation[];
}

function decode(value: unknown): GardenCollaboration {
  if (value === undefined)
    return { version: 1, model: DEFAULT_MODEL, activeId: null, conversations: [] };
  const state = value as GardenCollaboration;
  if (
    !state ||
    state.version !== 1 ||
    typeof state.model !== 'string' ||
    !(state.activeId === null || typeof state.activeId === 'string') ||
    !Array.isArray(state.conversations) ||
    state.conversations.some(
      (c) =>
        !c ||
        typeof c.id !== 'string' ||
        typeof c.title !== 'string' ||
        !Number.isFinite(c.createdAt) ||
        !Array.isArray(c.messages) ||
        c.messages.some(
          (m) =>
            !m ||
            !['user', 'assistant', 'system'].includes(m.role) ||
            typeof m.content !== 'string',
        ),
    ) ||
    new Set(state.conversations.map((c) => c.id)).size !== state.conversations.length
  )
    throw new Error(
      'This Garden’s conversation history could not be read. It has not been replaced.',
    );
  return structuredClone(state);
}

async function owner(gardenId: string) {
  const service = getServices().crux;
  const garden = await service.findById(gardenId);
  if (garden.kind !== 'garden' || garden.deleted) throw new Error('This Garden is unavailable.');
  return { service, garden };
}

export async function loadGardenCollaboration(gardenId: string): Promise<GardenCollaboration> {
  const { garden } = await owner(gardenId);
  return decode(garden.meta?.gardenCollaboration);
}

export async function saveGardenCollaboration(
  gardenId: string,
  state: GardenCollaboration,
): Promise<void> {
  // Capture before any awaits. The existing API-owned Crux update merges this one payload
  // without replacing other metadata; callers serialize their own conversation edits.
  const captured = decode(state);
  const { service } = await owner(gardenId);
  await service.update(gardenId, { meta: { gardenCollaboration: captured } });
}
