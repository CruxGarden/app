import { create } from 'zustand';
import type {
  Crux,
  ChatMessage,
  Artifact,
  CruxSummary,
  Dimension,
} from '@/api/types';
import type { UpdateCruxInput } from '@/services/types';
import type { Palette } from '@/lib/palette';
import { getServices } from '@/services';

/** Build a fingerprint snapshot from artifacts: { path: fingerprint } */
function buildFingerprintMap(artifacts: Artifact[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const a of artifacts) {
    if (a.type !== 'artifact' || !a.fingerprint) continue;
    const path = (a.meta?.path as string) || a.filename;
    map[path] = a.fingerprint;
  }
  return map;
}

/** Check if current artifacts match the published fingerprint snapshot */
function hasContentChanged(artifacts: Artifact[], publishedFingerprints: Record<string, string> | undefined): boolean {
  if (!publishedFingerprints) return true; // never published
  const current = buildFingerprintMap(artifacts);
  const currentKeys = Object.keys(current).sort();
  const publishedKeys = Object.keys(publishedFingerprints).sort();
  if (currentKeys.length !== publishedKeys.length) return true;
  for (let i = 0; i < currentKeys.length; i++) {
    if (currentKeys[i] !== publishedKeys[i]) return true;
    if (current[currentKeys[i]!] !== publishedFingerprints[currentKeys[i]!]) return true;
  }
  return false;
}

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
  artifacts: Artifact[];
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
  workspaceArtifacts: Artifact[] | null; // stashed while viewing snapshot
  workspaceMessages: ChatMessage[] | null; // stashed while viewing snapshot
  workspaceSegmentStart: number | null; // stashed while viewing snapshot
  snapshotMessageCount: number | null; // how many messages to show for this snapshot

  // Pending file deletions (awaiting user confirmation)
  pendingDeletes: { artifactId: string; path: string }[];

  // Actions
  loadCrux: (id: string) => Promise<void>;
  createCrux: (title?: string) => Promise<Crux>;
  addMessage: (message: ChatMessage) => void;
  setStreaming: (streaming: boolean) => void;
  appendStreamContent: (content: string) => void;
  clearStreamContent: () => void;
  setArtifacts: (artifacts: Artifact[]) => void;
  addArtifact: (artifact: Artifact) => void;
  updateArtifact: (id: string, updates: Partial<Artifact>) => void;
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

  // Token usage tracking (cumulative for the session)
  tokenUsage: { inputTokens: number; outputTokens: number };
  addTokenUsage: (input: number, output: number) => void;

  // File CRUD actions
  createFile: (path: string, content?: string) => Promise<Artifact>;
  uploadFile: (file: File, parentPath?: string) => Promise<Artifact>;
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
  addPendingDelete: (artifactId: string, path: string) => void;
  confirmDelete: (artifactId: string) => Promise<void>;
  dismissDelete: (artifactId: string) => void;
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
  tokenUsage: { inputTokens: 0, outputTokens: 0 },

  addTokenUsage: (input: number, output: number) => {
    set((s) => ({
      tokenUsage: {
        // Input tokens = latest value (represents current conversation size, not cumulative)
        inputTokens: input,
        // Output tokens accumulate across the session
        outputTokens: s.tokenUsage.outputTokens + output,
      },
    }));
  },

  loadCrux: async (id: string) => {
    const { crux: cruxService, artifact } = getServices();
    const crux = await cruxService.findById(id);
    const artifacts = await artifact.findByResource('crux', id);

    // Migration: strip legacy hardcoded Keeper prompt from per-crux settings.
    // Identity now comes from the Mood persona, not per-crux metadata.
    const meta = crux.meta as Record<string, Record<string, unknown>> | undefined;
    const perCruxPrompt = meta?.settings?.systemPrompt as string | undefined;
    if (perCruxPrompt?.includes('You are The Keeper')) {
      delete (meta!.settings as Record<string, unknown>).systemPrompt;
      await cruxService.update(id, { meta: crux.meta });
    }

    // NOTE: crux.meta.settings.palette stores per-crux palette data for future use,
    // but themes are currently global — don't override the user's active theme on load.

    // Compare current artifact fingerprints against the published snapshot
    const hasChanges = hasContentChanged(
      artifacts,
      crux.meta?.publishedFingerprints as Record<string, string> | undefined,
    );

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
      artifacts,
      summary: crux.meta?.summary || null,
      growthCount: crux.meta?.growthCount || 0,
      growths: sortedGrowths,
      hasUnpublishedChanges: hasChanges,
      // Estimate initial token usage from message history until first real API response
      tokenUsage: {
        inputTokens: fullMessages.reduce((sum, m) => sum + Math.ceil((m.content?.length || 0) / 3.5) + 4, 0),
        outputTokens: 0,
      },
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

    const { getPersona } = await import('@/components/mood/mood-helpers');
    const persona = getPersona();

    const greeting: ChatMessage = {
      role: 'assistant',
      content: persona.greeting || 'What would you like to create today?',
    };

    const initialMessages = [greeting];

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

  setArtifacts: (artifacts: Artifact[]) => {
    set((s) => ({
      artifacts,
      hasUnpublishedChanges: true,
      artifactsVersion: s.artifactsVersion + 1,
    }));
  },

  addArtifact: (artifact: Artifact) => {
    set((state) => ({ artifacts: [...state.artifacts, artifact], hasUnpublishedChanges: true }));
  },

  updateArtifact: (id: string, updates: Partial<Artifact>) => {
    set((state) => {
      const newArtifacts = state.artifacts.map((a) => (a.id === id ? { ...a, ...updates } : a));
      return {
        artifacts: newArtifacts,
        hasUnpublishedChanges: hasContentChanged(
          newArtifacts,
          state.crux?.meta?.publishedFingerprints as Record<string, string> | undefined,
        ),
      };
    });
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
    const { crux, artifacts, saveMeta } = get();
    if (!crux) return;
    await saveMeta();

    const { cruxes } = await import('@/api');
    const { artifact: artifactService } = getServices();

    // 1. Upsert crux to API (create if not exists, update if it does)
    let cruxExistsOnApi = false;
    try {
      await cruxes.get(crux.id);
      cruxExistsOnApi = true;
    } catch {
      // 404 — crux not yet on API
    }

    if (cruxExistsOnApi) {
      await cruxes.update(crux.id, {
        title: crux.title,
        slug: crux.slug,
        description: crux.description,
        data: crux.data,
        type: crux.type,
        kind: crux.kind as 'webapp' | 'page' | 'document' | 'image' | undefined,
        discoverable: crux.discoverable,
        meta: crux.meta as Record<string, unknown>,
      });
    } else {
      // The API handles slug conflicts by hard-deleting stale records
      await cruxes.create({
        id: crux.id,
        slug: crux.slug,
        title: crux.title,
        description: crux.description,
        data: crux.data || '',
        type: crux.type,
        kind: crux.kind as 'webapp' | 'page' | 'document' | 'image' | undefined,
        discoverable: crux.discoverable,
        meta: crux.meta as Record<string, unknown>,
      });
    }

    // 2. Collect all working artifacts and publish in one request
    const workingArtifacts = (artifacts || []).filter(
      (a) => a.type === 'artifact',
    );
    const filesToPublish: Array<{
      blob: Blob;
      path: string;
      type?: string;
      kind?: string;
      mimeType: string;
    }> = [];
    for (const art of workingArtifacts) {
      try {
        const blob = await artifactService.downloadBlob(art.id);
        const path = art.meta?.path || art.filename || 'file';
        filesToPublish.push({
          blob,
          path,
          type: art.type,
          kind: art.kind || undefined,
          mimeType: art.mimeType,
        });
      } catch {
        // Skip artifacts that fail to load — publish will use what's available
      }
    }

    // 3. Publish — sends all files in one multipart request
    const { publish } = getServices();
    const updated = await publish.publish(crux.id, filesToPublish);

    // Merge API publish metadata into local crux (preserve local-only meta fields)
    // Snapshot artifact fingerprints at publish time for change detection
    const publishedFingerprints = buildFingerprintMap(artifacts || []);
    const mergedMeta = { ...crux.meta, ...updated.meta, publishedFingerprints };

    // Persist publish metadata locally
    const { crux: cruxService } = getServices();
    await cruxService.update(crux.id, { meta: mergedMeta });

    const mergedCrux = { ...crux, ...updated, meta: mergedMeta };
    set({ crux: mergedCrux, hasUnpublishedChanges: false });

    // 4. Sync discoverable state and tags to server
    try {
      if (crux.discoverable) {
        const tags = (crux.meta?.tags as string[]) || [];
        await cruxes.syncTags(crux.id, tags);
      } else {
        await cruxes.syncTags(crux.id, []);
      }
    } catch {
      // Best-effort — publish itself succeeded
    }
  },

  unpublishCrux: async () => {
    const { crux } = get();
    if (!crux) return;

    // Unpublish — removes S3 files and hard-deletes crux + all related entities from API
    const { publish } = getServices();
    await publish.unpublish(crux.id);

    // Update local state
    const meta = { ...crux.meta };
    delete meta.publishedAt;
    delete meta.publishedVersion;
    set({ crux: { ...crux, meta, visibility: 'private' as const } });
  },

  // File CRUD actions
  createFile: async (path: string, content?: string) => {
    const { crux } = get();
    if (!crux) throw new Error('No active crux');
    const { artifact } = getServices();
    const text = content ?? '';
    const ext = path.split('.').pop()?.toLowerCase() || 'txt';
    const mime = MIME_MAP[ext] || 'text/plain';
    const newArtifact = await artifact.create({
      resourceId: crux.id,
      content: text,
      mimeType: mime,
      meta: { path },
    });
    set((state) => ({ artifacts: [...state.artifacts, newArtifact], hasUnpublishedChanges: true }));
    return newArtifact;
  },

  uploadFile: async (file: File, parentPath?: string) => {
    const { crux } = get();
    if (!crux) throw new Error('No active crux');
    const { artifact } = getServices();
    const path = parentPath ? `${parentPath}/${file.name}` : file.name;
    const newArtifact = await artifact.upload({
      resourceId: crux.id,
      blob: file,
      mimeType: file.type || undefined,
      meta: { path },
    });
    set((state) => ({
      artifacts: state.artifacts.some((a) => a.id === newArtifact.id)
        ? state.artifacts.map((a) => (a.id === newArtifact.id ? newArtifact : a))
        : [...state.artifacts, newArtifact],
      hasUnpublishedChanges: true,
    }));
    return newArtifact;
  },

  moveArtifact: async (id: string, newParentPath: string | null) => {
    const { artifacts } = get();
    const { artifact } = getServices();
    const art = artifacts.find((a) => a.id === id);
    if (!art) return;
    const oldPath = art.meta?.path || art.filename || '';
    const filename = oldPath.split('/').pop() || art.filename;
    const newPath = newParentPath ? `${newParentPath}/${filename}` : filename;
    await artifact.update(id, { meta: { path: newPath } });
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
    const { artifact } = getServices();
    await artifact.update(id, { meta: { path: newPath } });
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
    const { artifact } = getServices();
    await artifact.delete(id);
    set((state) => ({
      artifacts: state.artifacts.filter((a) => a.id !== id),
      hasUnpublishedChanges: true,
    }));
    // Also close any editor tab for this file
    const { useUIStore } = await import('@/stores/uiStore');
    useUIStore.getState().closeTab(id);
  },

  deleteArtifacts: async (ids: string[]) => {
    const { artifact } = getServices();
    // Delete all in parallel
    await Promise.allSettled(ids.map((id) => artifact.delete(id)));
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
    const { artifact } = getServices();
    set({ uploadProgress: { total: files.length, completed: 0, currentFile: files[0]?.path || '' } });
    const newArtifacts: Artifact[] = [];
    for (let i = 0; i < files.length; i++) {
      const { file, path } = files[i]!;
      set({ uploadProgress: { total: files.length, completed: i, currentFile: path } });
      try {
        const newArtifact = await artifact.upload({
          resourceId: crux.id,
          blob: file,
          mimeType: file.type || undefined,
          meta: { path },
        });
        newArtifacts.push(newArtifact);
      } catch (err) {
        console.warn(`Failed to upload: ${path}`, err);
      }
    }
    set((state) => {
      const merged = [...state.artifacts];
      for (const a of newArtifacts) {
        const idx = merged.findIndex((e) => e.id === a.id);
        if (idx >= 0) merged[idx] = a;
        else merged.push(a);
      }
      return { artifacts: merged, hasUnpublishedChanges: true, uploadProgress: null };
    });
  },

  saveArtifactContent: async (id: string, content: string) => {
    const { artifacts } = get();
    const { artifact } = getServices();
    const art = artifacts.find((a) => a.id === id);
    if (!art) return;
    const mime = art.mimeType || 'text/plain';
    const blob = new Blob([content], { type: mime });
    const updated = await artifact.upload({
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
    const { artifact, crux: cruxService } = getServices();
    const snapshotArtifacts = await artifact.findByResource('crux', snapshotId);

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
    const { artifact, crux: cruxService } = getServices();

    // Auto-snapshot current state as a safety net before reverting
    try {
      const { createSnapshot } = await import('@/services/growth.service');
      await createSnapshot({ label: 'Before revert', silent: true });
    } catch (err) {
      console.warn('Failed to auto-snapshot before revert:', err);
    }

    // Delete all current workspace artifacts
    const currentArtifacts = await artifact.findByResource('crux', crux.id);
    await Promise.allSettled(currentArtifacts.map((a) => artifact.delete(a.id)));

    // Clone snapshot artifacts to workspace
    await artifact.cloneArtifactsToSnapshot(snapshotId, crux.id);

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
    const newWorkspaceArtifacts = await artifact.findByResource('crux', crux.id);

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
    const { artifact, crux: cruxService } = getServices();

    // Auto-snapshot current state first
    try {
      const { createSnapshot } = await import('@/services/growth.service');
      await createSnapshot({ label: 'Before branch', silent: true });
    } catch (err) {
      console.warn('Failed to auto-snapshot before branch:', err);
    }

    // Delete current workspace artifacts
    const currentArtifacts = await artifact.findByResource('crux', crux.id);
    await Promise.allSettled(currentArtifacts.map((a) => artifact.delete(a.id)));

    // Clone snapshot artifacts to workspace
    await artifact.cloneArtifactsToSnapshot(snapshotId, crux.id);

    // Load snapshot messages — these become the conversation base for the branch
    const snapshotCrux = await cruxService.findById(snapshotId);
    const snapshotMessages: ChatMessage[] = snapshotCrux.meta?.messages || [];

    // Reload workspace artifacts
    const newWorkspaceArtifacts = await artifact.findByResource('crux', crux.id);

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

  addPendingDelete: (artifactId: string, path: string) => {
    set((s) => ({
      pendingDeletes: [...s.pendingDeletes, { artifactId, path }],
    }));
  },

  confirmDelete: async (artifactId: string) => {
    const { crux } = get();
    if (!crux) return;
    const { artifact } = getServices();
    await artifact.delete(artifactId);
    const arts = await artifact.findByResource('crux', crux.id);
    set((s) => ({
      artifacts: arts,
      pendingDeletes: s.pendingDeletes.filter((d) => d.artifactId !== artifactId),
    }));
  },

  dismissDelete: (artifactId: string) => {
    set((s) => ({
      pendingDeletes: s.pendingDeletes.filter((d) => d.artifactId !== artifactId),
    }));
  },
}));
