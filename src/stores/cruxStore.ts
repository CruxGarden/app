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
  messages: ChatMessage[]; // Full conversation (all segments concatenated)
  messageSegmentStart: number; // Index where the current workspace segment begins
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

  // Snapshot viewing state (filmstrip mode)
  viewingSnapshotId: string | null;
  viewingSnapshotIndex: number | null;
  workspaceArtifacts: Attachment[] | null; // stashed while viewing snapshot
  workspaceMessages: ChatMessage[] | null; // stashed while viewing snapshot
  workspaceSegmentStart: number | null; // stashed while viewing snapshot
  snapshotMessageCount: number | null; // how many messages to show for this snapshot

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

  // Snapshot viewing actions
  viewSnapshot: (snapshotId: string, index: number) => Promise<void>;
  exitSnapshotView: () => Promise<void>;
  revertToSnapshot: (snapshotId: string) => Promise<void>;

  // Branching actions
  branchFromSnapshot: (snapshotId: string, label: string) => Promise<void>;

  // Delete confirmation actions
  addPendingDelete: (attachmentId: string, path: string) => void;
  confirmDelete: (attachmentId: string) => Promise<void>;
  dismissDelete: (attachmentId: string) => void;
}

export const useCruxStore = create<CruxState>((set, get) => ({
  crux: null,
  messages: [],
  messageSegmentStart: 0,
  artifacts: [],
  summary: null,
  isStreaming: false,
  streamingContent: '',
  growths: [],
  growthCount: 0,
  hasUnpublishedChanges: false,
  artifactsVersion: 0,
  isCreatingGrowth: false,
  viewingSnapshotId: null,
  viewingSnapshotIndex: null,
  workspaceArtifacts: null,
  workspaceMessages: null,
  workspaceSegmentStart: null,
  snapshotMessageCount: null,
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

    // Load growth dimensions first so we can reconstruct the full conversation
    const { dimension } = getServices();
    const growthDimensions = await dimension.findBySourceAndType(id, 'growth');
    const sortedGrowths = growthDimensions.sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0));

    // Reconstruct full conversation from snapshot chain + workspace segment.
    // Branch-aware: walk parentCruxId from the tip backwards to build the
    // correct chain, then concatenate messages in chronological order.
    const workspaceMessages: ChatMessage[] = crux.meta?.messages || [];
    let priorMessages: ChatMessage[] = [];

    if (sortedGrowths.length > 0) {
      // Build a map of targetId → snapshotCrux for efficient lookup
      const snapshotCruxes = new Map<string, { messages: ChatMessage[]; parentCruxId: string | null }>();
      for (const growth of sortedGrowths) {
        try {
          const snapshotCrux = await cruxService.findById(growth.targetId);
          snapshotCruxes.set(growth.targetId, {
            messages: snapshotCrux.meta?.messages || [],
            parentCruxId: (snapshotCrux.meta?.parentCruxId as string) || null,
          });
        } catch {
          // Snapshot may have been deleted — skip
        }
      }

      // Find the active tip: the workspace's activeBranch setting, or the latest snapshot
      const activeBranchTip = (crux.meta?.settings?.activeBranch as string) || null;
      const tipId = activeBranchTip && snapshotCruxes.has(activeBranchTip)
        ? activeBranchTip
        : sortedGrowths[sortedGrowths.length - 1]!.targetId;

      // Walk backwards from tip via parentCruxId to build the chain
      const chain: string[] = [];
      let current: string | null = tipId;
      while (current && snapshotCruxes.has(current)) {
        chain.push(current);
        current = snapshotCruxes.get(current)!.parentCruxId;
      }
      chain.reverse(); // chronological order

      // Concatenate messages from the chain
      for (const snapshotId of chain) {
        const data = snapshotCruxes.get(snapshotId);
        if (data) priorMessages = priorMessages.concat(data.messages);
      }
    }

    const fullMessages = priorMessages.concat(workspaceMessages);
    const segmentStart = priorMessages.length;

    set({
      crux,
      messages: fullMessages,
      messageSegmentStart: segmentStart,
      artifacts: attachments,
      summary: crux.meta?.summary || null,
      growthCount: crux.meta?.growthCount || 0,
      growths: sortedGrowths,
      hasUnpublishedChanges: hasChanges,
    });
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
    const { crux, messages, messageSegmentStart, summary, growthCount } = get();
    if (!crux) return;
    const { crux: cruxService } = getServices();
    // Only persist the current workspace segment, not prior snapshot messages
    const currentSegment = messages.slice(messageSegmentStart);
    await cruxService.update(crux.id, {
      meta: { ...crux.meta, messages: currentSegment, summary, growthCount },
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
      messageSegmentStart: 0,
      artifacts: [],
      summary: null,
      isStreaming: false,
      streamingContent: '',
      growths: [],
      growthCount: 0,
      hasUnpublishedChanges: false,
      isCreatingGrowth: false,
      viewingSnapshotId: null,
      viewingSnapshotIndex: null,
      workspaceArtifacts: null,
      workspaceMessages: null,
      workspaceSegmentStart: null,
      snapshotMessageCount: null,
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

  // Snapshot viewing actions
  viewSnapshot: async (snapshotId: string, index: number) => {
    const { crux, artifacts, messages, messageSegmentStart, workspaceArtifacts, workspaceMessages } = get();
    if (!crux) return;
    const { attachment, crux: cruxService } = getServices();
    const snapshotArtifacts = await attachment.findByResource('crux', snapshotId);

    // Load snapshot crux to get its cumulative message count
    const snapshotCrux = await cruxService.findById(snapshotId);
    // Use cumulativeMessageCount (new format) or fall back to messages.length (old format where full conversation was stored)
    const cumulativeCount = (snapshotCrux.meta?.cumulativeMessageCount as number)
      ?? (snapshotCrux.meta?.messages as ChatMessage[] | undefined)?.length
      ?? 0;

    set({
      viewingSnapshotId: snapshotId,
      viewingSnapshotIndex: index,
      artifacts: snapshotArtifacts,
      snapshotMessageCount: cumulativeCount,
      // Stash workspace state only if not already viewing a snapshot
      workspaceArtifacts: workspaceArtifacts ?? artifacts,
      workspaceMessages: workspaceMessages ?? messages,
      workspaceSegmentStart: get().workspaceSegmentStart ?? messageSegmentStart,
    });

    // Re-select the same file (by path) in the new artifact set
    const { useUIStore } = await import('@/stores/uiStore');
    const activeTabId = useUIStore.getState().editor.activeTabId;
    if (activeTabId) {
      const sourceArtifacts = workspaceArtifacts ?? artifacts;
      const prev = sourceArtifacts.find((a) => a.id === activeTabId);
      if (prev) {
        const prevPath = (prev.meta?.path || prev.filename || '') as string;
        const match = snapshotArtifacts.find((a) => (a.meta?.path || a.filename || '') === prevPath);
        if (match) {
          useUIStore.getState().openFile(match.id, prevPath);
        }
      }
    }
  },

  exitSnapshotView: async () => {
    const { workspaceArtifacts, workspaceMessages, workspaceSegmentStart, artifacts } = get();

    // Capture active tab path before swapping artifacts
    const { useUIStore } = await import('@/stores/uiStore');
    const activeTabId = useUIStore.getState().editor.activeTabId;
    const prevPath = activeTabId
      ? ((artifacts.find((a) => a.id === activeTabId)?.meta?.path ||
          artifacts.find((a) => a.id === activeTabId)?.filename || '') as string)
      : null;

    set({
      viewingSnapshotId: null,
      viewingSnapshotIndex: null,
      artifacts: workspaceArtifacts ?? [],
      messages: workspaceMessages ?? [],
      messageSegmentStart: workspaceSegmentStart ?? 0,
      workspaceArtifacts: null,
      workspaceMessages: null,
      workspaceSegmentStart: null,
      snapshotMessageCount: null,
    });

    // Re-select the same file (by path) in workspace artifacts
    if (prevPath && workspaceArtifacts) {
      const match = workspaceArtifacts.find((a) => (a.meta?.path || a.filename || '') === prevPath);
      if (match) {
        useUIStore.getState().openFile(match.id, prevPath);
      }
    }
  },

  revertToSnapshot: async (snapshotId: string) => {
    const { crux } = get();
    if (!crux) return;
    const { attachment, crux: cruxService } = getServices();

    // Auto-snapshot current state as a safety net before reverting
    try {
      const { createSnapshot } = await import('@/services/growth.service');
      await createSnapshot({ label: 'Before revert', silent: true });
    } catch (err) {
      console.warn('Failed to auto-snapshot before revert:', err);
    }

    // Delete all current workspace artifacts
    const currentArtifacts = await attachment.findByResource('crux', crux.id);
    await Promise.allSettled(currentArtifacts.map((a) => attachment.delete(a.id)));

    // Clone snapshot artifacts to workspace
    await attachment.cloneArtifactsToSnapshot(snapshotId, crux.id);

    // Rebuild conversation by walking the parentCruxId chain from this snapshot
    const snapshotCrux = await cruxService.findById(snapshotId);
    const snapshotMessages: ChatMessage[] = snapshotCrux.meta?.messages || [];

    // Walk the parent chain backwards to collect all segments
    const chain: ChatMessage[][] = [snapshotMessages];
    let parentId = (snapshotCrux.meta?.parentCruxId as string) || null;
    while (parentId) {
      try {
        const parentCrux = await cruxService.findById(parentId);
        chain.push(parentCrux.meta?.messages || []);
        parentId = (parentCrux.meta?.parentCruxId as string) || null;
      } catch {
        break; // deleted snapshot — stop walking
      }
    }
    chain.reverse(); // chronological order
    const priorMessages = chain.flat();

    // Reload workspace artifacts
    const newWorkspaceArtifacts = await attachment.findByResource('crux', crux.id);

    set({
      viewingSnapshotId: null,
      viewingSnapshotIndex: null,
      artifacts: newWorkspaceArtifacts,
      workspaceArtifacts: null,
      workspaceMessages: null,
      workspaceSegmentStart: null,
      snapshotMessageCount: null,
      messages: priorMessages,
      messageSegmentStart: priorMessages.length,
    });

    // Persist the reverted state — workspace now has empty segment going forward
    const { saveMeta } = get();
    await saveMeta();
  },

  branchFromSnapshot: async (snapshotId: string, label: string) => {
    const { crux } = get();
    if (!crux) return;
    const { attachment, crux: cruxService } = getServices();

    // Auto-snapshot current state first
    try {
      const { createSnapshot } = await import('@/services/growth.service');
      await createSnapshot({ label: 'Before branch', silent: true });
    } catch (err) {
      console.warn('Failed to auto-snapshot before branch:', err);
    }

    // Delete current workspace artifacts
    const currentArtifacts = await attachment.findByResource('crux', crux.id);
    await Promise.allSettled(currentArtifacts.map((a) => attachment.delete(a.id)));

    // Clone snapshot artifacts to workspace
    await attachment.cloneArtifactsToSnapshot(snapshotId, crux.id);

    // Load snapshot messages — these become the conversation base for the branch
    const snapshotCrux = await cruxService.findById(snapshotId);
    const snapshotMessages: ChatMessage[] = snapshotCrux.meta?.messages || [];

    // Reload workspace artifacts
    const newWorkspaceArtifacts = await attachment.findByResource('crux', crux.id);

    // Set activeBranch to snapshotId — new snapshots will chain from here
    const meta = {
      ...crux.meta,
      messages: [],
      settings: { ...crux.meta?.settings, activeBranch: snapshotId },
    };

    // Inject a system message to orient the AI about the branch
    const branchMessage: ChatMessage = {
      role: 'user',
      content: `[System: Branching from snapshot "${label}". The workspace files have been restored to that point. Continue from here on a new branch.]`,
      timestamp: new Date().toISOString(),
    };

    set({
      viewingSnapshotId: null,
      viewingSnapshotIndex: null,
      artifacts: newWorkspaceArtifacts,
      workspaceArtifacts: null,
      workspaceMessages: null,
      workspaceSegmentStart: null,
      snapshotMessageCount: null,
      messages: [...snapshotMessages, branchMessage],
      messageSegmentStart: snapshotMessages.length,
      crux: { ...crux, meta },
    });

    // Persist
    const { saveMeta } = get();
    await saveMeta();
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
