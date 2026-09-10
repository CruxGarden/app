import { validateDocument } from '../../cardinal-crux/model.js';

/** Built-in apps with editable data owned by the Crux. */
export function isCardinal(crux: { meta?: Record<string, unknown> } | null | undefined) {
  return crux?.meta?.template === 'cardinal-drone';
}
export function embeddedContentRoot(
  crux: { kind?: string; meta?: Record<string, unknown> } | null | undefined,
) {
  return isCardinal(crux) ? 'music/' : isMoqira(crux) ? 'mockups/' : 'notebook/';
}
export function cardinalPath(value: unknown): string {
  if (value !== 'instrument.json')
    throw new Error('This instrument can access only its saved instrument document.');
  return 'music/instrument.json';
}
export function validateCardinalFile(content: string) {
  if (content.length > 2_000_000) throw new Error('The instrument document is too large.');
  validateDocument(JSON.parse(content));
}
export function isMoqira(crux: { meta?: Record<string, unknown> } | null | undefined) {
  return crux?.meta?.template === 'moqira';
}
export function isEmbeddedApp(
  crux: { kind?: string; meta?: Record<string, unknown> } | null | undefined,
) {
  return crux?.kind === 'notes' || isMoqira(crux) || isCardinal(crux);
}
export function moqiraPath(value: unknown): string {
  if (value !== 'project.json' && value !== 'publish.json')
    throw new Error('Moqira can access only its project and publication settings.');
  return 'mockups/' + value;
}
export function validateMoqiraFile(path: string, content: string) {
  const data = JSON.parse(content);
  if (path === 'mockups/publish.json') {
    if (
      !data ||
      typeof data.title !== 'string' ||
      !Array.isArray(data.wireframes) ||
      data.wireframes.some((id: unknown) => typeof id !== 'string')
    )
      throw new Error('Choose a title and wireframes to publish.');
  } else if (
    !data ||
    data.schemaVersion !== 1 ||
    typeof data.name !== 'string' ||
    !data.appearance ||
    !Array.isArray(data.wireframes) ||
    !data.wireframes.length ||
    data.wireframes.some(
      (frame: { id?: unknown; name?: unknown; nodes?: unknown }) =>
        !frame ||
        typeof frame.id !== 'string' ||
        typeof frame.name !== 'string' ||
        !Array.isArray(frame.nodes),
    )
  ) {
    throw new Error('Choose a valid Moqira project (schema version 1).');
  }
}
