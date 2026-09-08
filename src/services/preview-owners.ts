import { folderForCrux } from './project-folder';
import { setActivePreview } from '@/lib/preview-registry';
/** Runtime owners retain servers across pane unmounts and drain starts on close. */
interface Owner {
  leases: Map<string, () => void | Promise<void>>;
  pending: Set<Promise<unknown>>;
}
const owners = new Map<string, Owner>();
export function registerPreviewOwner(id: string): () => Promise<void> {
  const owner: Owner = { leases: new Map(), pending: new Set() };
  owners.set(id, owner);
  let folder: string | null = null;
  const folderLoad = folderForCrux(id).then((value) => {
    folder = value;
  });
  trackPreviewStart(id, folderLoad);
  const offStatus =
    typeof window !== 'undefined'
      ? window.electronAPI?.devserver?.onStatus((event) => {
          if (event.folder === folder)
            setActivePreview(id, event.status === 'ready' && event.url ? `${event.url}/` : null);
        })
      : undefined;
  return async () => {
    while (owner.pending.size) await Promise.allSettled([...owner.pending]);
    for (const release of owner.leases.values()) await release();
    owner.leases.clear();
    offStatus?.();
    if (owners.get(id) === owner) owners.delete(id);
  };
}
export function trackPreviewStart<T>(id: string, operation: Promise<T>): Promise<T> {
  const owner = owners.get(id);
  if (owner) {
    owner.pending.add(operation);
    void operation.finally(() => owner.pending.delete(operation)).catch(() => {});
  }
  return operation;
}
export function retainPreview(
  id: string,
  kind: string,
  acquire: () => void,
  release: () => void | Promise<void>,
) {
  const owner = owners.get(id);
  if (!owner || owner.leases.has(kind)) return;
  acquire();
  owner.leases.set(kind, release);
}
