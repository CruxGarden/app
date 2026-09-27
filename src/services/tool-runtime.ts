import type { Artifact } from '@/api/types';
import { installedTool, installedToolPackage } from './crux-tools/installed';
import { toolManifest } from './crux-tools/registry';
import { stageFiles, templateFileBytes, type StagedFile } from './crux-create';
import { folderForCrux } from './project-folder';
import { getServices } from './index';

const TEXT_MIME = /^(text\/|application\/(javascript|json|xml))/;

/** The files a tool writes into a new Crux, from this build or the local installation. */
export async function toolFiles(id: string): Promise<StagedFile[] | null> {
  if (!toolManifest(id)) return null;
  const { loadTemplate } = await import('@/templates');
  const bundled = await loadTemplate(id).catch(() => null);
  if (bundled)
    return bundled.files.map((file) => ({
      path: file.path,
      mimeType: file.mimeType,
      binary: !!file.encoding,
      read: () => templateFileBytes(file),
    }));
  const installed = installedTool(id);
  const pkg = installed ? await installedToolPackage(installed) : null;
  if (!pkg) return null;
  return pkg.files.map((file) => ({
    path: file.path,
    mimeType: file.mimeType,
    binary: !TEXT_MIME.test(file.mimeType),
    read: file.read,
  }));
}

/** Which of a tool's files a Crux is missing among those its folder rules ignore. */
export function missingToolFiles(
  present: Iterable<string>,
  files: StagedFile[],
  ignored: Iterable<string>,
): StagedFile[] {
  const have = new Set(present);
  const covered = new Set(ignored);
  return files.filter((file) => !have.has(file.path) && covered.has(file.path));
}

/**
 * A tool Crux whose files lack the tool's own runtime gets it back from the
 * tool in this build or installed here, exactly as creation wrote it. Archives
 * made before captures retained ignored paths carried the person's work but
 * not `runtime/`, so the imported Workshop had nothing to open. Paths the
 * folder's rules do not ignore are the person's: a deleted source file stays
 * deleted. Returns the restored paths; an unavailable tool restores nothing.
 */
export async function restoreToolRuntime(cruxId: string): Promise<string[]> {
  const api = typeof window === 'undefined' ? undefined : window.electronAPI?.project;
  if (!api?.ignoredPaths) return [];
  const services = getServices();
  const crux = await services.crux.findById(cruxId);
  const id = typeof crux.meta?.template === 'string' ? crux.meta.template : null;
  if (!id || !toolManifest(id)) return [];
  const folder = await folderForCrux(cruxId);
  if (!folder) return [];
  const present = (await services.artifact.findByResource('crux', cruxId)).map((a: Artifact) =>
    String(a.meta?.path || a.filename),
  );
  const files = await toolFiles(id);
  if (!files) return [];
  const candidates = files.filter((file) => !present.includes(file.path));
  if (!candidates.length) return [];
  const ignored = await api.ignoredPaths(
    folder,
    candidates.map((file) => file.path),
  );
  const missing = missingToolFiles(present, candidates, ignored);
  if (!missing.length) return [];
  await stageFiles(cruxId, missing);
  return missing.map((file) => file.path);
}
