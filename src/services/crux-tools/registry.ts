/**
 * Every Crux Tool the app can see, read from the tools' own manifests
 * (ADR 0050). Today that is the `*-crux/crux-tool.json` files compiled into
 * the build; installed tools join the same map when their Template Crux's
 * manifest Artifact is read (CRUX-TOOLS-DISTRIBUTION-PLAN §3).
 *
 * Nothing here knows a tool by name. The picker, the app-type map, the
 * provenance record, the drop routes and the share rule are all views over
 * this one list.
 */
import { parseManifest, type CruxToolManifest } from './manifest';
import type { ToolInfo } from '@/lib/tool-info';
import { bundled } from 'virtual:crux-tools';
import { SettingsKey } from '@/lib/constants';
import { getSetting } from '@/services/settings';

const raw = import.meta.glob('../../../*-crux/crux-tool.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

const available = new Set(bundled);
const manifests = new Map<string, CruxToolManifest>();
for (const [path, value] of Object.entries(raw)) {
  const m = parseManifest(value);
  const folder = path.replace(/^.*\/([^/]+)-crux\/crux-tool\.json$/, '$1');
  if (m.id !== `${folder}-app`)
    throw new Error(`crux-tool.json in ${folder}-crux declares id ${m.id}; expected ${folder}-app`);
  if (manifests.has(m.id)) throw new Error(`two manifests declare ${m.id}`);
  manifests.set(m.id, m);
}

/** Every tool, in creation-menu order. */
export function toolManifests(): CruxToolManifest[] {
  return [...manifests.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function toolManifest(id: string | null | undefined): CruxToolManifest | null {
  return (id && manifests.get(id)) || null;
}

/** The manifest behind a Crux, by its template id. */
export function manifestFor(
  crux: { meta?: Record<string, unknown> } | null | undefined,
): CruxToolManifest | null {
  const template = crux?.meta?.template;
  return typeof template === 'string' ? toolManifest(template) : null;
}

/** Template id → native app type, for every tool that has one. */
export function nativeAppTypes(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of manifests.values()) out[m.id] = m.app;
  return out;
}

/** Template id → provenance, as `TOOL_INFO` used to list it. */
export function toolInfos(): Record<string, ToolInfo> {
  const out: Record<string, ToolInfo> = {};
  for (const m of manifests.values()) out[m.id] = { ...m.toolInfo };
  return out;
}

/** Drop routes declared by tools this build can create from, in menu order. */
export function toolRoutes(): {
  test: RegExp;
  route: { templateId: string; kind: CruxToolManifest['kind']; tool: string; folder: string };
}[] {
  const out: ReturnType<typeof toolRoutes> = [];
  for (const m of toolManifests())
    for (const r of available.has(m.id) || isToolInstalled(m.id) ? m.routes : []) {
      const alts = r.extensions.map((e) => e.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      out.push({
        test: new RegExp(`\\.(${alts.join('|')})$`, 'i'),
        route: { templateId: m.id, kind: m.kind, tool: m.name, folder: r.folder },
      });
    }
  return out;
}

/**
 * Whether this build can create from the tool right now. A manifest is
 * always known; the tool's files are in the build only when it was bundled
 * (or CRUX_BUNDLE_TOOLS=all). Everything else installs from a .crux package
 * (CRUX-TOOLS-DISTRIBUTION-PLAN §3).
 */
export function isToolAvailable(id: string): boolean {
  return !toolManifest(id) || available.has(id) || isToolInstalled(id);
}

/** In the build itself, as opposed to installed into this garden. */
export function isToolBundled(id: string): boolean {
  return available.has(id);
}

/**
 * Installed into this garden as a Template Crux (services/crux-tools/installed.ts
 * keeps the record; read here without importing it, so the registry stays a leaf).
 */
export function isToolInstalled(id: string): boolean {
  const raw = getSetting(SettingsKey.InstalledTools);
  if (!raw) return false;
  try {
    return !!(JSON.parse(raw) as Record<string, unknown>)[id];
  } catch {
    return false;
  }
}
