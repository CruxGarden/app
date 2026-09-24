import { notebookIsDirty, flushNotebook } from './notebook-lifecycle';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { editor } from 'monaco-editor';
import type { CruxState } from '@/stores/cruxStore';
import type { UIState } from '@/stores/uiStore';
import type { Artifact } from '@/api/types';

export type DocumentReference = Pick<Artifact, 'id' | 'resourceId'>;
/** Current owners and snapshot owners can contain the same logical file ID.
 * Content revisions and paths are deliberately absent: saving/renaming a live
 * file must keep its draft, undo stack and cursor in the same editor model. */
export const documentIdentity = (file: DocumentReference) =>
  JSON.stringify([file.resourceId, file.id]);

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
  const references = new Map<string, DocumentReference>();
  const reference = (file: string | DocumentReference): DocumentReference => {
    if (typeof file !== 'string') return { id: file.id, resourceId: file.resourceId };
    const current = data.getState();
    const artifact =
      current.artifacts.find((a) => a.id === file) ??
      current.workspaceArtifacts?.find((a) => a.id === file);
    return { id: file, resourceId: artifact?.resourceId ?? current.crux?.id ?? '' };
  };
  const get = (file: string | DocumentReference) => {
    const ref = reference(file);
    const key = documentIdentity(ref);
    let doc = entries.get(key);
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
      entries.set(key, doc);
      references.set(key, ref);
    }
    return doc;
  };
  const dirty = (file: string | DocumentReference) => {
    const s = get(file).getState();
    return s.revision !== s.savedRevision;
  };
  return {
    get,
    dirty,
    edit(file: string | DocumentReference, content: string) {
      const ref = reference(file);
      if (ref.resourceId !== data.getState().crux?.id)
        throw new Error('Historical files are read-only.');
      const doc = get(ref);
      if (doc.getState().content === content) return;
      doc.setState((s) => ({ content, revision: s.revision + 1 }));
      ui.getState().setTabDirty(ref.id, true);
    },
    hydrate(artifact: Artifact, content: string) {
      const doc = get(artifact);
      const s = doc.getState();
      const fingerprint = artifact.fingerprint ?? null;
      if (dirty(artifact)) {
        if (s.fingerprint !== fingerprint) doc.setState({ conflict: true });
        return;
      }
      doc.setState({ content, fingerprint, conflict: false, error: null });
    },
    save(file: string | DocumentReference, overwrite = false): Promise<void> {
      // Capture before queueing. A later history selection cannot redirect it.
      const ref = reference(file);
      const key = documentIdentity(ref);
      if (ref.resourceId !== data.getState().crux?.id)
        return Promise.reject(new Error('Historical files are read-only.'));
      const pending = (saves.get(key) ?? Promise.resolve())
        .catch(() => {})
        .then(async () => {
          const doc = get(ref);
          const before = doc.getState();
          if (!dirty(ref) || before.content === null) return;
          if (before.conflict && !overwrite)
            throw new Error(
              'This Artifact changed outside the editor. Review the conflict before saving.',
            );
          const current = data.getState();
          const artifact = (current.workspaceArtifacts ?? current.artifacts).find(
            (a) => a.id === ref.id && a.resourceId === ref.resourceId,
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
          const saved = await current.saveArtifactContent(ref.id, before.content);
          if (!saved) throw new Error('The Artifact could not be saved. Your edits are retained.');
          doc.setState({
            savedRevision: before.revision,
            fingerprint: saved.fingerprint ?? null,
            conflict: false,
            error: null,
          });
          // History can be showing the same tab ID; its tab remains read-only.
          if (!data.getState().viewingSnapshotId) ui.getState().setTabDirty(ref.id, dirty(ref));
        })
        .catch((error: unknown) => {
          get(ref).setState({ error: (error as Error).message });
          throw error;
        });
      saves.set(key, pending);
      void pending
        .finally(() => {
          if (saves.get(key) === pending) saves.delete(key);
        })
        .catch(() => {});
      return pending;
    },
    async saveAll() {
      await flushNotebook(data.getState().crux?.id);
      for (const ref of references.values()) {
        if (ref.resourceId === data.getState().crux?.id) await this.save(ref);
      }
    },
    async drain() {
      await Promise.all([...saves.values()]);
    },
    hasDirty: () =>
      notebookIsDirty(data.getState().crux?.id) || [...references.values()].some(dirty),
    dispose() {
      for (const doc of entries.values()) doc.getState().model?.dispose();
      entries.clear();
      references.clear();
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
