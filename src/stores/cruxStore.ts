import { create } from 'zustand';
import type {
  Crux,
  ChatMessage,
  Attachment,
  CruxSummary,
  Dimension,
} from '@/api/types';
import type { UpdateCruxInput } from '@/services/types';
import type { Palette } from '@/lib/palette';
import { getServices } from '@/services';
import { getApiKey } from '@/ai/keys';

const MIME_MAP: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'application/javascript',
  ts: 'application/javascript',
  jsx: 'application/javascript',
  tsx: 'application/javascript',
  json: 'application/json',
  md: 'text/markdown',
  txt: 'text/plain',
  py: 'text/x-python',
  svg: 'image/svg+xml',
  xml: 'application/xml',
};

interface CruxState {
  // Active workspace
  crux: Crux | null;
  messages: ChatMessage[];
  artifacts: Attachment[];
  summary: CruxSummary | null;

  // Streaming state
  isStreaming: boolean;
  streamingContent: string;

  // Publish state
  hasUnpublishedChanges: boolean;
  artifactsVersion: number;

  // Growth state
  growths: Dimension[];
  growthCount: number;
  isCreatingGrowth: boolean;

  // Pending file deletions (awaiting user confirmation)
  pendingDeletes: { attachmentId: string; path: string }[];

  // Actions
  loadCrux: (id: string) => Promise<void>;
  createCrux: (title?: string) => Promise<Crux>;
  addMessage: (message: ChatMessage) => void;
  setStreaming: (streaming: boolean) => void;
  appendStreamContent: (content: string) => void;
  clearStreamContent: () => void;
  setArtifacts: (artifacts: Attachment[]) => void;
  addArtifact: (artifact: Attachment) => void;
  updateArtifact: (id: string, updates: Partial<Attachment>) => void;
  setModel: (model: string) => void;
  setPalette: (palette: Partial<Palette>) => void;
  saveMeta: () => Promise<void>;
  updateCrux: (dto: UpdateCruxInput) => Promise<void>;
  reset: () => void;

  // Publish actions
  publishCrux: () => Promise<void>;
  unpublishCrux: () => Promise<void>;

  // Upload progress
  uploadProgress: { total: number; completed: number; currentFile: string } | null;

  // File CRUD actions
  createFile: (path: string, content?: string) => Promise<Attachment>;
  uploadFile: (file: File, parentPath?: string) => Promise<Attachment>;
  uploadFiles: (files: { file: File; path: string }[]) => Promise<void>;
  moveArtifact: (id: string, newParentPath: string | null) => Promise<void>;
  renameArtifact: (id: string, newPath: string) => Promise<void>;
  deleteArtifact: (id: string) => Promise<void>;
  deleteArtifacts: (ids: string[]) => Promise<void>;
  saveArtifactContent: (id: string, content: string) => Promise<void>;

  // Growth actions
  loadGrowths: () => Promise<void>;
  addGrowth: (growth: Dimension) => void;
  setSummary: (summary: CruxSummary) => void;
  setGrowthCreating: (creating: boolean) => void;

  // Delete confirmation actions
  addPendingDelete: (attachmentId: string, path: string) => void;
  confirmDelete: (attachmentId: string) => Promise<void>;
  dismissDelete: (attachmentId: string) => void;
}

export const useCruxStore = create<CruxState>((set, get) => ({
  crux: null,
  messages: [],
  artifacts: [],
  summary: null,
  isStreaming: false,
  streamingContent: '',
  growths: [],
  growthCount: 0,
  hasUnpublishedChanges: false,
  artifactsVersion: 0,
  isCreatingGrowth: false,
  pendingDeletes: [],
  uploadProgress: null,

  loadCrux: async (id: string) => {
    const { crux: cruxService, attachment } = getServices();
    const crux = await cruxService.findById(id);
    const attachments = await attachment.findByResource('crux', id);
    // NOTE: crux.meta.settings.palette stores per-crux palette data for future use,
    // but themes are currently global — don't override the user's active theme on load.

    // Detect if anything was modified after the last publish.
    // The publish operation itself updates the crux row (setting `updated`), so
    // `crux.updated` is always slightly after `publishedAt` (which is computed before
    // the DB write). A 5-second tolerance ignores that publish-induced update while
    // still detecting any real edits made after publishing.
    let hasChanges = false;
    const publishedAt = crux.meta?.publishedAt as string | undefined;
    if (publishedAt) {
      const publishedMs = new Date(publishedAt).getTime();
      const tolerance = 5000; // 5 seconds
      // Check if crux metadata (title, slug, etc.) changed after publish
      if (new Date(crux.updated).getTime() > publishedMs + tolerance) {
        hasChanges = true;
      }
      // Check if any attachment was modified after publish
      if (!hasChanges && attachments.length > 0) {
        hasChanges = attachments.some(
          (a) => new Date(a.updated).getTime() > publishedMs + tolerance,
        );
      }
    }

    set({
      crux,
      messages: crux.meta?.messages || [],
      artifacts: attachments,
      summary: crux.meta?.summary || null,
      growthCount: crux.meta?.growthCount || 0,
      hasUnpublishedChanges: hasChanges,
    });

    // Load growth dimensions (version history)
    get().loadGrowths();
  },

  createCrux: async (title?: string) => {
    const { crux: cruxService } = getServices();

    const slug =
      (title || 'untitled')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') +
      '-' +
      Date.now().toString(36);

    const hasApiKey = !!(await getApiKey('anthropic'));

    const keeperPrompt =
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

    const greeting: ChatMessage = {
      role: 'assistant',
      content: 'What would you like to create today?',
    };

    const initialMessages = hasApiKey ? [greeting] : [];

    const crux = await cruxService.create({
      slug,
      title: title || 'New Crux',
      type: 'workspace',
      data: '',
      meta: {
        messages: initialMessages,
        summary: null,
        settings: {
          model: 'claude-sonnet-4-20250514',
          systemPrompt: keeperPrompt,
        },
      },
    });

    set({
      crux,
      messages: initialMessages,
      artifacts: [],
      summary: null,
      growths: [],
      growthCount: 0,
    });

    return crux;
  },

  addMessage: (message: ChatMessage) => {
    set((state) => ({ messages: [...state.messages, message] }));
  },

  setStreaming: (streaming: boolean) => {
    set({ isStreaming: streaming });
  },

  appendStreamContent: (content: string) => {
    set((state) => ({
      streamingContent: state.streamingContent + content,
    }));
  },

  clearStreamContent: () => {
    set({ streamingContent: '' });
  },

  setArtifacts: (artifacts: Attachment[]) => {
    set((s) => ({
      artifacts,
      hasUnpublishedChanges: true,
      artifactsVersion: s.artifactsVersion + 1,
    }));
  },

  addArtifact: (artifact: Attachment) => {
    set((state) => ({ artifacts: [...state.artifacts, artifact], hasUnpublishedChanges: true }));
  },

  updateArtifact: (id: string, updates: Partial<Attachment>) => {
    set((state) => ({
      artifacts: state.artifacts.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    }));
  },

  setModel: (model: string) => {
    const { crux, saveMeta } = get();
    if (!crux) return;
    const meta = { ...crux.meta, settings: { ...crux.meta?.settings, model } };
    set({ crux: { ...crux, meta } });
    saveMeta();
  },

  setPalette: (palette: Partial<Palette>) => {
    const { crux } = get();
    if (!crux) return;
    const merged = { ...crux.meta?.settings?.palette, ...palette };
    const meta = { ...crux.meta, settings: { ...crux.meta?.settings, palette: merged } };
    set({ crux: { ...crux, meta } });
  },

  saveMeta: async () => {
    const { crux, messages, summary, growthCount } = get();
    if (!crux) return;
    const { crux: cruxService } = getServices();
    await cruxService.update(crux.id, {
      meta: { ...crux.meta, messages, summary, growthCount },
    });
  },

  updateCrux: async (dto: UpdateCruxInput) => {
    const { crux } = get();
    if (!crux) return;
    const { crux: cruxService } = getServices();
    const updated = await cruxService.update(crux.id, dto);
    const isPublished = crux.meta?.publishedAt != null;
    set({
      crux: { ...crux, ...updated },
      ...(isPublished ? { hasUnpublishedChanges: true } : {}),
    });
  },

  reset: () => {
    set({
      crux: null,
      messages: [],
      artifacts: [],
      summary: null,
      isStreaming: false,
      streamingContent: '',
      growths: [],
      growthCount: 0,
      hasUnpublishedChanges: false,
      isCreatingGrowth: false,
      pendingDeletes: [],
    });
  },

  // Publish actions
  publishCrux: async () => {
    const { crux, saveMeta } = get();
    if (!crux) return;
    await saveMeta();
    const { publish } = getServices();
    const updated = await publish.publish(crux.id);
    set({ crux: { ...crux, ...updated }, hasUnpublishedChanges: false });
  },

  unpublishCrux: async () => {
    const { crux } = get();
    if (!crux) return;
    const { publish } = getServices();
    const updated = await publish.unpublish(crux.id);
    set({ crux: { ...crux, ...updated } });
  },

  // File CRUD actions
  createFile: async (path: string, content?: string) => {
    const { crux } = get();
    if (!crux) throw new Error('No active crux');
    const { attachment } = getServices();
    const text = content ?? '';
    const ext = path.split('.').pop()?.toLowerCase() || 'txt';
    const mime = MIME_MAP[ext] || 'text/plain';
    const newAttachment = await attachment.create({
      resourceId: crux.id,
      content: text,
      mimeType: mime,
      meta: { path },
    });
    set((state) => ({ artifacts: [...state.artifacts, newAttachment], hasUnpublishedChanges: true }));
    return newAttachment;
  },

  uploadFile: async (file: File, parentPath?: string) => {
    const { crux } = get();
    if (!crux) throw new Error('No active crux');
    const { attachment } = getServices();
    const path = parentPath ? `${parentPath}/${file.name}` : file.name;
    const newAttachment = await attachment.upload({
      resourceId: crux.id,
      blob: file,
      mimeType: file.type || undefined,
      meta: { path },
    });
    set((state) => ({ artifacts: [...state.artifacts, newAttachment], hasUnpublishedChanges: true }));
    return newAttachment;
  },

  moveArtifact: async (id: string, newParentPath: string | null) => {
    const { artifacts } = get();
    const { attachment } = getServices();
    const art = artifacts.find((a) => a.id === id);
    if (!art) return;
    const oldPath = art.meta?.path || art.filename || '';
    const filename = oldPath.split('/').pop() || art.filename;
    const newPath = newParentPath ? `${newParentPath}/${filename}` : filename;
    await attachment.update(id, { meta: { path: newPath } });
    set((state) => ({
      artifacts: state.artifacts.map((a) =>
        a.id === id
          ? {
              ...a,
              meta: { ...a.meta, path: newPath },
              filename: newPath.split('/').pop() || a.filename,
            }
          : a,
      ),
      hasUnpublishedChanges: true,
    }));
  },

  renameArtifact: async (id: string, newPath: string) => {
    const { attachment } = getServices();
    await attachment.update(id, { meta: { path: newPath } });
    set((state) => ({
      artifacts: state.artifacts.map((a) =>
        a.id === id
          ? {
              ...a,
              meta: { ...a.meta, path: newPath },
              filename: newPath.split('/').pop() || a.filename,
            }
          : a,
      ),
      hasUnpublishedChanges: true,
    }));
  },

  deleteArtifact: async (id: string) => {
    const { attachment } = getServices();
    await attachment.delete(id);
    set((state) => ({
      artifacts: state.artifacts.filter((a) => a.id !== id),
      hasUnpublishedChanges: true,
    }));
    // Also close any editor tab for this file
    const { useUIStore } = await import('@/stores/uiStore');
    useUIStore.getState().closeTab(id);
  },

  deleteArtifacts: async (ids: string[]) => {
    const { attachment } = getServices();
    // Delete all in parallel
    await Promise.allSettled(ids.map((id) => attachment.delete(id)));
    const idSet = new Set(ids);
    set((state) => ({
      artifacts: state.artifacts.filter((a) => !idSet.has(a.id)),
      hasUnpublishedChanges: true,
    }));
    // Close editor tabs for all deleted files
    const { useUIStore } = await import('@/stores/uiStore');
    const uiStore = useUIStore.getState();
    for (const id of ids) {
      uiStore.closeTab(id);
    }
  },

  uploadFiles: async (files: { file: File; path: string }[]) => {
    const { crux } = get();
    if (!crux) throw new Error('No active crux');
    const { attachment } = getServices();
    set({ uploadProgress: { total: files.length, completed: 0, currentFile: files[0]?.path || '' } });
    const newAttachments: Attachment[] = [];
    for (let i = 0; i < files.length; i++) {
      const { file, path } = files[i]!;
      set({ uploadProgress: { total: files.length, completed: i, currentFile: path } });
      try {
        const newAttachment = await attachment.upload({
          resourceId: crux.id,
          blob: file,
          mimeType: file.type || undefined,
          meta: { path },
        });
        newAttachments.push(newAttachment);
      } catch (err) {
        console.warn(`Failed to upload: ${path}`, err);
      }
    }
    set((state) => ({
      artifacts: [...state.artifacts, ...newAttachments],
      hasUnpublishedChanges: true,
      uploadProgress: null,
    }));
  },

  saveArtifactContent: async (id: string, content: string) => {
    const { artifacts } = get();
    const { attachment } = getServices();
    const art = artifacts.find((a) => a.id === id);
    if (!art) return;
    const mime = art.mimeType || 'text/plain';
    const blob = new Blob([content], { type: mime });
    const updated = await attachment.upload({
      resourceId: art.resourceId,
      blob,
      mimeType: mime,
      meta: { path: art.meta?.path },
    });
    set((state) => ({
      artifacts: state.artifacts.map((a) => (a.id === id ? { ...a, ...updated } : a)),
      hasUnpublishedChanges: true,
    }));
  },

  // Growth actions
  loadGrowths: async () => {
    const { crux } = get();
    if (!crux) return;
    const { dimension } = getServices();
    const dimensions = await dimension.findBySourceAndType(crux.id, 'growth');
    const sorted = dimensions.sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0));
    set({ growths: sorted });
  },

  addGrowth: (growth: Dimension) => {
    set((state) => ({
      growths: [...state.growths, growth].sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0)),
      growthCount: state.growthCount + 1,
    }));
  },

  setSummary: (summary: CruxSummary) => {
    set({ summary });
  },

  setGrowthCreating: (creating: boolean) => {
    set({ isCreatingGrowth: creating });
  },

  addPendingDelete: (attachmentId: string, path: string) => {
    set((s) => ({
      pendingDeletes: [...s.pendingDeletes, { attachmentId, path }],
    }));
  },

  confirmDelete: async (attachmentId: string) => {
    const { crux } = get();
    if (!crux) return;
    const { attachment } = getServices();
    await attachment.delete(attachmentId);
    const arts = await attachment.findByResource('crux', crux.id);
    set((s) => ({
      artifacts: arts,
      pendingDeletes: s.pendingDeletes.filter((d) => d.attachmentId !== attachmentId),
    }));
  },

  dismissDelete: (attachmentId: string) => {
    set((s) => ({
      pendingDeletes: s.pendingDeletes.filter((d) => d.attachmentId !== attachmentId),
    }));
  },
}));
