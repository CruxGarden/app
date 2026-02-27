import { create } from 'zustand';
import type { Crux, ChatMessage, Attachment, CruxSummary, Dimension, UpdateCruxDto } from '@/api/types';
import type { Palette } from '@/lib/palette';
import { applyPalette, resetPalette } from '@/lib/palette';
import { cruxes } from '@/api';

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

  // Gate state
  gates: Dimension[];
  gateCount: number;
  isCreatingGate: boolean;
  pendingGateCreation: boolean;

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
  updateCrux: (dto: UpdateCruxDto) => Promise<void>;
  reset: () => void;

  // Publish actions
  publishCrux: () => Promise<void>;
  unpublishCrux: () => Promise<void>;

  // File CRUD actions
  createFile: (path: string, content?: string) => Promise<Attachment>;
  uploadFile: (file: File, parentPath?: string) => Promise<Attachment>;
  moveArtifact: (id: string, newParentPath: string | null) => Promise<void>;
  renameArtifact: (id: string, newPath: string) => Promise<void>;
  deleteArtifact: (id: string) => Promise<void>;
  saveArtifactContent: (id: string, content: string) => Promise<void>;

  // Gate actions
  loadGates: () => Promise<void>;
  addGate: (gate: Dimension) => void;
  setSummary: (summary: CruxSummary) => void;
  setGateCreating: (creating: boolean) => void;
  setPendingGateCreation: (pending: boolean) => void;
}

export const useCruxStore = create<CruxState>((set, get) => ({
  crux: null,
  messages: [],
  artifacts: [],
  summary: null,
  isStreaming: false,
  streamingContent: '',
  gates: [],
  gateCount: 0,
  hasUnpublishedChanges: false,
  isCreatingGate: false,
  pendingGateCreation: false,

  loadCrux: async (id: string) => {
    const crux = await cruxes.get(id);
    const attachments = await cruxes.getAttachments(id);
    // Apply stored palette before setting state
    if (crux.meta?.settings?.palette) {
      applyPalette(crux.meta.settings.palette);
    }

    // Detect if anything was modified after the last publish
    let hasChanges = false;
    const publishedAt = crux.meta?.publishedAt as string | undefined;
    if (publishedAt) {
      const publishedMs = new Date(publishedAt).getTime();
      // Check if crux metadata (title, slug, etc.) changed after publish
      if (new Date(crux.updated).getTime() > publishedMs) {
        hasChanges = true;
      }
      // Check if any attachment was modified after publish
      if (!hasChanges && attachments.length > 0) {
        hasChanges = attachments.some(
          (a) => new Date(a.updated).getTime() > publishedMs,
        );
      }
    }

    set({
      crux,
      messages: crux.meta?.messages || [],
      artifacts: attachments,
      summary: crux.meta?.summary || null,
      gateCount: crux.meta?.gateCount || 0,
      hasUnpublishedChanges: hasChanges,
    });
  },

  createCrux: async (title?: string) => {
    const slug =
      (title || 'untitled')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') +
      '-' +
      Date.now().toString(36);

    const crux = await cruxes.create({
      slug,
      title: title || 'New Crux',
      type: 'workspace',
      data: '',
      meta: { messages: [], summary: null, settings: { model: 'claude-sonnet-4-20250514' } },
    });

    set({
      crux,
      messages: [],
      artifacts: [],
      summary: null,
      gates: [],
      gateCount: 0,
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
    set({ artifacts, hasUnpublishedChanges: true });
  },

  addArtifact: (artifact: Attachment) => {
    set((state) => ({ artifacts: [...state.artifacts, artifact], hasUnpublishedChanges: true }));
  },

  updateArtifact: (id: string, updates: Partial<Attachment>) => {
    set((state) => ({
      artifacts: state.artifacts.map((a) =>
        a.id === id ? { ...a, ...updates } : a,
      ),
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
    const { crux, messages, summary, gateCount } = get();
    if (!crux) return;
    await cruxes.update(crux.id, {
      meta: { ...crux.meta, messages, summary, gateCount },
    });
  },

  updateCrux: async (dto: UpdateCruxDto) => {
    const { crux } = get();
    if (!crux) return;
    const updated = await cruxes.update(crux.id, dto);
    const isPublished = crux.meta?.publishedAt != null;
    set({
      crux: { ...crux, ...updated },
      ...(isPublished ? { hasUnpublishedChanges: true } : {}),
    });
  },

  reset: () => {
    resetPalette();
    set({
      crux: null,
      messages: [],
      artifacts: [],
      summary: null,
      isStreaming: false,
      streamingContent: '',
      gates: [],
      gateCount: 0,
      hasUnpublishedChanges: false,
      isCreatingGate: false,
      pendingGateCreation: false,
    });
  },

  // Publish actions
  publishCrux: async () => {
    const { crux, saveMeta } = get();
    if (!crux) return;
    await saveMeta();
    const updated = await cruxes.publish(crux.id);
    set({ crux: { ...crux, ...updated }, hasUnpublishedChanges: false });
  },

  unpublishCrux: async () => {
    const { crux } = get();
    if (!crux) return;
    const updated = await cruxes.unpublish(crux.id);
    set({ crux: { ...crux, ...updated } });
  },

  // File CRUD actions
  createFile: async (path: string, content?: string) => {
    const { crux } = get();
    if (!crux) throw new Error('No active crux');
    const text = content ?? '';
    const ext = path.split('.').pop()?.toLowerCase() || 'txt';
    const mimeMap: Record<string, string> = {
      html: 'text/html', htm: 'text/html', css: 'text/css',
      js: 'application/javascript', ts: 'application/javascript',
      jsx: 'application/javascript', tsx: 'application/javascript',
      json: 'application/json', md: 'text/markdown', txt: 'text/plain',
      py: 'text/x-python', svg: 'image/svg+xml', xml: 'application/xml',
    };
    const mime = mimeMap[ext] || 'text/plain';
    const filename = path.split('/').pop() || 'file';
    const blob = new Blob([text], { type: mime });
    const file = new File([blob], filename, { type: mime });
    const attachment = await cruxes.uploadAttachment(crux.id, file, { path, type: 'file', kind: 'artifact' });
    set((state) => ({ artifacts: [...state.artifacts, attachment], hasUnpublishedChanges: true }));
    return attachment;
  },

  uploadFile: async (file: File, parentPath?: string) => {
    const { crux } = get();
    if (!crux) throw new Error('No active crux');
    const path = parentPath ? `${parentPath}/${file.name}` : file.name;
    const attachment = await cruxes.uploadAttachment(crux.id, file, { path, type: 'file', kind: 'artifact' });
    set((state) => ({ artifacts: [...state.artifacts, attachment], hasUnpublishedChanges: true }));
    return attachment;
  },

  moveArtifact: async (id: string, newParentPath: string | null) => {
    const { artifacts } = get();
    const artifact = artifacts.find((a) => a.id === id);
    if (!artifact) return;
    const oldPath = artifact.meta?.path || artifact.filename || '';
    const filename = oldPath.split('/').pop() || artifact.filename;
    const newPath = newParentPath ? `${newParentPath}/${filename}` : filename;
    await cruxes.updateAttachment(id, undefined, { path: newPath });
    set((state) => ({
      artifacts: state.artifacts.map((a) =>
        a.id === id
          ? { ...a, meta: { ...a.meta, path: newPath }, filename: newPath.split('/').pop() || a.filename }
          : a,
      ),
      hasUnpublishedChanges: true,
    }));
  },

  renameArtifact: async (id: string, newPath: string) => {
    await cruxes.updateAttachment(id, undefined, { path: newPath });
    set((state) => ({
      artifacts: state.artifacts.map((a) =>
        a.id === id
          ? { ...a, meta: { ...a.meta, path: newPath }, filename: newPath.split('/').pop() || a.filename }
          : a,
      ),
      hasUnpublishedChanges: true,
    }));
  },

  deleteArtifact: async (id: string) => {
    await cruxes.deleteAttachment(id);
    set((state) => ({
      artifacts: state.artifacts.filter((a) => a.id !== id),
      hasUnpublishedChanges: true,
    }));
    // Also close any editor tab for this file
    const { useUIStore } = await import('@/stores/uiStore');
    useUIStore.getState().closeTab(id);
  },

  saveArtifactContent: async (id: string, content: string) => {
    const { artifacts } = get();
    const artifact = artifacts.find((a) => a.id === id);
    if (!artifact) return;
    const mime = artifact.mimeType || 'text/plain';
    const blob = new Blob([content], { type: mime });
    const file = new File([blob], artifact.filename || 'file', { type: mime });
    await cruxes.updateAttachment(id, file);
    set({ hasUnpublishedChanges: true });
  },

  // Gate actions
  loadGates: async () => {
    const { crux } = get();
    if (!crux) return;
    const dimensions = await cruxes.getDimensions(crux.id, 'gate', 'target');
    const sorted = dimensions.sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0));
    set({ gates: sorted });
  },

  addGate: (gate: Dimension) => {
    set((state) => ({
      gates: [...state.gates, gate].sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0)),
      gateCount: state.gateCount + 1,
    }));
  },

  setSummary: (summary: CruxSummary) => {
    set({ summary });
  },

  setGateCreating: (creating: boolean) => {
    set({ isCreatingGate: creating });
  },

  setPendingGateCreation: (pending: boolean) => {
    set({ pendingGateCreation: pending });
  },
}));
