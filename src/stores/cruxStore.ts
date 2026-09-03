import { create } from 'zustand';
import type { Crux, ChatMessage, Artifact, CruxSummary, Dimension } from '@/api/types';
import type { UpdateCruxInput } from '@/services/types';
import { getServices } from '@/services';
import { guessMimeType } from '@/lib/mime';
import { hasContentChanged } from '@/services/publish';
import {
  walkSnapshotChain,
  collectChainMessages,
  chainLookupFromService,
  createSnapshotCore,
  defaultGrowthDeps,
  generateSnapshotSummary,
  type SnapshotChainNode,
  type CreateSnapshotOptions,
} from '@/services/growth';
import {
  publishPipeline,
  unpublishPipeline,
  describePublishFailure,
  type PublishPhase,
  type PublishFailure,
} from '@/services/publish';
import { projectFolderExists, projectAllArtifacts } from '@/services/project-folder';
import { flushIngestion } from '@/services/ingestion';
import { disposeChatSession } from '@/services/chat-session';
import { captureWorkspacePreview } from '@/services/preview-capture';
import { getPersona } from '@/services/persona';
import { DEFAULT_MODEL, resolveModel } from '@/ai/providers';
import { useUIStore } from '@/stores/uiStore';

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

  // Desktop: the crux's Project Folder is registered but missing on disk
  folderMissing: boolean;

  // Actions
  loadCrux: (id: string) => Promise<void>;
  restoreProjectFolder: () => Promise<void>;
  createCrux: (title?: string) => Promise<Crux>;
  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  /** Shallow-merge a patch into crux.meta in memory (persist with saveMeta). */
  patchCruxMeta: (patch: Record<string, unknown>) => void;
  setStreaming: (streaming: boolean) => void;
  appendStreamContent: (content: string) => void;
  clearStreamContent: () => void;
  setArtifacts: (artifacts: Artifact[]) => void;
  addArtifact: (artifact: Artifact) => void;
  /** Merge an artifact into state by id (insert or replace). */
  upsertArtifact: (artifact: Artifact) => void;
  updateArtifact: (id: string, updates: Partial<Artifact>) => void;
  setModel: (model: string) => void;
  saveMeta: () => Promise<void>;
  updateCrux: (dto: UpdateCruxInput) => Promise<void>;
  reset: () => void;

  // Publish actions
  /** Publish; resolves true on success, false with `publishFailure` set. */
  publishCrux: () => Promise<boolean>;
  /** The step a running publish is on (null when idle). */
  publishPhase: PublishPhase | null;
  /** Why the last publish failed (null after a success or a fresh attempt). */
  publishFailure: PublishFailure | null;
  unpublishCrux: () => Promise<void>;

  // Upload progress
  uploadProgress: { total: number; completed: number; currentFile: string } | null;

  // Token usage tracking (cumulative for the session)
  tokenUsage: { inputTokens: number; outputTokens: number; cachedInputTokens: number };
  addTokenUsage: (input: number, output: number, cached?: number) => void;

  // File CRUD actions
  createFile: (path: string, content?: string) => Promise<Artifact>;
  uploadFile: (file: File, parentPath?: string) => Promise<Artifact>;
  uploadFiles: (files: { file: File; path: string }[]) => Promise<void>;
  moveArtifact: (id: string, newParentPath: string | null) => Promise<void>;
  renameArtifact: (id: string, newPath: string) => Promise<void>;
  deleteArtifact: (id: string) => Promise<void>;
  deleteArtifacts: (ids: string[]) => Promise<void>;
  /** Persist editor content; resolves with the updated artifact (undefined if unknown id). */
  saveArtifactContent: (id: string, content: string) => Promise<Artifact | undefined>;

  // Growth actions
  loadGrowths: () => Promise<void>;
  addGrowth: (growth: Dimension) => void;
  setSummary: (summary: CruxSummary) => void;
  setGrowthCreating: (creating: boolean) => void;
  createSnapshot: (options?: CreateSnapshotOptions) => Promise<void>;

  // Snapshot viewing actions
  viewSnapshot: (snapshotId: string, index: number) => Promise<void>;
  exitSnapshotView: () => Promise<void>;
  revertToSnapshot: (snapshotId: string) => Promise<void>;

  // Branching actions
  branchFromSnapshot: (snapshotId: string, label: string) => Promise<void>;

  // Delete confirmation actions — the AI's delete_file tool blocks on
  // requestDeleteApproval; ChatPane's banner resolves it via confirm/dismiss.
  requestDeleteApproval: (artifactId: string, path: string) => Promise<boolean>;
  confirmDelete: (artifactId: string) => Promise<void>;
  dismissDelete: (artifactId: string) => void;
}

// Waiters on in-flight delete approvals (AI tool blocked on the user).
// Module-level: promises don't belong in serialized store state. Keyed by
// artifact, a LIST because one artifact can have several waiting tool calls.
const deleteResolvers = new Map<string, ((approved: boolean) => void)[]>();

// Monotonic id of the latest loadCrux call — stale loads compare and bail.
let loadGeneration = 0;

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
  folderMissing: false,
  publishPhase: null,
  publishFailure: null,
  uploadProgress: null,
  tokenUsage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },

  addTokenUsage: (input: number, output: number, cached = 0) => {
    set((s) => ({
      tokenUsage: {
        // Input tokens = latest value (represents current conversation size, not cumulative)
        inputTokens: input,
        // Output tokens accumulate across the session
        outputTokens: s.tokenUsage.outputTokens + output,
        // Cache reads = latest value (how much of the last request was served from cache)
        cachedInputTokens: cached,
      },
    }));
  },

  loadCrux: async (id: string) => {
    // Navigating A→B while A is still loading (it awaits every snapshot in
    // the chain) let A's late set() land on top of B. Each call takes a
    // generation; only the newest may write.
    const gen = ++loadGeneration;
    const stillCurrent = () => gen === loadGeneration;
    const { crux: cruxService, artifact } = getServices();
    const crux = await cruxService.findById(id);
    const artifacts = await artifact.findByResource('crux', id);
    if (!stillCurrent()) return;

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
      // Prefetch snapshot nodes, then walk the chain (single implementation
      // in the Growth module) from the active tip.
      const snapshotNodes = new Map<string, SnapshotChainNode>();
      for (const growth of sortedGrowths) {
        try {
          const snapshotCrux = await cruxService.findById(growth.targetId);
          snapshotNodes.set(growth.targetId, {
            id: growth.targetId,
            messages: snapshotCrux.meta?.messages || [],
            parentCruxId: (snapshotCrux.meta?.parentCruxId as string) || null,
          });
        } catch {
          // Snapshot may have been deleted — skip
        }
      }

      // Active tip: the workspace's activeBranch setting, or the latest snapshot
      const activeBranchTip = (crux.meta?.settings?.activeBranch as string) || null;
      const tipId =
        activeBranchTip && snapshotNodes.has(activeBranchTip)
          ? activeBranchTip
          : sortedGrowths[sortedGrowths.length - 1]!.targetId;

      const chain = await walkSnapshotChain(tipId, async (id) => snapshotNodes.get(id) ?? null);
      priorMessages = chain.flatMap((n) => n.messages);
    }

    const fullMessages = priorMessages.concat(workspaceMessages);
    const segmentStart = priorMessages.length;

    if (!stillCurrent()) return;
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
        inputTokens: fullMessages.reduce(
          (sum, m) => sum + Math.ceil((m.content?.length || 0) / 3.5) + 4,
          0,
        ),
        outputTokens: 0,
        cachedInputTokens: 0,
      },
    });

    // Desktop: the folder may have been deleted while the app was closed —
    // the watcher can't see that, so check on open (never cascades; the user
    // chooses whether to restore from history).
    try {
      const exists = await projectFolderExists(id);
      if (stillCurrent()) set({ folderMissing: exists === false });
    } catch {
      if (stillCurrent()) set({ folderMissing: false });
    }
  },

  restoreProjectFolder: async () => {
    const { crux } = get();
    if (!crux) return;
    await projectAllArtifacts(crux.id);
    set({ folderMissing: false });
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
          model: DEFAULT_MODEL,
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

  setMessages: (messages: ChatMessage[]) => {
    set({ messages });
  },

  patchCruxMeta: (patch: Record<string, unknown>) => {
    set((state) => {
      if (!state.crux) return state;
      return { crux: { ...state.crux, meta: { ...state.crux.meta, ...patch } } };
    });
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

  upsertArtifact: (artifact: Artifact) => {
    set((state) => ({
      artifacts: state.artifacts.some((a) => a.id === artifact.id)
        ? state.artifacts.map((a) => (a.id === artifact.id ? artifact : a))
        : [...state.artifacts, artifact],
    }));
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


  saveMeta: async () => {
    const { crux, messages, messageSegmentStart, summary, growthCount } = get();
    if (!crux) return;
    const { crux: cruxService } = getServices();
    // Only persist the current workspace segment, not prior snapshot messages
    const currentSegment = messages.slice(messageSegmentStart);
    const updated = await cruxService.update(crux.id, {
      meta: { ...crux.meta, messages: currentSegment, summary, growthCount },
    });
    // Keep the in-memory crux in step with the row. Without this, crux.meta
    // kept the LOAD-time messages; publish then sent that stale transcript to
    // the API and wrote it back over the segment saved one line earlier.
    // Guard against a workspace switch during the await.
    if (get().crux?.id === crux.id) set({ crux: updated });
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
    loadGeneration++; // any in-flight loadCrux must not resurrect the workspace
    // The Collaboration session (in-flight turn, snapshot timer) belongs to
    // the crux being closed, not to whichever pane happened to be mounted.
    const closing = get().crux?.id;
    if (closing) disposeChatSession(closing);
    // Answer any AI delete request still waiting on the user — clearing the
    // banners alone would leave the tool call (and the whole turn) hanging.
    cancelPendingDeletes();
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

  // Publish actions — the pipeline lives in services/publish (deep module);
  // the store only hands in state and stores the result.
  // Publishing reports its own outcome: both entry points used to `catch {}`,
  // so a failed site build looked exactly like a publish that did nothing.
  // The phase and the failure live here so the Share pane can show them
  // whichever button started the publish.
  publishCrux: async () => {
    const { crux, artifacts, saveMeta } = get();
    if (!crux) return false;
    set({ publishFailure: null, publishPhase: 'sync' });
    try {
      await saveMeta();
      const mergedCrux = await publishPipeline(crux, artifacts || [], {
        onProgress: (phase) => set({ publishPhase: phase }),
      });
      set({ crux: mergedCrux, hasUnpublishedChanges: false });
      return true;
    } catch (err) {
      console.error('[publish] failed:', err);
      set({ publishFailure: describePublishFailure(err) });
      return false;
    } finally {
      set({ publishPhase: null });
    }
  },

  unpublishCrux: async () => {
    const { crux } = get();
    if (!crux) return;
    const updated = await unpublishPipeline(crux);
    set({ crux: updated });
  },

  // File CRUD actions
  createFile: async (path: string, content?: string) => {
    const { crux } = get();
    if (!crux) throw new Error('No active crux');
    const { artifact } = getServices();
    const text = content ?? '';
    const guessed = guessMimeType(path);
    // User-created files default to editable text, not opaque bytes
    const mime = guessed === 'application/octet-stream' ? 'text/plain' : guessed;
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
    const uiStore = useUIStore.getState();
    for (const id of ids) {
      uiStore.closeTab(id);
    }
  },

  uploadFiles: async (files: { file: File; path: string }[]) => {
    const { crux } = get();
    if (!crux) throw new Error('No active crux');
    const { artifact } = getServices();
    set({
      uploadProgress: { total: files.length, completed: 0, currentFile: files[0]?.path || '' },
    });
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
    if (!art) return undefined;
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
    return updated;
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

  // The snapshot lifecycle lives in services/growth (deep module); this action
  // gathers workspace state, runs the core, and applies the result.
  createSnapshot: async (options = {}) => {
    // Desktop (ADR 0001): external edits may still be mid-ingest — a snapshot
    // must never capture a half-observed state. Resolves immediately on web.
    await flushIngestion();

    const { crux, messages, messageSegmentStart, growths, growthCount } = get();
    if (!crux) return;

    // Snapshot-with-screenshot: if a local preview is running (desktop),
    // screenshot its front page into preview.jpg first so the snapshot clone
    // carries a fresh thumbnail. Best-effort — never blocks the snapshot.
    const previewShot = await captureWorkspacePreview(crux.id);
    if (previewShot) {
      const existing = get().artifacts.find((a) => a.id === previewShot.id);
      if (existing) get().updateArtifact(previewShot.id, previewShot);
      else get().addArtifact(previewShot);
    }

    const deps = await defaultGrowthDeps();
    const result = await createSnapshotCore(
      {
        crux,
        messages,
        messageSegmentStart,
        growths,
        growthCount,
        artifactCount: get().artifacts.length,
      },
      options,
      deps,
    );

    get().addGrowth(result.growth);
    // Advance segment start so saveMeta only persists new messages going forward
    set({ messageSegmentStart: get().messages.length });

    // Advance the branch tip. `branchFromSnapshot` sets activeBranch and it was
    // never moved on, so every later snapshot re-parented onto the branch point
    // (a star, not a chain) and loadCrux — which walks back from activeBranch —
    // dropped every post-branch conversation segment on reload.
    if (get().crux?.meta?.settings?.activeBranch) {
      get().patchCruxMeta({
        settings: {
          ...(get().crux!.meta!.settings as Record<string, unknown>),
          activeBranch: result.snapshotCruxId,
        },
      });
    }
    await get().saveMeta();

    // Fire-and-forget AI summary — scoped to the segment this snapshot captured
    if (!options.silent) {
      const model = resolveModel(crux.meta?.settings?.model);
      void generateSnapshotSummary({
        dimensionId: result.growth.id,
        messages: messages.slice(messageSegmentStart),
        artifactNames: result.artifactNames,
        model,
        previousSummary: result.previousSummary,
        deps,
        onApplied: (dimensionId, summary) =>
          set((s) => ({
            growths: s.growths.map((g) =>
              g.id === dimensionId ? { ...g, meta: { ...g.meta, summary } } : g,
            ),
          })),
      });
    }
  },

  // Snapshot viewing actions
  viewSnapshot: async (snapshotId: string, index: number) => {
    const {
      crux,
      artifacts,
      messages,
      messageSegmentStart,
      workspaceArtifacts,
      workspaceMessages,
    } = get();
    if (!crux) return;
    const { artifact, crux: cruxService } = getServices();
    const snapshotArtifacts = await artifact.findByResource('crux', snapshotId);

    // Load snapshot crux to get its cumulative message count
    const snapshotCrux = await cruxService.findById(snapshotId);
    // Use cumulativeMessageCount (new format) or fall back to messages.length (old format where full conversation was stored)
    const cumulativeCount =
      (snapshotCrux.meta?.cumulativeMessageCount as number) ??
      (snapshotCrux.meta?.messages as ChatMessage[] | undefined)?.length ??
      0;

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
    const activeTabId = useUIStore.getState().editor.activeTabId;
    if (activeTabId) {
      const sourceArtifacts = workspaceArtifacts ?? artifacts;
      const prev = sourceArtifacts.find((a) => a.id === activeTabId);
      if (prev) {
        const prevPath = (prev.meta?.path || prev.filename || '') as string;
        const match = snapshotArtifacts.find(
          (a) => (a.meta?.path || a.filename || '') === prevPath,
        );
        if (match) {
          useUIStore.getState().openFile(match.id, prevPath);
        }
      }
    }
  },

  exitSnapshotView: async () => {
    const { workspaceArtifacts, workspaceMessages, workspaceSegmentStart, artifacts } = get();

    // Capture active tab path before swapping artifacts
    const activeTabId = useUIStore.getState().editor.activeTabId;
    const prevPath = activeTabId
      ? ((artifacts.find((a) => a.id === activeTabId)?.meta?.path ||
          artifacts.find((a) => a.id === activeTabId)?.filename ||
          '') as string)
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
      await get().createSnapshot({ label: 'Before revert', silent: true });
    } catch (err) {
      console.warn('Failed to auto-snapshot before revert:', err);
    }

    // Delete all current workspace artifacts
    const currentArtifacts = await artifact.findByResource('crux', crux.id);
    await Promise.allSettled(currentArtifacts.map((a) => artifact.delete(a.id)));

    // Clone snapshot artifacts to workspace. The clone is metadata-only
    // (rows pointing at fingerprints) while the deletes above wrote through
    // to disk — so on desktop the Project Folder would be EMPTY after a
    // revert. Re-project the store onto the folder (no-op on web).
    await artifact.cloneArtifactsToSnapshot(snapshotId, crux.id);
    await projectAllArtifacts(crux.id);

    // Rebuild conversation via the chain walk (Growth module, single impl)
    const priorMessages = await collectChainMessages(
      snapshotId,
      chainLookupFromService({ findById: (id) => cruxService.findById(id) }),
    );

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

    // The reverted-to snapshot is now the tip: the next snapshot must chain
    // from it, and a reload must walk back from it. Without this the next
    // snapshot parented onto the "Before revert" safety snapshot and a reload
    // reconstructed the pre-revert conversation. (branchFromSnapshot already
    // did this; revert is the same operation without a label.)
    get().patchCruxMeta({
      settings: { ...(get().crux?.meta?.settings ?? {}), activeBranch: snapshotId },
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
      await get().createSnapshot({ label: 'Before branch', silent: true });
    } catch (err) {
      console.warn('Failed to auto-snapshot before branch:', err);
    }

    // Delete current workspace artifacts
    const currentArtifacts = await artifact.findByResource('crux', crux.id);
    await Promise.allSettled(currentArtifacts.map((a) => artifact.delete(a.id)));

    // Clone snapshot artifacts to workspace. The clone is metadata-only
    // (rows pointing at fingerprints) while the deletes above wrote through
    // to disk — so on desktop the Project Folder would be EMPTY after a
    // revert. Re-project the store onto the folder (no-op on web).
    await artifact.cloneArtifactsToSnapshot(snapshotId, crux.id);
    await projectAllArtifacts(crux.id);

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

  requestDeleteApproval: (artifactId: string, path: string) => {
    // A model can emit the same delete twice in one step. Both callers must
    // settle, so waiters are queued per artifact — overwriting the resolver
    // orphaned the first promise and hung the whole conversation.
    const existing = deleteResolvers.get(artifactId);
    if (existing) {
      return new Promise<boolean>((resolve) => existing.push(resolve));
    }
    return new Promise<boolean>((resolve) => {
      deleteResolvers.set(artifactId, [resolve]);
      set((s) => ({
        pendingDeletes: [...s.pendingDeletes, { artifactId, path }],
      }));
    });
  },

  confirmDelete: async (artifactId: string) => {
    const { crux } = get();
    try {
      if (!crux) return;
      // Same path as a user-initiated delete: closes the editor tab, updates
      // publish state, writes through to the Project Folder.
      await get().deleteArtifact(artifactId);
      settleDeleteApproval(artifactId, true);
    } catch (err) {
      console.error('Delete failed:', err);
      settleDeleteApproval(artifactId, false); // never strand the tool call
    } finally {
      // Whatever happened, the banner goes away and nobody is left waiting
      set((s) => ({ pendingDeletes: s.pendingDeletes.filter((d) => d.artifactId !== artifactId) }));
      settleDeleteApproval(artifactId, false);
    }
  },

  dismissDelete: (artifactId: string) => {
    set((s) => ({
      pendingDeletes: s.pendingDeletes.filter((d) => d.artifactId !== artifactId),
    }));
    settleDeleteApproval(artifactId, false);
  },
}));

/**
 * Resolve every waiter on a pending delete. Safe to call twice — the entry is
 * removed first, so a later "cleanup" call is a no-op rather than a
 * contradiction.
 */
function settleDeleteApproval(artifactId: string, approved: boolean): void {
  const waiters = deleteResolvers.get(artifactId);
  if (!waiters) return;
  deleteResolvers.delete(artifactId);
  for (const resolve of waiters) resolve(approved);
}

/**
 * Answer "no" to every outstanding delete request. Called when the workspace
 * is torn down or a turn is aborted: without it the tool call awaits forever,
 * the SDK step never settles, and the conversation is stuck permanently.
 */
export function cancelPendingDeletes(): void {
  for (const artifactId of [...deleteResolvers.keys()]) {
    settleDeleteApproval(artifactId, false);
  }
  useCruxStore.setState({ pendingDeletes: [] });
}

// Desktop (ADR 0001): when the ingestion service records external Project
// Folder edits for the open crux, refresh the artifacts panel in place.
if (typeof window !== 'undefined') {
  window.addEventListener('crux:external-change', async (e) => {
    const { cruxId } = (e as CustomEvent<{ cruxId: string }>).detail;
    const { crux } = useCruxStore.getState();
    if (!crux || crux.id !== cruxId) return;
    try {
      const { artifact } = getServices();
      const arts = await artifact.findByResource('crux', cruxId);
      useCruxStore.getState().setArtifacts(arts);
    } catch {
      /* services not ready — panel refreshes on next load */
    }
  });

  // A Project Folder disappeared at runtime — offer restore, never delete
  window.addEventListener('crux:folder-missing', (e) => {
    const { cruxId } = (e as CustomEvent<{ cruxId: string | null }>).detail;
    const { crux } = useCruxStore.getState();
    if (crux && crux.id === cruxId) {
      useCruxStore.setState({ folderMissing: true });
    }
  });
}
