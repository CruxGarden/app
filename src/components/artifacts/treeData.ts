import type { Artifact } from '@/api/types';

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
 * - Folder nodes have `children: [...]` (even if empty)
 * - File nodes have `children: undefined`
 * - Folders sort first (alphabetically), then files (alphabetically)
 */
export function artifactsToTreeData(artifacts: Artifact[]): TreeNodeData[] {
  interface BuildNode {
    name: string;
    path: string;
    children: Map<string, BuildNode>;
    artifact?: Artifact;
  }

  const root: BuildNode = { name: '', path: '', children: new Map() };

  for (const a of artifacts) {
    const filePath = a.meta?.path || a.filename || a.id;
    const parts = filePath.split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isFile = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join('/');

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          path: fullPath,
          children: new Map(),
          artifact: isFile ? a : undefined,
        });
      } else if (isFile) {
        current.children.get(part)!.artifact = a;
      }

      current = current.children.get(part)!;
    }
  }

  function toTreeNodes(node: BuildNode): TreeNodeData[] {
    const entries = Array.from(node.children.values());
    const dirs = entries.filter((c) => c.children.size > 0 && !c.artifact);
    const files = entries.filter((c) => c.artifact || c.children.size === 0);
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));

    return [...dirs, ...files].map((child) => {
      const isFolder = child.children.size > 0 && !child.artifact;
      return {
        id: child.artifact?.id || `folder:${child.path}`,
        name: child.name,
        path: child.path,
        children: isFolder ? toTreeNodes(child) : undefined,
        artifact: child.artifact,
      };
    });
  }

  return toTreeNodes(root);
}
