/**
 * The Crux Tool manifest — `crux-tool.json` at the root of a tool's Project
 * Folder (ADR 0050). It declares what the app used to hold in seven separate
 * registries; the app derives its picker, app-type map, provenance, drop
 * routes and share behaviour from the set of manifests it can see.
 *
 * Hand-validated rather than schema-driven: the shape is small, the failure
 * messages need to name the tool, and the app has no JSON-schema library.
 */
import type { CruxKind } from '@/api/types';

export type ToolIcon = 'layout' | 'pencil' | 'home';
export type ToolLayout = 'workshop' | 'chat' | 'writing' | 'visual';

export interface CruxToolManifest {
  version: 1;
  /** The template id: `meta.template` on every Crux made from this tool. */
  id: string;
  /** The tool's name as the picker and provenance show it. */
  name: string;
  description: string;
  kind: CruxKind;
  defaultTitle: string;
  icon: ToolIcon;
  /** Needs a real toolchain: hidden on the web. */
  desktopOnly: boolean;
  /** Position in the creation menu; lower first. */
  order: number;
  /** In the app's starter set, compiled into the build. Otherwise installed. */
  bundled: boolean;
  /** The native app type the bridge, tools and validators are keyed by. */
  app: string;
  /** Where the Workshop opens the tool. */
  entryFile: string;
  /** The folder the tool's own records live under; Garden treats it as the tool's. */
  contentRoot: string;
  /** Workspace layout at creation. */
  layout: ToolLayout;
  /** The seeded document, when the tool keeps one. */
  document?: { path: string; seed: unknown };
  /** Whether a Crux made here has a public edition to Share. */
  share: boolean;
  /** Provenance for "About this tool". */
  toolInfo: { name: string; upstream: string; relationship: string; detailsPath: string };
  /** Dropped files this tool takes: extensions (with the dot) and the folder they land in. */
  routes: { extensions: string[]; folder: string }[];
  /** The collaborator's first message in a new Crux. */
  greeting: string;
  /** Workspace context appended to the system prompt. */
  context: string;
  /** Path under the tool folder of its host-side tool module, when it has one (ADR 0050 §2). */
  host?: string;
}

const ICONS: ToolIcon[] = ['layout', 'pencil', 'home'];
const LAYOUTS: ToolLayout[] = ['workshop', 'chat', 'writing', 'visual'];
const KINDS = ['webapp', 'page', 'document', 'image', 'notes'];

function fail(id: string, what: string): never {
  throw new Error(`crux-tool.json${id ? ` (${id})` : ''}: ${what}`);
}
const req = (id: string, o: Record<string, unknown>, key: string): string => {
  const v = o[key];
  if (typeof v !== 'string' || !v) fail(id, `${key} must be a non-empty string`);
  return v;
};
const opt = (id: string, o: Record<string, unknown>, key: string): string | undefined => {
  const v = o[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'string') fail(id, `${key} must be a string`);
  return v;
};
const bool = (id: string, o: Record<string, unknown>, key: string, fallback: boolean) => {
  const v = o[key];
  if (v === undefined) return fallback;
  if (typeof v !== 'boolean') fail(id, `${key} must be true or false`);
  return v;
};

/** Parse and validate a manifest; throws a message naming the tool and the field. */
export function parseManifest(raw: unknown): CruxToolManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('', 'must be an object');
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id : '';
  if (o.version !== 1) fail(id, 'version must be 1');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) fail(id, 'id must be lowercase letters, digits and dashes');
  const kind = req(id, o, 'kind');
  if (!KINDS.includes(kind)) fail(id, `kind must be one of ${KINDS.join(', ')}`);
  const icon = (o.icon ?? 'layout') as ToolIcon;
  if (!ICONS.includes(icon)) fail(id, `icon must be one of ${ICONS.join(', ')}`);
  const layout = (o.layout ?? 'workshop') as ToolLayout;
  if (!LAYOUTS.includes(layout)) fail(id, `layout must be one of ${LAYOUTS.join(', ')}`);
  const order = typeof o.order === 'number' && Number.isFinite(o.order) ? o.order : 1000;
  const entryFile = req(id, o, 'entryFile');
  if (entryFile.startsWith('/') || entryFile.includes('..')) fail(id, 'entryFile must be relative');

  const info = o.toolInfo;
  if (!info || typeof info !== 'object') fail(id, 'toolInfo is required');
  const ti = info as Record<string, unknown>;
  const upstream = req(id, ti, 'upstream');
  if (!/^https:\/\/\S+$/.test(upstream)) fail(id, 'toolInfo.upstream must be an https URL');
  const detailsPath = req(id, ti, 'detailsPath');
  if (
    detailsPath.startsWith('/') ||
    detailsPath.includes('\\') ||
    /(^|\/)\.\.(\/|$)/.test(detailsPath)
  )
    fail(id, 'toolInfo.detailsPath must stay inside the Crux');

  let document: CruxToolManifest['document'];
  if (o.document !== undefined) {
    if (!o.document || typeof o.document !== 'object') fail(id, 'document must be an object');
    const d = o.document as Record<string, unknown>;
    const path = req(id, d, 'path');
    if (!Object.hasOwn(d, 'seed')) fail(id, 'document.seed is required');
    document = { path, seed: d.seed };
  }

  const routes: CruxToolManifest['routes'] = [];
  if (o.routes !== undefined) {
    if (!Array.isArray(o.routes)) fail(id, 'routes must be an array');
    for (const r of o.routes as unknown[]) {
      if (!r || typeof r !== 'object') fail(id, 'each route must be an object');
      const rr = r as Record<string, unknown>;
      if (!Array.isArray(rr.extensions) || !rr.extensions.length)
        fail(id, 'route.extensions must list at least one extension');
      for (const e of rr.extensions as unknown[])
        if (typeof e !== 'string' || !/^\.[a-z0-9]+$/i.test(e))
          fail(id, `route extension ${String(e)} must look like ".ext"`);
      routes.push({
        extensions: rr.extensions as string[],
        folder: opt(id, rr, 'folder') ?? '',
      });
    }
  }

  return {
    version: 1,
    id,
    name: req(id, o, 'name'),
    description: req(id, o, 'description'),
    kind: kind as CruxKind,
    defaultTitle: req(id, o, 'defaultTitle'),
    icon,
    desktopOnly: bool(id, o, 'desktopOnly', true),
    order,
    bundled: bool(id, o, 'bundled', false),
    app: req(id, o, 'app'),
    entryFile,
    contentRoot: opt(id, o, 'contentRoot') ?? 'data/',
    layout,
    document,
    share: bool(id, o, 'share', false),
    toolInfo: {
      name: req(id, ti, 'name'),
      upstream,
      relationship: req(id, ti, 'relationship'),
      detailsPath,
    },
    routes,
    greeting: req(id, o, 'greeting'),
    context: opt(id, o, 'context') ?? '',
    host: opt(id, o, 'host'),
  };
}
