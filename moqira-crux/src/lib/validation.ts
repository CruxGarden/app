import type { MockupProject } from '../types';
export function validateProject(value: unknown): MockupProject {
  const p = value as MockupProject;
  if (
    !p ||
    p.schemaVersion !== 1 ||
    typeof p.name !== 'string' ||
    !p.appearance ||
    !Array.isArray(p.wireframes) ||
    !p.wireframes.length ||
    p.wireframes.some(
      (f) =>
        !f ||
        typeof f.id !== 'string' ||
        typeof f.name !== 'string' ||
        !Array.isArray(f.nodes) ||
        f.nodes.some((n) => !n || typeof n.id !== 'string' || typeof n.kind !== 'string'),
    )
  )
    throw new Error('Choose a Moqira project (schema version 1).');
  if (new Set(p.wireframes.map((f) => f.id)).size !== p.wireframes.length)
    throw new Error('Wireframe IDs must be unique.');
  return p;
}
