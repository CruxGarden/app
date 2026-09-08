import { createStore, type StoreApi } from 'zustand/vanilla';
import type { editor } from 'monaco-editor';
import type { CruxState } from '@/stores/cruxStore';
import type { UIState } from '@/stores/uiStore';
import type { Artifact } from '@/api/types';

export interface DocumentState {
  content: string | null;
  revision: number;
  savedRevision: number;
  fingerprint: string | null;
  conflict: boolean;
  error: string | null;
  view: editor.ICodeEditorViewState | null;
  model: editor.ITextModel | null;
  focus: (() => void) | null;
}
export function createDocuments(data: StoreApi<CruxState>, ui: StoreApi<UIState>) {
  const entries = new Map<string, StoreApi<DocumentState>>();
  const saves = new Map<string, Promise<void>>();
  const get = (id: string) => {
    let doc = entries.get(id);
    if (!doc) {
      doc = createStore<DocumentState>(() => ({
        content: null,
        revision: 0,
        savedRevision: 0,
        fingerprint: null,
        conflict: false,
        error: null,
        view: null,
        model: null,
        focus: null,
      }));
      entries.set(id, doc);
    }
    return doc;
  };
  const dirty = (id: string) => {
    const s = get(id).getState();
    return s.revision !== s.savedRevision;
  };
  return {
    get,
    dirty,
    edit(id: string, content: string) {
      const doc = get(id);
      if (doc.getState().content === content) return;
      doc.setState((s) => ({ content, revision: s.revision + 1 }));
      ui.getState().setTabDirty(id, true);
    },
    hydrate(artifact: Artifact, content: string) {
      const doc = get(artifact.id);
      const s = doc.getState();
      const fingerprint = artifact.fingerprint ?? null;
      if (dirty(artifact.id)) {
        if (s.fingerprint !== fingerprint) doc.setState({ conflict: true });
        return;
      }
      doc.setState({ content, fingerprint, conflict: false });
    },
    save(id: string, overwrite = false): Promise<void> {
      const pending = (saves.get(id) ?? Promise.resolve())
        .catch(() => {})
        .then(async () => {
          const doc = get(id);
          const before = doc.getState();
          if (!dirty(id) || before.content === null) return;
          if (before.conflict && !overwrite)
            throw new Error(
              'This Artifact changed outside the editor. Review the conflict before saving.',
            );
          const current = data.getState();
          const artifact = (current.workspaceArtifacts ?? current.artifacts).find(
            (a) => a.id === id,
          );
          if (!artifact || artifact.resourceId !== current.crux?.id)
            throw new Error(
              'This Artifact is no longer in this workspace. Your edits are retained.',
            );
          if (!overwrite && before.fingerprint !== (artifact.fingerprint ?? null)) {
            doc.setState({ conflict: true });
            throw new Error(
              'This Artifact changed outside the editor. Review the conflict before saving.',
            );
          }
          const saved = await current.saveArtifactContent(id, before.content);
          if (!saved) throw new Error('The Artifact could not be saved. Your edits are retained.');
          doc.setState({
            savedRevision: before.revision,
            fingerprint: saved.fingerprint ?? null,
            conflict: false,
            error: null,
          });
          ui.getState().setTabDirty(id, dirty(id));
        })
        .catch((error: unknown) => {
          get(id).setState({ error: (error as Error).message });
          throw error;
        });
      saves.set(id, pending);
      void pending
        .finally(() => {
          if (saves.get(id) === pending) saves.delete(id);
        })
        .catch(() => {});
      return pending;
    },
    async saveAll() {
      for (const id of entries.keys()) await this.save(id);
    },
    async drain() {
      await Promise.all([...saves.values()]);
    },
    hasDirty: () => [...entries.keys()].some(dirty),
    dispose() {
      for (const doc of entries.values()) doc.getState().model?.dispose();
      entries.clear();
    },
  };
}
const registries = new WeakMap<StoreApi<CruxState>, ReturnType<typeof createDocuments>>();
export function documentsFor(data: StoreApi<CruxState>, ui: StoreApi<UIState>) {
  let docs = registries.get(data);
  if (!docs) {
    docs = createDocuments(data, ui);
    registries.set(data, docs);
  }
  return docs;
}
