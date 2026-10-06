import { TYPES, validateProject } from '../../tool-cruxes/shared/model.js';
import { validateDocument } from '../../cardinal-crux/model.js';
import { manifestFor } from '@/services/crux-tools/registry';

/** Use the project's own manifest snapshot, even after its installation is removed. */
export function nativeAppType(crux: { meta?: Record<string, unknown> } | null | undefined) {
  return manifestFor(crux)?.app ?? null;
}

export function isOpenMosh(crux: { meta?: Record<string, unknown> } | null | undefined) {
  return nativeAppType(crux) === 'openmosh';
}

export function isWickEditor(crux: { meta?: Record<string, unknown> } | null | undefined) {
  return nativeAppType(crux) === 'wick-editor';
}

export function isBentoPDF(crux: { meta?: Record<string, unknown> } | null | undefined) {
  return nativeAppType(crux) === 'bentopdf';
}

export function isAM1(crux: { meta?: Record<string, unknown> } | null | undefined) {
  return nativeAppType(crux) === 'am-1';
}

export function isEventCalendar(crux: { meta?: Record<string, unknown> } | null | undefined) {
  return nativeAppType(crux) === 'eventcalendar';
}

export function isPPTist(crux: { meta?: Record<string, unknown> } | null | undefined) {
  return nativeAppType(crux) === 'pptist';
}

export function isHextris(crux: { meta?: Record<string, unknown> } | null | undefined) {
  return nativeAppType(crux) === 'hextris';
}

export function isBeepBox(crux: { meta?: Record<string, unknown> } | null | undefined) {
  return nativeAppType(crux) === 'beepbox';
}

export function isWebSynth(crux: { meta?: Record<string, unknown> } | null | undefined) {
  return nativeAppType(crux) === 'web-synth';
}

export function isAudioMass(crux: { meta?: Record<string, unknown> } | null | undefined) {
  return nativeAppType(crux) === 'audiomass';
}

export function isMiniPaint(crux: { meta?: Record<string, unknown> } | null | undefined) {
  return nativeAppType(crux) === 'minipaint';
}

/** Built-in apps with editable data owned by the Crux. */
export function isCardinal(crux: { meta?: Record<string, unknown> } | null | undefined) {
  return crux?.meta?.template === 'cardinal-drone';
}
export function embeddedContentRoot(
  crux: { kind?: string; meta?: Record<string, unknown> } | null | undefined,
) {
  return samplerType(crux) || nativeAppType(crux)
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
  // A Crux Tool's Template Crux (ADR 0050) is a package, not a project: it
  // publishes whole — runtime and all — for other gardens to install from.
  if (crux?.kind === 'tool') return false;
  return (
    !!nativeAppType(crux) ||
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
/** Apps whose Crux stays on this machine: no public edition, so no Share. A form publishes its viewer edition. */
export function isLocalCreationTool(
  crux: { kind?: string; meta?: Record<string, unknown> } | null | undefined,
) {
  // A Tool template publishes whatever its tool's share rule says: the
  // package is the thing being shared, not a creation made with it.
  if (crux?.kind === 'tool') return false;
  const manifest = manifestFor(crux);
  if (manifest) return !manifest.share;
  return (
    isCardinal(crux) ||
    ['figma', 'blender'].includes(String(crux?.meta?.template)) ||
    // the Whiteboard sampler shares its drawing as a view-mode page; the other samplers stay local
    (samplerType(crux) !== null && samplerType(crux) !== 'excalidraw')
  );
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
