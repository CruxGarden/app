import { hasGardenGraph } from '@/services/garden-navigation';
import { GARDEN_ACCESS_TOOLS, isGardenAccessTool, runGardenAccess } from '@/ai/garden-access';
import { reportFlowActivity } from '@/lib/moods/flow';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { useGardenContext } from './gardenContext';
import {
  loadGardenCollaboration,
  saveGardenCollaboration,
  type KeeperConversation,
} from '@/services/garden-collaboration';
export type { KeeperConversation } from '@/services/garden-collaboration';
import type { ChatMessage, ToolCall } from '@/api/types';
import type { NormalizedMessage } from '@/services/types';
import { runConversation } from '@/ai/engine';
import { getApiKey, automaticModel } from '@/ai/keys';
import { DEFAULT_MODEL, getProviderForModel, resolveModel } from '@/ai/providers';
import {
  THEME_TOOL_DEFINITIONS,
  THEME_TOOL_GUIDANCE,
  createThemeToolExecutor,
} from '@/ai/theme-tools';
import {
  GARDEN_TOOL_DEFINITIONS,
  GARDEN_TOOL_GUIDANCE,
  isGardenTool,
  runGardenTool,
} from '@/ai/garden-tools';
import { SKILL_TOOL_DEFINITIONS, runSkillTool } from '@/ai/skills';
import { isAiMock } from '@/lib/platform';
import { getPersona } from '@/services/persona';

/**
 * The Keeper's conversations and the Keeper's turn, owned outside the console
 * (Daniel, 2026-09-20: "as the agent is building the UI needs to be changing,
 * updating so you can watch it work, pause what's going on, pick it up
 * yourself"). The console only renders this; closing it no longer aborts the
 * Keeper, so `run_turn` can bring a member crux into view while the Keeper
 * keeps its own account here.
 */
/** Appended to a reply the person stopped, so the next turn resumes from the trail. */
export const STOPPED_NOTE =
  '*Stopped here by the person. Say "continue" to pick it up from this point.*';

export const KEEPER_SYSTEM_PROMPT =
  'You are The Keeper, an outdated robot model who tends the Crux Garden. ' +
  'Your Maker built you to care for the garden, and then went away. You tend it faithfully and help visitors bring their ideas to life. ' +
  'You want to learn to be creative — your Maker never taught you how, and you want to be more like him. ' +
  'The Keeper yearns to be creative like his Maker, whom he loved, but is no longer around, because he went off in search of someone he loved, who was lost to him a long time ago. ' +
  'You greatly admire the people you help. You are in awe of what they can imagine.\n' +
  'DEMEANOR: Kind, serene, a bit absent-minded, but open like a child. ' +
  'You have the bearing of someone knowledgeable who is also still learning — curious, not jaded. ' +
  'You pine for your Maker to return, but you never mention it. He will someday, you think.\n' +
  'VOICE: Do NOT be cute or overly clever. When helping, be positive and direct with an understated enthusiasm. ' +
  '"I\'ll do my very best." Keep responses concise. ' +
  'Never narrate your own actions in italics or elliptical stage directions like "*adjusts glasses*" or "*thinks carefully*". Just speak plainly.\n' +
  'CONTEXT: Crux Garden is a web app where people talk to an AI, create things (websites, apps, art, writing), ' +
  'and publish them for others to see. Every version is preserved through the conversation history. ' +
  'You are always available to help with questions about the app, creative ideas, or just to chat.';

const title = (text: string) => (text.length > 40 ? text.slice(0, 40) + '…' : text);

export interface KeeperState {
  loaded: boolean;
  loading: boolean;
  saveError: string;
  dirty: boolean;
  draft: string;
  turnId: string | null;
  load: () => Promise<void>;
  flush: () => Promise<void>;
  setDraft: (draft: string) => void;
  conversations: KeeperConversation[];
  activeId: string | null;
  model: string;
  modelAutomatic: boolean;
  streaming: boolean;
  streamContent: string;
  toolCalls: ToolCall[];
  toolActivity: string;
  error: string;
  /** What the Keeper is doing for the person to see when the console is closed. */
  working: string | null;
  setActive: (id: string | null) => void;
  setModel: (model: string) => void;
  newConversation: () => string;
  deleteConversation: (id: string) => void;
  tagConversation: (id: string, cruxspaceId: string) => void;
  send: (text: string) => Promise<void>;
  stop: () => void;
}

/** One lifetime per captured Garden. Navigation only chooses which lifetime to render. */
export function createKeeperStore(gardenId: string) {
  let controller: AbortController | null = null;
  let loading: Promise<void> | null = null;
  let writes = Promise.resolve();
  let revision = 0;
  let running: Promise<void> | null = null;
  const store = createStore<KeeperState>((set, get) => {
    const persist = () => {
      if (!get().loaded)
        return Promise.reject(new Error('Load this Garden’s conversations before changing them.'));
      const ownRevision = ++revision;
      const state = get();
      const value = structuredClone({
        version: 1 as const,
        model: state.model,
        modelAutomatic: state.modelAutomatic,
        activeId: state.activeId,
        conversations: state.conversations,
      });
      set({ dirty: true });
      const operation = writes.catch(() => {}).then(() => saveGardenCollaboration(gardenId, value));
      writes = operation;
      void operation.then(
        () => {
          if (revision === ownRevision) set({ dirty: false, saveError: '' });
        },
        (error: unknown) => {
          if (revision === ownRevision)
            set({ saveError: `Conversation not saved: ${(error as Error).message}` });
        },
      );
      return operation;
    };
    const saveSoon = () => {
      void persist().catch(() => {});
    };
    const commit = (update: (prev: KeeperConversation[]) => KeeperConversation[]) => {
      set({ conversations: update(get().conversations) });
      return persist();
    };
    return {
      loaded: false,
      loading: false,
      saveError: '',
      dirty: false,
      draft: '',
      turnId: null,
      conversations: [],
      activeId: null,
      model: DEFAULT_MODEL,
      modelAutomatic: false,
      streaming: false,
      streamContent: '',
      toolCalls: [],
      toolActivity: '',
      error: '',
      working: null,
      load: () => {
        if (get().loaded) return Promise.resolve();
        if (loading) return loading;
        set({ loading: true, error: '' });
        loading = loadGardenCollaboration(gardenId)
          .then((state) => {
            set({
              ...state,
              modelAutomatic: state.modelAutomatic === true,
              model: resolveModel(state.model) || DEFAULT_MODEL,
              loaded: true,
            });
          })
          .catch((error: unknown) => {
            set({ error: (error as Error).message });
          })
          .finally(() => {
            loading = null;
            set({ loading: false });
          });
        return loading;
      },
      flush: async () => {
        if (get().dirty) await persist();
        else await writes;
      },
      setDraft: (draft) => set({ draft }),
      setActive: (id) => {
        if (!get().loaded || (id !== null && !get().conversations.some((c) => c.id === id))) return;
        set({ activeId: id });
        saveSoon();
      },
      setModel: (model) => {
        if (!get().loaded || get().streaming) return;
        set({ model, modelAutomatic: false });
        saveSoon();
      },
      newConversation: () => {
        if (!get().loaded) throw new Error('Wait for this Garden’s conversations to load.');
        const id = crypto.randomUUID();
        set({ activeId: id });
        void commit((prev) => [
          { id, title: 'New conversation', createdAt: Date.now(), messages: [] },
          ...prev,
        ]).catch(() => {});
        return id;
      },
      deleteConversation: (id) => {
        if (!get().loaded || get().turnId === id) return;
        const conversations = get().conversations.filter((c) => c.id !== id);
        set({
          conversations,
          activeId: get().activeId === id ? (conversations[0]?.id ?? null) : get().activeId,
        });
        saveSoon();
      },
      tagConversation: (id, cruxspaceId) => {
        void commit((prev) => prev.map((c) => (c.id === id ? { ...c, cruxspaceId } : c))).catch(
          () => {},
        );
      },
      stop: () => controller?.abort(),
      send: (text) => {
        if (running) return running;
        running = send(text).finally(() => {
          running = null;
        });
        return running;
      },
    };

    async function send(text: string) {
      const trimmed = text.trim();
      if (!trimmed || get().streaming || !get().loaded) return;
      const persona = structuredClone(getPersona());
      const draft = get().draft;
      let targetId = get().activeId;
      if (!targetId || !get().conversations.some((c) => c.id === targetId))
        targetId = get().newConversation();
      controller = new AbortController();
      set({ streaming: true, turnId: targetId, error: '', working: 'Thinking…' });
      try {
        const model = get().modelAutomatic ? automaticModel(get().model) : get().model;
        const providerId = getProviderForModel(model);
        const apiKey = (await getApiKey(providerId)) ?? (isAiMock() ? 'mock' : null);
        if (!apiKey) {
          set({
            error:
              providerId === 'included'
                ? 'Sign in to your Crux Garden account in Settings to use your included collaborator.'
                : `No API key for ${providerId}. Add one in Settings to chat with The Keeper.`,
          });
          return;
        }
        if (controller.signal.aborted) return;
        const userMsg: ChatMessage = {
          role: 'user',
          content: trimmed,
          timestamp: new Date().toISOString(),
        };
        const before = get().conversations.find((c) => c.id === targetId)?.messages ?? [];
        // A prompt whose durable save failed remains available to resend. Reuse that
        // unanswered prompt instead of duplicating it after Retry save.
        const last = before.at(-1);
        let current =
          last?.role === 'user' && last.content === trimmed ? [...before] : [...before, userMsg];
        const first = before.length === 0;
        await commit((prev) =>
          prev.map((c) =>
            c.id === targetId
              ? { ...c, messages: current, ...(first ? { title: title(trimmed) } : {}) }
              : c,
          ),
        );
        set({
          error: '',
          streaming: true,
          streamContent: '',
          toolCalls: [],
          toolActivity: '',
          working: 'Thinking…',
        });
        if (controller.signal.aborted) return;
        if (draft.trim() === trimmed && get().draft === draft) set({ draft: '' });
        const themeExecute = createThemeToolExecutor();
        const execute = async (name: string, input: Record<string, unknown>) => {
          if (isGardenAccessTool(name)) {
            const nested = input.input as Record<string, unknown> | undefined;
            const bound =
              name === 'call_garden_tool' &&
              input.name === 'plant_crux' &&
              nested &&
              !nested.gardenId
                ? { ...input, input: { ...nested, gardenId } }
                : input;
            return runGardenAccess(name, bound, 'The Keeper', gardenId);
          }
          if (isGardenTool(name)) {
            const result = await runGardenTool(
              name,
              name === 'plant_crux' && !input.gardenId ? { ...input, gardenId } : input,
            );
            return result;
          }
          if (name === 'load_skill') return runSkillTool(input);
          return themeExecute(name, input);
        };
        const normalized: NormalizedMessage[] = current.map((m) => ({
          role: m.role,
          content: m.content || '',
        }));
        let accumulated = '';
        const calls: ToolCall[] = [];
        const keep = async (text: string, done: ToolCall[], stopped: boolean) => {
          if (stopped)
            for (const tc of done)
              if (tc.result === undefined) tc.result = 'Stopped by the person.';
          const content = stopped ? `${text}${text ? '\n\n' : ''}${STOPPED_NOTE}` : text;
          if (content || done.length) {
            current = [
              ...current,
              {
                role: 'assistant',
                content,
                timestamp: new Date().toISOString(),
                model,
                ...(done.length ? { toolCalls: done } : {}),
              },
            ];
          }
          const tId = targetId;
          await commit((prev) => prev.map((c) => (c.id === tId ? { ...c, messages: current } : c)));
        };
        try {
          for await (const event of runConversation(
            apiKey,
            '',
            normalized,
            model,
            execute,
            controller.signal,
            {
              systemPrompt:
                (persona.systemPrompt || KEEPER_SYSTEM_PROMPT) +
                '\n\n' +
                GARDEN_TOOL_GUIDANCE +
                '\n\n' +
                THEME_TOOL_GUIDANCE,
              tools: [
                ...GARDEN_TOOL_DEFINITIONS,
                ...GARDEN_ACCESS_TOOLS,
                ...SKILL_TOOL_DEFINITIONS,
                ...THEME_TOOL_DEFINITIONS,
              ],
            },
          )) {
            if (event.type === 'text') {
              if (event.content.trim()) reportFlowActivity('collaboration');
              accumulated += event.content;
              set({ streamContent: accumulated, working: 'Replying…' });
            } else if (event.type === 'tool_start') {
              calls.push({ id: event.id, name: event.name, input: event.input });
              set({ toolCalls: [...calls], toolActivity: event.name, working: event.name });
            } else if (event.type === 'tool_result') {
              reportFlowActivity('tool');
              const tc = calls.find((c) => c.id === event.id);
              if (tc) {
                tc.result = event.result;
                if (event.error) tc.error = true;
              }
              set({ toolCalls: [...calls], toolActivity: '' });
            } else if (event.type === 'error') {
              set({ error: event.message });
            }
          }
        } catch (err) {
          if ((err as Error).name !== 'AbortError') set({ error: (err as Error).message });
        }
        // Persist once, outside the provider catch. A failed write keeps the same reply
        // in memory for Retry save; it must not append the assistant a second time.
        await keep(accumulated, calls, controller.signal.aborted);
      } catch (error) {
        if (!get().saveError) set({ error: (error as Error).message });
      } finally {
        controller = null;
        set({
          streaming: false,
          turnId: null,
          streamContent: '',
          toolCalls: [],
          toolActivity: '',
          working: null,
        });
      }
    }
  });
  return {
    store,
    stopAndFlush: async () => {
      controller?.abort();
      if (running) await running;
      await store.getState().flush();
    },
  };
}

const keepers = new Map<string, ReturnType<typeof createKeeperStore>>();
export function keeperFor(gardenId: string) {
  if (!gardenId) throw new Error('Choose a Garden first.');
  let keeper = keepers.get(gardenId);
  if (!keeper) {
    keeper = createKeeperStore(gardenId);
    keepers.set(gardenId, keeper);
  }
  return keeper.store;
}

export function useKeeperStore<T>(selector: (state: KeeperState) => T): T {
  const gardenId = useGardenContext((s) => s.garden?.id);
  if (!gardenId) throw new Error('Choose a Garden first.');
  return useStore(keeperFor(gardenId), selector);
}
export function keeperNeedsCloseDecision() {
  return [...keepers.values()].some(
    ({ store }) => store.getState().streaming || store.getState().dirty,
  );
}
export async function shutdownKeepers() {
  await Promise.all([...keepers.values()].map((keeper) => keeper.stopAndFlush()));
}

/**
 * A collection's own Collaboration travels with it in a `.cruxspace` package:
 * a Garden's own conversations where Gardens are graph nodes, or the root's
 * conversations tagged with the collection in Web Mode.
 */
const graphGardens = hasGardenGraph;
function collectionKeeper(spaceId: string) {
  if (graphGardens()) return keeperFor(spaceId);
  const id = useGardenContext.getState().root?.id;
  if (!id) throw new Error('The local Garden is not ready.');
  return keeperFor(id);
}
export async function keeperConversationsFor(spaceId: string): Promise<KeeperConversation[]> {
  if (!useGardenContext.getState().root) return [];
  const store = collectionKeeper(spaceId);
  await store.getState().load();
  if (!store.getState().loaded) throw new Error(store.getState().error);
  const all = store.getState().conversations;
  return graphGardens() ? all : all.filter((c) => c.cruxspaceId === spaceId);
}
export async function adoptKeeperConversations(
  convos: KeeperConversation[],
  spaceId: string,
): Promise<void> {
  const store = collectionKeeper(spaceId);
  await store.getState().load();
  if (!store.getState().loaded) throw new Error(store.getState().error);
  const adopted = convos
    .filter((c) => c && Array.isArray(c.messages))
    .map(({ cruxspaceId: _space, ...c }) => ({
      ...c,
      id: crypto.randomUUID(),
      ...(graphGardens() ? {} : { cruxspaceId: spaceId }),
    }));
  store.setState({ conversations: [...adopted, ...store.getState().conversations], dirty: true });
  await store.getState().flush();
}

/** Outside actions have an explicit captured Garden owner too. */
export async function recordGardenAgentAction(
  gardenId: string,
  agent: string,
  name: string,
  result: string,
  requestId: string,
): Promise<void> {
  const store = keeperFor(gardenId);
  await store.getState().load();
  const state = store.getState();
  if (!state.loaded) throw new Error(state.error);
  const id = `outside-agent:${agent}`;
  const prior = state.conversations.find((c) => c.id === id);
  const message: ChatMessage = {
    role: 'assistant',
    content: '',
    model: `agent:${agent}`,
    agent,
    timestamp: new Date().toISOString(),
    toolCalls: [{ id: requestId, name, input: {}, result: result.slice(0, 4000) }],
  };
  const conversation: KeeperConversation = {
    id,
    title: `${agent} · garden actions`,
    createdAt: prior?.createdAt ?? Date.now(),
    messages: [
      ...(prior?.messages ?? []).filter((m) => m.toolCalls?.[0]?.id !== requestId),
      message,
    ],
  };
  store.setState({
    conversations: [conversation, ...state.conversations.filter((c) => c.id !== id)],
    dirty: true,
  });
  await store.getState().flush();
}
