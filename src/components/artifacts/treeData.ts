import type { Artifact } from '@/api/types';
import { pathOf, isUnder } from '@/lib/artifact-path';

export interface TreeNodeData {
  id: string;
  name: string;
  path: string;
  children?: TreeNodeData[];
  artifact?: Artifact;
}

/**
 * Converts a flat array of artifacts into a nested tree structure
 * compatible with react-arborist.
 *
 * - Folder nodes have `children: [...]` (even if empty — a `.keep` marker
 *   materializes an empty folder and is never shown as a file)
 * - File nodes have `children: undefined`
 * - Folders sort first (alphabetically), then files (alphabetically)
 */
export function artifactsToTreeData(artifacts: Artifact[]): TreeNodeData[] {
  interface BuildNode {
    name: string;
    path: string;
    children: Map<string, BuildNode>;
    artifact?: Artifact;
    /** Known to be a directory even when empty (e.g. only a .keep marker). */
    isDir?: boolean;
  }

  const root: BuildNode = { name: '', path: '', children: new Map() };

  for (const a of artifacts) {
    const filePath = pathOf(a) || a.id;
    const parts = filePath.split('/').filter(Boolean);
    // `.keep` is the app's empty-folder marker, not a file the user made:
    // it materializes the folder node and is otherwise invisible.
    const isKeepMarker = parts[parts.length - 1] === '.keep';
    const visibleParts = isKeepMarker ? parts.slice(0, -1) : parts;
    let current = root;

    for (let i = 0; i < visibleParts.length; i++) {
      const part = visibleParts[i]!;
      const isFile = !isKeepMarker && i === visibleParts.length - 1;
      const fullPath = parts.slice(0, i + 1).join('/');

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          path: fullPath,
          children: new Map(),
          artifact: isFile ? a : undefined,
          isDir: !isFile,
        });
      } else if (isFile) {
        current.children.get(part)!.artifact = a;
      } else {
        current.children.get(part)!.isDir = true;
      }

      current = current.children.get(part)!;
    }
  }

  function toTreeNodes(node: BuildNode): TreeNodeData[] {
    const entries = Array.from(node.children.values());
    const dirs = entries.filter((c) => c.isDir && !c.artifact);
    const files = entries.filter((c) => !c.isDir || c.artifact);
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));

    return [...dirs, ...files].map((child) => {
      const isFolder = !!child.isDir && !child.artifact;
      return {
        id: child.artifact?.id || `${FOLDER_ID_PREFIX}${child.path}`,
        name: child.name,
        path: child.path,
        children: isFolder ? toTreeNodes(child) : undefined,
        artifact: child.artifact,
      };
    });
  }

  return toTreeNodes(root);
}

/** Virtual id the tree gives a folder node (folders aren't artifacts). */
export const FOLDER_ID_PREFIX = 'folder:';

/**
 * Turn a tree selection — artifact ids mixed with folder virtual ids — into
 * the artifact ids it denotes (folders expand to every artifact under them).
 * The one place this rule lives; both delete paths use it.
 */
export function expandTreeSelection(ids: readonly string[], artifacts: readonly Artifact[]): string[] {
  const out = new Set<string>();
  for (const id of ids) {
    if (id.startsWith(FOLDER_ID_PREFIX)) {
      const folderPath = id.slice(FOLDER_ID_PREFIX.length);
      for (const a of artifacts) if (isUnder(folderPath, pathOf(a))) out.add(a.id);
    } else {
      out.add(id);
    }
  }
  return [...out];
}
