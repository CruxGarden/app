/** A notebook editor participates in the same save-before-leaving boundary as file tabs. */
type NotebookEditor = { dirty(): boolean; flush(): Promise<void> };
const editors = new Map<string, NotebookEditor>();
const resuming = new Set<string>();
export const notebookIsOpen = (id: string | null | undefined) => !!id && editors.has(id);
export function registerNotebookEditor(id: string, editor: NotebookEditor) {
  editors.set(id, editor);
  return () => {
    if (editors.get(id) === editor) editors.delete(id);
  };
}
export const notebookIsDirty = (id: string | null | undefined) =>
  !!id && !!editors.get(id)?.dirty();
export async function flushNotebook(id: string | null | undefined) {
  if (id) await editors.get(id)?.flush();
}
/** Ask the editor even before its asynchronous dirty message has reached the host. */
export function deferNotebookAction(id: string | null, action: () => void): boolean {
  if (!id || !editors.has(id) || resuming.has(id)) return false;
  void flushNotebook(id)
    .then(() => {
      resuming.add(id);
      try {
        action();
      } finally {
        resuming.delete(id);
      }
    })
    .catch(() => {
      /* the notebook displays the save failure and retains its draft */
    });
  return true;
}
