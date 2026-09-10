import { readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
/** Selected project data only; app source and other Artifacts are never copied to dist. */
export function readEdition(root) {
  const base = realpathSync(root);
  const read = (path) => {
    const full = realpathSync(resolve(base, path));
    if (!full.startsWith(base + sep))
      throw new Error('Publication files must be inside the Project Folder.');
    return JSON.parse(readFileSync(full, 'utf8'));
  };
  const selection = read('mockups/publish.json');
  const project = read('mockups/project.json');
  if (!Array.isArray(selection.wireframes)) throw new Error('Choose wireframes to publish.');
  const ids = new Set(selection.wireframes);
  if (selection.wireframes.some((id) => !project.wireframes.some((frame) => frame.id === id)))
    throw new Error('A selected wireframe no longer exists.');
  const wireframes = project.wireframes
    .filter((frame) => ids.has(frame.id))
    .map((frame) => ({
      id: frame.id,
      name: frame.name,
      background: frame.background,
      showGrid: frame.showGrid,
      nodes: frame.nodes.map((node) => ({
        ...node,
        links: Object.fromEntries(
          Object.entries(node.links ?? {}).filter(
            ([, link]) =>
              link.kind === 'back' ||
              (link.kind === 'wireframe' && ids.has(link.wireframeId)) ||
              (link.kind === 'url' && /^https?:\/\//i.test(link.url)),
          ),
        ),
      })),
    }));
  return {
    schemaVersion: 1,
    name: selection.title || 'Wireframes',
    appearance: Object.fromEntries(
      ['colorScheme', 'accentColor', 'appFontFamily', 'appFontSize', 'accentTitlebar'].map(
        (key) => [key, project.appearance[key]],
      ),
    ),
    activeWireframeId: wireframes[0]?.id ?? '',
    wireframes,
  };
}
