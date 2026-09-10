import { assertCopyWritable } from '@/services/working-copies';
import { create, useStore, type StoreApi } from 'zustand';
import { useContext } from 'react';
import { WorkspaceContext, workspaceSelection, trackWorkspacePromise } from './workspaceSelection';
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
  removeLatestSnapshotCore,
  defaultGrowthDeps,
  generateSnapshotSummary,
  registerGrowthHost,
  workspaceGrowthHost,
  workspaceUnchangedSinceTip,
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
import { reconcilePersistedJob, type TurnJob } from '@/services/turn-jobs';
import { captureWorkspacePreview } from '@/services/preview-capture';
import { getPersona, getPersonaFingerprint, personaSnapshotOf } from '@/services/persona';
import { DEFAULT_MODEL, resolveModel } from '@/ai/providers';
import { useUIStore, type UIState } from '@/stores/uiStore';
import { playCue } from '@/services/cues';

function liveArtifactPatch(state: CruxState, artifacts: Artifact[]): Partial<CruxState> {
  return state.workspaceArtifacts ? { workspaceArtifacts: artifacts } : { artifacts };
}
export interface CruxState {
  cancelPendingDeletes: () => void;
  drain: () => Promise<void>;
  closing: boolean;
  // Active workspace
  crux: Crux | null;
  messages: ChatMessage[]; // Full conversation (all segments concatenated)
  messageSegmentStart: number; // Index where the current workspace segment begins
  artifacts: Artifact[];
  summary: CruxSummary | null;

  // Streaming state
  isStreaming: boolean;
  streamingContent: string;

  // Background Turn (B3): the latest job for this crux and messages queued behind it.
  // Mirrored into crux.meta.turnJob / turnQueue by persistTurnState.
  turnJob: TurnJob | null;
  turnQueue: string[];

  // Publish state
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
  setTurnJob: (job: TurnJob | null) => void;
  setTurnQueue: (queue: string[]) => void;
  /** Write turnJob + turnQueue into crux.meta and save — a relaunch reports the job, not loses it. */
  persistTurnState: () => Promise<void>;
  appendStreamContent: (content: string) => void;
  clearStreamContent: () => void;
  /** Re-read the workspace's artifacts from the store (snapshot-view aware). */
  refreshArtifacts: () => Promise<void>;
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
  /**
   * `ifChanged`: skip when the workspace already matches the branch tip — the
   * dedupe for automatic snapshots (end-of-turn, per-step) so a model-taken
   * snapshot is never followed by an identical one. Manual snapshots and the
   * safety snapshots the Revert/Branch dialogs promise always land.
   */
  createSnapshot: (options?: CreateSnapshotOptions & { ifChanged?: boolean }) => Promise<void>;
  /** Remove the most recent snapshot (history walks back one; files untouched). */
  removeLatestSnapshot: () => Promise<void>;

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

/**
 * Derived, never stored: a published crux has unpublished changes when the
 * working files' fingerprints differ from the snapshot taken at publish.
 * The stored flag this replaces was set `true` by nine mutators — including
 * the thumbnail capture, whose preview.jpg is excluded from publish by design,
 * so a screenshot flipped a published crux to "changed".
 */
export const selectHasUnpublishedChanges = (s: CruxState): boolean =>
  hasContentChanged(
    s.artifacts,
    s.crux?.meta?.publishedFingerprints as Record<string, string> | undefined,
  );

/**
 * After the workspace's artifacts were replaced (revert, branch), every open
 * editor tab points at an id that no longer exists. Re-point each by path to
 * the new artifact; a path that vanished loses its tab.
 */
function rebindEditorTabs(ui: StoreApi<UIState>, artifacts: Artifact[]): void {
  const editor = ui.getState().editor;
  const byPath = new Map(artifacts.map((a) => [(a.meta?.path || a.filename || '') as string, a]));
  const active = editor.tabs.find((t) => t.id === editor.activeTabId);
  for (const tab of editor.tabs) {
    const match = byPath.get(tab.path);
    if (match) ui.getState().openFile(match.id, tab.path);
    else ui.getState().closeTab(tab.id);
  }
  const activeMatch = active ? byPath.get(active.path) : undefined;
  if (activeMatch) ui.getState().setActiveTab(activeMatch.id);
}

export function createCruxStore(ui: StoreApi<UIState> = useUIStore) {
  // Waiters on in-flight delete approvals (AI tool blocked on the user).
  // Module-level: promises don't belong in serialized store state. Keyed by
  // artifact, a LIST because one artifact can have several waiting tool calls.
  const deleteResolvers = new Map<string, ((approved: boolean) => void)[]>();

  // The open workspace's GrowthHost registration (growth tools mutate the live
  // store, not persisted copies); replaced on load, dropped on reset.
  let unregisterGrowthHost: (() => void) | null = null;

  // Monotonic id of the latest loadCrux call — stale loads compare and bail.
  let loadGeneration = 0;
  let viewGeneration = 0;

  let metadataTail: Promise<unknown> = Promise.resolve();
  let snapshotTail: Promise<unknown> = Promise.resolve();
  const store = create<CruxState>((set, get) => ({
    closing: false,
    cancelPendingDeletes: () => {
      for (const id of [...deleteResolvers.keys()]) settleDeleteApproval(id, false);
      set({ pendingDeletes: [] });
    },
    drain: async () => {
      await metadataTail;
    },
    crux: null,
    messages: [],
    messageSegmentStart: 0,
    artifacts: [],
    summary: null,
    isStreaming: false,
    streamingContent: '',
    turnJob: null,
    turnQueue: [],
    growths: [],
    growthCount: 0,
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

      // A Background Turn persisted as still running can only mean the app
      // closed under it: report it as interrupted (with its last snapshot),
      // and write that back so the next load agrees.
      const persistedJob = (crux.meta?.turnJob as TurnJob | undefined) ?? null;
      const turnJob = reconcilePersistedJob(persistedJob);
      if (turnJob !== persistedJob) {
        crux.meta = { ...crux.meta, turnJob };
        await cruxService.update(id, { meta: crux.meta });
      }
      const turnQueue = Array.isArray(crux.meta?.turnQueue)
        ? (crux.meta.turnQueue as unknown[]).filter((q): q is string => typeof q === 'string')
        : [];

      if (!stillCurrent()) return;
      set({
        crux,
        turnJob,
        turnQueue,
        messages: fullMessages,
        messageSegmentStart: segmentStart,
        artifacts,
        summary: crux.meta?.summary || null,
        growthCount: crux.meta?.growthCount || 0,
        growths: sortedGrowths,
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

      // Growth tools (snapshot/restore/branch — B0) act on the live workspace
      // while this crux is open: the store's own actions, the store's own
      // safety snapshots.
      unregisterGrowthHost?.();
      unregisterGrowthHost = registerGrowthHost(
        id,
        workspaceGrowthHost(
          {
            cruxId: id,
            getCrux: () => get().crux,
            getGrowths: () => get().growths,
            createSnapshot: (options) => get().createSnapshot(options),
            revertToSnapshot: (snapshotId) => get().revertToSnapshot(snapshotId),
            branchFromSnapshot: (snapshotId, label) => get().branchFromSnapshot(snapshotId, label),
          },
          { crux: cruxService, artifact },
        ),
      );

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

      // The greeting is spoken by the current persona: stamp it and record the
      // persona snapshot so the bubble is labelled correctly (and stays so if
      // the Mood changes later).
      const persona = getPersona();
      const pf = getPersonaFingerprint(persona);
      const greeting: ChatMessage = {
        role: 'assistant',
        content: persona.greeting || 'What would you like to create today?',
        timestamp: new Date().toISOString(),
        personaFingerprint: pf,
      };

      const initialMessages = [greeting];
      const personaSnapshots = { [pf]: personaSnapshotOf(persona) };

      const crux = await cruxService.create({
        slug,
        title: title || 'New Crux',
        type: 'workspace',
        data: '',
        meta: {
          messages: initialMessages,
          personaSnapshots,
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

    setTurnJob: (job: TurnJob | null) => {
      set({ turnJob: job });
    },

    setTurnQueue: (queue: string[]) => {
      set({ turnQueue: queue });
    },

    persistTurnState: async () => {
      const { crux, turnJob, turnQueue } = get();
      if (!crux) return;
      get().patchCruxMeta({ turnJob, turnQueue });
      await get().saveMeta();
    },

    appendStreamContent: (content: string) => {
      set((state) => ({
        streamingContent: state.streamingContent + content,
      }));
    },

    clearStreamContent: () => {
      set({ streamingContent: '' });
    },

    refreshArtifacts: async () => {
      const { crux } = get();
      if (!crux) return;
      const { artifact } = getServices();
      const arts = await artifact.findByResource('crux', crux.id);
      // Still the same workspace? (a slow refresh must not land on another crux)
      if (get().crux?.id !== crux.id) return;
      // While a snapshot is being viewed, `artifacts` shows the SNAPSHOT's files
      // and the workspace's live list is stashed. A refresh (ingestion, AI tool)
      // updates the stash, so exiting the snapshot restores current truth rather
      // than the list from before the change.
      if (get().viewingSnapshotId) set({ workspaceArtifacts: arts });
      else set({ artifacts: arts });
    },

    setArtifacts: (artifacts: Artifact[]) => {
      set((s) => ({
        artifacts,
        artifactsVersion: s.artifactsVersion + 1,
      }));
    },

    addArtifact: (artifact: Artifact) => {
      set((state) =>
        liveArtifactPatch(state, [...(state.workspaceArtifacts ?? state.artifacts), artifact]),
      );
    },

    upsertArtifact: (artifact: Artifact) => {
      set((state) => {
        const live = state.workspaceArtifacts ?? state.artifacts;
        return liveArtifactPatch(
          state,
          live.some((a) => a.id === artifact.id)
            ? live.map((a) => (a.id === artifact.id ? artifact : a))
            : [...live, artifact],
        );
      });
    },

    updateArtifact: (id: string, updates: Partial<Artifact>) => {
      set((state) => {
        const newArtifacts = (state.workspaceArtifacts ?? state.artifacts).map((a) =>
          a.id === id ? { ...a, ...updates } : a,
        );
        return liveArtifactPatch(state, newArtifacts);
      });
    },

    setModel: (model: string) => {
      const { crux, saveMeta } = get();
      if (!crux) return;
      const meta = { ...crux.meta, settings: { ...crux.meta?.settings, model } };
      set({ crux: { ...crux, meta } });
      saveMeta();
    },

    saveMeta: () => {
      const write = metadataTail.then(async () => {
        const { crux, messages, messageSegmentStart, summary, growthCount } = get();
        if (!crux) return;
        const meta = {
          ...crux.meta,
          messages: messages.slice(messageSegmentStart),
          summary,
          growthCount,
        };
        const updated = await getServices().crux.update(crux.id, { meta });
        if (get().crux === crux) set({ crux: updated });
      });
      metadataTail = write.catch(() => {});
      return write;
    },

    updateCrux: (dto) => {
      const write = metadataTail.then(async () => {
        const crux = get().crux;
        if (!crux) return;
        const input = { ...dto, ...(dto.meta ? { meta: { ...crux.meta, ...dto.meta } } : {}) };
        const updated = await getServices().crux.update(crux.id, input);
        set((s) => ({
          crux: s.crux
            ? {
                ...s.crux,
                ...updated,
                meta: {
                  ...updated.meta,
                  ...s.crux.meta,
                  ...dto.meta,
                  ...(dto.meta?.settings
                    ? { settings: { ...s.crux.meta?.settings, ...dto.meta.settings } }
                    : {}),
                },
              }
            : null,
        }));
      });
      metadataTail = write.catch(() => {});
      return write;
    },

    reset: () => {
      viewGeneration++;
      loadGeneration++; // any in-flight loadCrux must not resurrect the workspace
      // The Collaboration session (in-flight turn, snapshot timer) belongs to
      // the crux being closed, not to whichever pane happened to be mounted.
      const closing = get().crux?.id;
      if (closing) disposeChatSession(closing);
      unregisterGrowthHost?.();
      unregisterGrowthHost = null;
      // Answer any AI delete request still waiting on the user — clearing the
      // banners alone would leave the tool call (and the whole turn) hanging.
      get().cancelPendingDeletes();
      set({
        crux: null,
        messages: [],
        messageSegmentStart: 0,
        artifacts: [],
        summary: null,
        isStreaming: false,
        streamingContent: '',
        turnJob: null,
        turnQueue: [],
        growths: [],
        growthCount: 0,
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
        const mergedCrux = await publishPipeline(get().crux!, artifacts || [], {
          messages: get().messages,
          onProgress: (phase) => set({ publishPhase: phase }),
        });
        set({ crux: mergedCrux });
        void playCue('published');
        return true;
      } catch (err) {
        console.error('[publish] failed:', err);
        set({ publishFailure: describePublishFailure(err) });
        void playCue('error');
        return false;
      } finally {
        set({ publishPhase: null });
      }
    },

    unpublishCrux: async () => {
      const { crux } = get();
      if (!crux) return;
      const updated = await unpublishPipeline(crux);
      // A failure from an earlier publish attempt no longer describes anything.
      set({ crux: updated, publishFailure: null });
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
      set((state) => ({ artifacts: [...state.artifacts, newArtifact] }));
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
      }));
    },

    deleteArtifact: async (id: string) => {
      const { artifact } = getServices();
      await artifact.delete(id);
      set((state) => ({
        artifacts: state.artifacts.filter((a) => a.id !== id),
      }));
      // Also close any editor tab for this file
      ui.getState().closeTab(id);
    },

    deleteArtifacts: async (ids: string[]) => {
      const { artifact } = getServices();
      // Delete all in parallel
      await Promise.allSettled(ids.map((id) => artifact.delete(id)));
      const idSet = new Set(ids);
      set((state) => ({
        artifacts: state.artifacts.filter((a) => !idSet.has(a.id)),
      }));
      // Close editor tabs for all deleted files
      const uiStore = ui.getState();
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
        return { artifacts: merged, uploadProgress: null };
      });
    },

    saveArtifactContent: async (id: string, content: string) => {
      const { artifacts, workspaceArtifacts } = get();
      const { artifact } = getServices();
      const art = (workspaceArtifacts ?? artifacts).find((a) => a.id === id);
      if (!art) return undefined;
      const mime = art.mimeType || 'text/plain';
      // Text goes through `create` (dedups on the path, keeps `encoding: 'utf-8'`).
      // This used to `upload()` a Blob, which flips the row to `encoding: 'binary'`
      // — after which `readContent` refused the file the editor had just saved.
      const updated = await artifact.create({
        resourceId: art.resourceId,
        content,
        mimeType: mime,
        meta: { path: art.meta?.path },
      });
      set((state) => ({
        ...(state.workspaceArtifacts
          ? {
              workspaceArtifacts: state.workspaceArtifacts.map((a) =>
                a.id === id ? { ...a, ...updated } : a,
              ),
            }
          : { artifacts: state.artifacts.map((a) => (a.id === id ? { ...a, ...updated } : a)) }),
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
    removeLatestSnapshot: async () => {
      if (get().crux) await assertCopyWritable(get().crux!.id);
      if (
        get().isStreaming ||
        ['planning', 'running', 'checking'].includes(get().turnJob?.status ?? '')
      )
        throw new Error('Stop the running turn before changing Growth.');
      const { crux, growths, viewingSnapshotId } = get();
      if (!crux || growths.length === 0) return;
      const tip = [...growths].sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0)).at(-1)!;
      // Looking at the snapshot being removed: leave it first, then remove.
      if (viewingSnapshotId === tip.targetId) await get().exitSnapshotView();

      const deps = await defaultGrowthDeps();
      const result = await removeLatestSnapshotCore(
        { crux: get().crux!, growths: get().growths },
        deps,
      );
      if (!result) return;

      set((state) => ({
        growths: state.growths.filter((g) => g.id !== result.growthId),
        growthCount: Math.max(0, state.growthCount - 1),
        // The removed segment is back in the workspace segment
        messageSegmentStart: Math.max(
          0,
          state.messageSegmentStart - result.restoredMessages.length,
        ),
      }));
      if (result.activeBranch !== undefined) {
        const settings = { ...(get().crux?.meta?.settings ?? {}) } as Record<string, unknown>;
        if (result.activeBranch) settings.activeBranch = result.activeBranch;
        else delete settings.activeBranch;
        get().patchCruxMeta({ settings });
      }
      await get().saveMeta();
    },

    createSnapshot: (options = {}) => {
      const operation = snapshotTail.then(async () => {
        // Desktop (ADR 0001): external edits may still be mid-ingest — a snapshot
        // must never capture a half-observed state. Resolves immediately on web.
        await flushIngestion();

        const { crux, messages, messageSegmentStart, growths, growthCount } = get();
        if (!crux) return;
        if (!options.taskOperation) await assertCopyWritable(crux.id);

        const deps = await defaultGrowthDeps();
        if (options.ifChanged && (await workspaceUnchangedSinceTip(crux, growths, deps))) return;

        // Snapshot-with-screenshot: if a local preview is running (desktop),
        // screenshot its front page into preview.jpg first so the snapshot clone
        // carries a fresh thumbnail. Best-effort — never blocks the snapshot.
        const previewShot = options.taskOperation ? null : await captureWorkspacePreview(crux.id);
        if (previewShot) {
          const existing = (get().workspaceArtifacts ?? get().artifacts).find(
            (a) => a.id === previewShot.id,
          );
          if (existing) get().updateArtifact(previewShot.id, previewShot);
          else get().addArtifact(previewShot);
        }

        const result = await createSnapshotCore(
          {
            crux,
            messages,
            messageSegmentStart,
            growths,
            growthCount,
            artifactCount: (get().workspaceArtifacts ?? get().artifacts).length,
          },
          options,
          deps,
        );

        get().addGrowth(result.growth);
        // Advance segment start so saveMeta only persists new messages going forward
        set({ messageSegmentStart: result.newSegmentStart });

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
        void playCue('snapshot');

        // Fire-and-forget AI summary — scoped to the segment this snapshot captured
        if (!options.silent) {
          const model = resolveModel(crux.meta?.settings?.model);
          void trackWorkspacePromise(
            store,
            generateSnapshotSummary({
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
            }),
          );
        }
      });
      snapshotTail = operation.catch(() => {});
      return operation;
    },

    // Snapshot viewing actions
    viewSnapshot: async (snapshotId: string, index: number) => {
      const generation = ++viewGeneration;
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
      if (generation !== viewGeneration || get().crux?.id !== crux.id) return;
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
        workspaceArtifacts: get().workspaceArtifacts ?? get().artifacts,
        workspaceMessages: workspaceMessages ?? messages,
        workspaceSegmentStart: get().workspaceSegmentStart ?? messageSegmentStart,
      });

      // Re-select the same file (by path) in the new artifact set
      const activeTabId = ui.getState().editor.activeTabId;
      if (activeTabId) {
        const sourceArtifacts = workspaceArtifacts ?? artifacts;
        const prev = sourceArtifacts.find((a) => a.id === activeTabId);
        if (prev) {
          const prevPath = (prev.meta?.path || prev.filename || '') as string;
          const match = snapshotArtifacts.find(
            (a) => (a.meta?.path || a.filename || '') === prevPath,
          );
          if (match) {
            ui.getState().openFile(match.id, prevPath);
          }
        }
      }
    },

    exitSnapshotView: async () => {
      viewGeneration++;
      if (!get().viewingSnapshotId) return;
      const { workspaceArtifacts, artifacts } = get();

      // Capture active tab path before swapping artifacts
      const activeTabId = ui.getState().editor.activeTabId;
      const prevPath = activeTabId
        ? ((artifacts.find((a) => a.id === activeTabId)?.meta?.path ||
            artifacts.find((a) => a.id === activeTabId)?.filename ||
            '') as string)
        : null;

      set({
        viewingSnapshotId: null,
        viewingSnapshotIndex: null,
        artifacts: workspaceArtifacts ?? [],

        workspaceArtifacts: null,
        workspaceMessages: null,
        workspaceSegmentStart: null,
        snapshotMessageCount: null,
      });
      rebindEditorTabs(ui, workspaceArtifacts ?? []);

      // Re-select the same file (by path) in workspace artifacts
      if (prevPath && workspaceArtifacts) {
        const match = workspaceArtifacts.find(
          (a) => (a.meta?.path || a.filename || '') === prevPath,
        );
        if (match) {
          ui.getState().openFile(match.id, prevPath);
        }
      }
    },

    revertToSnapshot: async (snapshotId: string) => {
      if (get().crux) await assertCopyWritable(get().crux!.id);
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
        chainLookupFromService({
          findById: (id) => cruxService.findById(id),
          contentOwnerId: crux.meta?.workingCopy ? crux.id : undefined,
        }),
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
      rebindEditorTabs(ui, newWorkspaceArtifacts);

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
      if (get().crux) await assertCopyWritable(get().crux!.id);
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
      const snapshotMessages: ChatMessage[] = crux.meta?.workingCopy
        ? await collectChainMessages(
            snapshotId,
            chainLookupFromService({
              findById: (id) => cruxService.findById(id),
              contentOwnerId: crux.id,
            }),
          )
        : snapshotCrux.meta?.messages || [];

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
      rebindEditorTabs(ui, newWorkspaceArtifacts);

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
        set((s) => ({
          pendingDeletes: s.pendingDeletes.filter((d) => d.artifactId !== artifactId),
        }));
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

  return store;
}

const emptyStore = createCruxStore();
export function useCruxStoreApi(): StoreApi<CruxState> {
  const context = useContext(WorkspaceContext);
  const selected = useStore(workspaceSelection, (s) => s.active);
  return (context ?? selected)?.data ?? emptyStore;
}
export function useCruxStore<T>(selector: (state: CruxState) => T): T {
  return useStore(useCruxStoreApi(), selector);
}
