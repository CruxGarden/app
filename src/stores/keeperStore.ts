import { create } from 'zustand';
import type { ChatMessage, ToolCall } from '@/api/types';
import type { NormalizedMessage } from '@/services/types';
import { runConversation } from '@/ai/engine';
import { getApiKey } from '@/ai/keys';
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
import { SettingsKey } from '@/lib/constants';
import { getSetting, setSetting, removeSetting } from '@/services/settings';
import { getPersona } from '@/components/mood/mood-helpers';

/**
 * The Keeper's conversations and the Keeper's turn, owned outside the console
 * (Daniel, 2026-09-20: "as the agent is building the UI needs to be changing,
 * updating so you can watch it work, pause what's going on, pick it up
 * yourself"). The console only renders this; closing it no longer aborts the
 * Keeper, so `run_turn` can bring a member crux into view while the Keeper
 * keeps its own account here.
 */
export interface KeeperConversation {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMessage[];
  /** The Cruxspace this conversation built or tends, if any — carried in its package. */
  cruxspaceId?: string;
}

export const MAX_KEEPER_CONVERSATIONS = 20;

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

function loadConversations(): KeeperConversation[] {
  try {
    const raw = getSetting(SettingsKey.KeeperConversations);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (c): c is KeeperConversation =>
          !!c && typeof c === 'object' && typeof (c as KeeperConversation).id === 'string',
      )
      .map((c) => ({ ...c, messages: Array.isArray(c.messages) ? c.messages : [] }))
      .slice(0, MAX_KEEPER_CONVERSATIONS);
  } catch {
    return [];
  }
}

function saveConversations(convos: KeeperConversation[]) {
  try {
    if (convos.length) setSetting(SettingsKey.KeeperConversations, JSON.stringify(convos));
    else removeSetting(SettingsKey.KeeperConversations);
  } catch {
    /* a full store keeps the last good save */
  }
}

const title = (text: string) => (text.length > 40 ? text.slice(0, 40) + '…' : text);

interface KeeperState {
  conversations: KeeperConversation[];
  activeId: string | null;
  model: string;
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

let controller: AbortController | null = null;

export const useKeeperStore = create<KeeperState>((set, get) => {
  const conversations = loadConversations();
  const commit = (update: (prev: KeeperConversation[]) => KeeperConversation[]) => {
    const next = update(get().conversations);
    saveConversations(next);
    set({ conversations: next });
  };
  return {
    conversations,
    activeId: conversations[0]?.id ?? null,
    model: resolveModel(getSetting(SettingsKey.KeeperModel)) || DEFAULT_MODEL,
    streaming: false,
    streamContent: '',
    toolCalls: [],
    toolActivity: '',
    error: '',
    working: null,
    setActive: (id) => set({ activeId: id }),
    setModel: (model) => {
      set({ model });
      try {
        setSetting(SettingsKey.KeeperModel, model);
      } catch {
        /* ignore */
      }
    },
    newConversation: () => {
      const id = crypto.randomUUID();
      commit((prev) =>
        [{ id, title: 'New conversation', createdAt: Date.now(), messages: [] }, ...prev].slice(
          0,
          MAX_KEEPER_CONVERSATIONS,
        ),
      );
      set({ activeId: id });
      return id;
    },
    deleteConversation: (id) => {
      commit((prev) => prev.filter((c) => c.id !== id));
      if (get().activeId === id) set({ activeId: get().conversations[0]?.id ?? null });
    },
    tagConversation: (id, cruxspaceId) =>
      commit((prev) => prev.map((c) => (c.id === id ? { ...c, cruxspaceId } : c))),
    stop: () => controller?.abort(),
    send: async (text) => {
      const trimmed = text.trim();
      if (!trimmed || get().streaming) return;
      const model = get().model;
      const providerId = getProviderForModel(model);
      const apiKey = (await getApiKey(providerId)) ?? (isAiMock() ? 'mock' : null);
      if (!apiKey) {
        set({
          error: `No API key for ${providerId}. Add one in Settings to chat with The Keeper.`,
        });
        return;
      }
      let targetId = get().activeId;
      if (!targetId || !get().conversations.some((c) => c.id === targetId)) {
        targetId = get().newConversation();
      }
      const persona = getPersona();
      const userMsg: ChatMessage = {
        role: 'user',
        content: trimmed,
        timestamp: new Date().toISOString(),
      };
      const before = get().conversations.find((c) => c.id === targetId)?.messages ?? [];
      let current = [...before, userMsg];
      const first = before.length === 0;
      commit((prev) =>
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
      controller = new AbortController();
      const themeExecute = createThemeToolExecutor();
      const execute = async (name: string, input: Record<string, unknown>) => {
        if (isGardenTool(name)) {
          const result = await runGardenTool(name, input);
          // A Cruxspace this conversation made is the one its package carries.
          const made = name === 'create_cruxspace' && /^id: (\S+)$/m.exec(result)?.[1];
          if (made && targetId) get().tagConversation(targetId, made);
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
              ...SKILL_TOOL_DEFINITIONS,
              ...THEME_TOOL_DEFINITIONS,
            ],
          },
        )) {
          if (event.type === 'text') {
            accumulated += event.content;
            set({ streamContent: accumulated, working: 'Replying…' });
          } else if (event.type === 'tool_start') {
            calls.push({ id: event.id, name: event.name, input: event.input });
            set({ toolCalls: [...calls], toolActivity: event.name, working: event.name });
          } else if (event.type === 'tool_result') {
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
        if (accumulated || calls.length) {
          current = [
            ...current,
            {
              role: 'assistant',
              content: accumulated,
              timestamp: new Date().toISOString(),
              model,
              ...(calls.length ? { toolCalls: calls } : {}),
            },
          ];
        }
        const tId = targetId;
        commit((prev) => prev.map((c) => (c.id === tId ? { ...c, messages: current } : c)));
      } catch (err) {
        if ((err as Error).name !== 'AbortError') set({ error: (err as Error).message });
      } finally {
        controller = null;
        set({
          streaming: false,
          streamContent: '',
          toolCalls: [],
          toolActivity: '',
          working: null,
        });
      }
    },
  };
});

/** The conversations that built or tend a Cruxspace — what its package carries. */
export function keeperConversationsFor(cruxspaceId: string): KeeperConversation[] {
  return useKeeperStore.getState().conversations.filter((c) => c.cruxspaceId === cruxspaceId);
}

/** Conversations arriving with a package: new ids, retagged to the space as it now is, kept newest first. */
export function adoptKeeperConversations(convos: KeeperConversation[], cruxspaceId: string): void {
  const state = useKeeperStore.getState();
  const adopted = convos
    .filter((c) => c && Array.isArray(c.messages))
    .map((c) => ({ ...c, id: crypto.randomUUID(), cruxspaceId }));
  const next = [...adopted, ...state.conversations].slice(0, MAX_KEEPER_CONVERSATIONS);
  saveConversations(next);
  useKeeperStore.setState({ conversations: next, activeId: next[0]?.id ?? state.activeId });
}
