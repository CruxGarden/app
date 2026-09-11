import { TYPES, validateProject } from '../../tool-cruxes/shared/model.js';
import { validateDocument } from '../../cardinal-crux/model.js';

export function isOpenMosh(crux: { meta?: Record<string, unknown> } | null | undefined) {
  return crux?.meta?.template === 'openmosh-app';
}

export function isMiniPaint(crux: { meta?: Record<string, unknown> } | null | undefined) {
  return crux?.meta?.template === 'minipaint-app';
}

/** Built-in apps with editable data owned by the Crux. */
export function isCardinal(crux: { meta?: Record<string, unknown> } | null | undefined) {
  return crux?.meta?.template === 'cardinal-drone';
}
export function embeddedContentRoot(
  crux: { kind?: string; meta?: Record<string, unknown> } | null | undefined,
) {
  return samplerType(crux) || isOpenMosh(crux) || isMiniPaint(crux)
    ? 'data/'
    : isCardinal(crux)
      ? 'music/'
      : isMoqira(crux)
        ? 'mockups/'
        : 'notebook/';
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
  return (
    isOpenMosh(crux) ||
    isMiniPaint(crux) ||
    crux?.kind === 'notes' ||
    isMoqira(crux) ||
    isCardinal(crux) ||
    !!samplerType(crux)
  );
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

/** Trusted local sampler apps use a small JSON document and immutable raster assets. */
export function samplerType(
  crux: { meta?: Record<string, unknown> } | null | undefined,
): string | null {
  const template = crux?.meta?.template;
  if (typeof template !== 'string' || !template.startsWith('tool-')) return null;
  const type = template.slice(5);
  return TYPES.includes(type) ? type : null;
}
export function isLocalCreationTool(crux: { meta?: Record<string, unknown> } | null | undefined) {
  return isMiniPaint(crux) || isOpenMosh(crux) || isCardinal(crux) || !!samplerType(crux);
}
export function samplerPath(type: string, value: unknown): string {
  if (value === 'project.json') return 'data/project.json';
  if (
    ['openmosh', 'excalidraw'].includes(type) &&
    typeof value === 'string' &&
    /^assets\/[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(value)
  )
    return 'data/' + value;
  throw new Error('This app can access only its project document and imported images.');
}
export function validateSamplerFile(type: string, content: string) {
  if (content.length > 2_000_000) throw new Error('The project is too large.');
  validateProject(JSON.parse(content), type);
}
