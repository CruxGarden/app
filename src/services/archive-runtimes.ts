import type JSZip from 'jszip';
import { hashContent } from './sqlite/helpers';
import { getServices } from './index';
import { getSqliteClient } from './sqlite/client';
import { getSetting, setSetting } from './settings';
import { toolManifest } from './crux-tools/registry';
import { installedTool } from './crux-tools/installed';

export type RuntimeMode = 'reference' | 'included';
const PREFERENCE = 'cruxgarden:export-runtime-mode';
export function archiveRuntimeMode(): RuntimeMode {
  return getSetting(PREFERENCE) === 'included' ? 'included' : 'reference';
}
export function rememberRuntimeMode(mode: RuntimeMode): void {
  setSetting(PREFERENCE, mode);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('archive:runtime-mode'));
}

export async function estimateRuntimeFiles(
  template: string | undefined,
  artifacts: { fingerprint?: string | null; size?: number | string | null }[],
): Promise<{ included: number; reference: number }> {
  const sizes = new Map(
    artifacts.filter((a) => a.fingerprint).map((a) => [a.fingerprint!, Number(a.size) || 0]),
  );
  const included = [...sizes.values()].reduce((sum, size) => sum + size, 0);
  const candidates = await runtimeCandidates(template ? [template] : [], new Set(sizes.keys()));
  for (const fingerprint of candidates.keys()) sizes.delete(fingerprint);
  return { included, reference: [...sizes.values()].reduce((sum, size) => sum + size, 0) };
}

interface RuntimeFile {
  path: string;
  fingerprint: string;
  size: number;
  read: () => Promise<Uint8Array>;
}
interface RuntimeTool {
  id: string;
  releaseVersion: string;
  files: RuntimeFile[];
}
interface RuntimeReference {
  tool: string;
  releaseVersion: string;
  path: string;
  fingerprint: string;
  size: number;
}

/** Keep the person's document and all licensing/provenance with the archive. */
function isToolFile(path: string, contentRoot: string, document?: string): boolean {
  return (
    path !== document &&
    !(contentRoot && path.startsWith(contentRoot.replace(/\/$/, '') + '/')) &&
    !/(^|\/)(?:[^/]*licen[cs]e[^/]*|copying[^/]*|notice[^/]*|upstream\.md|readme[^/]*)$/i.test(path)
  );
}

/** No remote lookup: only the tool already installed here or shipped in this build. */
async function runtimeTool(id: string, wantedPaths?: Set<string>): Promise<RuntimeTool | null> {
  const manifest = toolManifest(id);
  if (!manifest) return null;
  const files: RuntimeFile[] = [];
  const installed = installedTool(id);
  if (installed) {
    const artifacts = await getServices().artifact.findByResource('crux', installed.cruxId);
    for (const artifact of artifacts) {
      const path = (artifact.meta?.path as string) || artifact.filename;
      if (
        !artifact.fingerprint ||
        (wantedPaths && !wantedPaths.has(path)) ||
        !isToolFile(path, manifest.contentRoot, manifest.document?.path)
      )
        continue;
      const fingerprint = artifact.fingerprint;
      files.push({
        path,
        fingerprint,
        size: Number(artifact.size) || 0,
        read: () => getSqliteClient().blobRead(fingerprint),
      });
    }
  }
  {
    const { loadTemplate } = await import('@/templates');
    const template = await loadTemplate(id).catch(() => null);
    for (const file of template?.files ?? []) {
      if (
        (wantedPaths && !wantedPaths.has(file.path)) ||
        !isToolFile(file.path, manifest.contentRoot, manifest.document?.path)
      )
        continue;
      const read = async (): Promise<Uint8Array> => {
        if (file.encoding === 'asset-url') {
          const response = await fetch(file.content);
          if (!response.ok) throw new Error(`Could not read ${id}: ${file.path}`);
          return new Uint8Array(await response.arrayBuffer());
        }
        if (file.encoding === 'base64')
          return Uint8Array.from(atob(file.content), (char) => char.charCodeAt(0));
        return new TextEncoder().encode(file.content);
      };
      const bytes = await read();
      files.push({
        path: file.path,
        fingerprint: await hashContent(bytes),
        size: bytes.byteLength,
        read,
      });
    }
  }
  return { id, releaseVersion: manifest.releaseVersion ?? 'unversioned', files };
}

async function runtimeCandidates(
  templateIds: string[],
  fingerprints: Set<string>,
): Promise<Map<string, RuntimeReference>> {
  const usages = await getSqliteClient().all<{
    fingerprint: string;
    path: string | null;
    filename: string;
  }>('SELECT fingerprint, path, filename FROM artifacts WHERE fingerprint IS NOT NULL');
  const candidates = new Map<string, RuntimeReference>();
  const paths = new Map<string, Set<string>>();
  for (const id of new Set(templateIds)) {
    // An unavailable tool is carried in full. Export remains useful offline.
    const manifest = toolManifest(id);
    if (!manifest) continue;
    const wantedPaths = new Set(
      usages
        .filter((usage) => fingerprints.has(usage.fingerprint))
        .map((usage) => usage.path || usage.filename)
        .filter((path) => isToolFile(path, manifest.contentRoot, manifest.document?.path)),
    );
    // Content-only projects have nothing to omit: do not load a large editor just to check.
    if (!wantedPaths.size) continue;
    const tool = await runtimeTool(id, wantedPaths).catch(() => null);
    for (const file of tool?.files ?? []) {
      candidates.set(file.fingerprint, {
        tool: id,
        releaseVersion: tool!.releaseVersion,
        path: file.path,
        fingerprint: file.fingerprint,
        size: file.size,
      });
      const allowed = paths.get(file.fingerprint) ?? new Set<string>();
      allowed.add(file.path);
      paths.set(file.fingerprint, allowed);
    }
  }
  if (!candidates.size) return candidates;
  // A deduplicated blob can also be a person's document or a licence. Keep it
  // whenever any Artifact uses those same bytes outside the tool's file paths.

  for (const usage of usages)
    if (
      candidates.has(usage.fingerprint) &&
      !paths.get(usage.fingerprint)?.has(usage.path || usage.filename)
    )
      candidates.delete(usage.fingerprint);
  return candidates;
}

/** Only remove exact matches; unchanged metadata keeps history fingerprints intact. */
export async function referenceArchiveRuntimes(
  zip: JSZip,
  templateIds: string[],
  mode: RuntimeMode,
): Promise<void> {
  if (mode === 'included') return;
  const candidates = await runtimeCandidates(
    templateIds,
    new Set(
      Object.keys(zip.files)
        .filter((path) => path.startsWith('artifacts/'))
        .map((path) => path.slice(10)),
    ),
  );
  const references: RuntimeReference[] = [];
  for (const ref of candidates.values()) {
    const name = `artifacts/${ref.fingerprint}`;
    if (!zip.file(name)) continue;
    zip.remove(name);
    references.push(ref);
  }
  if (!references.length) return;
  const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));
  zip.file(
    'manifest.json',
    JSON.stringify({
      ...manifest,
      version: '3.0',
      baseVersion: manifest.version,
      runtimeReferences: references,
    }),
  );
}

/** Resolve every reference before any importer changes the destination. */
export async function hydrateArchiveRuntimes(zip: JSZip): Promise<void> {
  const entry = zip.file('manifest.json');
  if (!entry) return;
  const manifest = JSON.parse(await entry.async('text'));
  if (String(manifest.version).split('.')[0] !== '3') return;
  const references = manifest.runtimeReferences as RuntimeReference[];
  if (
    !['1.0', '2.0'].includes(manifest.baseVersion) ||
    !Array.isArray(references) ||
    !references.length ||
    references.length > 100_000
  )
    throw new Error('Invalid tool-reference archive.');
  const tools = new Map<string, RuntimeTool | null>();
  const fingerprints = new Set<string>();
  for (const ref of references) {
    if (
      !ref ||
      typeof ref.tool !== 'string' ||
      typeof ref.releaseVersion !== 'string' ||
      typeof ref.path !== 'string' ||
      !/^[a-f0-9]{64}$/.test(ref.fingerprint) ||
      !Number.isSafeInteger(ref.size) ||
      ref.size < 0 ||
      fingerprints.has(ref.fingerprint)
    )
      throw new Error('Invalid tool reference.');
    fingerprints.add(ref.fingerprint);
    if (!tools.has(ref.tool))
      tools.set(
        ref.tool,
        await runtimeTool(
          ref.tool,
          new Set(references.filter((item) => item?.tool === ref.tool).map((item) => item.path)),
        ).catch(() => null),
      );
    const file = tools
      .get(ref.tool)
      ?.files.find(
        (candidate) => candidate.path === ref.path && candidate.fingerprint === ref.fingerprint,
      );
    if (!file)
      throw new Error(
        `This archive needs ${ref.tool} (${ref.releaseVersion}). Install the matching tool, or ask for an archive with tools included.`,
      );
    const bytes = await file.read();
    if (bytes.byteLength !== ref.size || (await hashContent(bytes)) !== ref.fingerprint)
      throw new Error(`Tool file verification failed: ${ref.tool}/${ref.path}`);
    zip.file(`artifacts/${ref.fingerprint}`, bytes);
  }
  const { baseVersion, runtimeReferences: _references, ...base } = manifest;
  zip.file('manifest.json', JSON.stringify({ ...base, version: baseVersion }));
}
