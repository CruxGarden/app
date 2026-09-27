import { captureGardenId } from '@/stores/gardenContext';
import type { ExportOptions, ExportResult, ImportOptions, ImportResult } from './crux-io';
import type { CruxMeta } from '@/api/types';
import { getSqliteClient } from './sqlite/client';
import { getLocalIdentity } from './sqlite/identity';
import { getServices } from './index';

function bridge() {
  const archive = getSqliteClient().privateArchive;
  if (!archive)
    throw new Error('The API archive service is unavailable. Restart Garden and retry.');
  return archive;
}
export async function privateArchiveBytes(data: Blob | ArrayBuffer) {
  return new Uint8Array(data instanceof Blob ? await data.arrayBuffer() : data.slice(0));
}
export async function exportPrivateCrux(options: ExportOptions): Promise<ExportResult> {
  const api = bridge();
  const cruxId = options.cruxId;
  options.onProgress?.('Saving files and conversation…');
  const { withCapturedTaskGraph } = await import('./tasks');
  return withCapturedTaskGraph(cruxId, async () => {
    // The capture coordinator drains and saves the authoritative workspace;
    // stale props passed by an export dialog must not override that saved state.
    const crux = await getServices().crux.findById(cruxId);
    options.onProgress?.('Packing complete Crux…');
    const bytes = await api.export({ roots: [cruxId], includeMembers: false });
    return {
      blob: new Blob([Uint8Array.from(bytes).buffer], { type: 'application/zip' }),
      filename: `${crux.slug || 'crux'}-${Date.now()}.crux`,
      failed: [],
    };
  });
}
export async function importPrivateCrux(options: ImportOptions): Promise<ImportResult> {
  const api = bridge();
  const gardenId = options.gardenId ?? captureGardenId();
  const mode = options.mode ?? 'restore';
  const requestId = options.requestId ?? crypto.randomUUID();
  const data = privateArchiveBytes(options.data);
  const identity = { ...(await getLocalIdentity()) };
  const bytes = await data;
  const info = await api.inspect(bytes);
  if (info.roots.length !== 1) throw new Error('Choose an archive with one selected root Crux.');
  options.onProgress?.(0, 1);
  const admit = (replacementToken?: string) =>
    api.import(bytes, {
      requestId,
      mode: mode === 'clone' ? 'copy' : mode,
      destination: identity,
      ...(gardenId ? { gardenId } : {}),
      ...(replacementToken ? { replacementToken } : {}),
    });
  const result = await (async () => {
    if (mode !== 'replace') return admit();
    if (info.includeMembers)
      throw new Error('Import this Garden as a copy. Restore a single Crux from its own export.');
    const { withClosedCruxWorkspaces } = await import('@/stores/workspaceRegistry');
    return withClosedCruxWorkspaces(info.roots[0]!, async () => {
      const token = await api.replacementToken({ roots: info.roots, includeMembers: false });
      return admit(token);
    });
  })();
  const cruxId = result.roots[0]!;
  // An archive made before captures retained a tool's ignored runtime holds the
  // person's work without the tool's files: put them back from the tool here.
  // The Crux opens either way; without its tool the Workshop names what it needs.
  const { restoreToolRuntime } = await import('./tool-runtime');
  await restoreToolRuntime(cruxId).catch((error) =>
    console.warn('[import] could not restore the tool runtime:', error),
  );
  const meta = (info.root.meta ?? {}) as CruxMeta;
  options.onProgress?.(1, 1);
  return {
    cruxId,
    title: String(info.root.title || 'Imported Crux'),
    growthCount: info.growthCount,
    failedArtifacts: [],
    layout: meta.layout as ImportResult['layout'],
    theme: meta.theme as ImportResult['theme'],
  };
}
