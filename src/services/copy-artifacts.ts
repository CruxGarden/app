import type { Crux } from '@/api/types';
import { pathOf } from '@/lib/artifact-path';
import { getWorkspace } from '@/stores/workspaceRegistry';
import { getServices } from './index';
import { hasGardenGraph, gardenMembers } from './garden-navigation';
import { assertCopyWritable, findWorkingCopy, serializeCopy } from './working-copies';
import { flushNotebook } from './notebook-lifecycle';
import { documentsFor } from './workspace-documents';
import { settleIngestion, announceExternalChange } from './ingestion';
import { folderForCrux, projectArtifactPaths } from './project-folder';
import { captureEditCheckpoint } from './edit-history';
import { putBlob } from './blobs';
import { packagePath } from './crux-tools/package';

/** Only live creative members of the captured Garden can receive files. */
export async function artifactDestinations(
  gardenId: string | undefined,
  sourceId: string,
): Promise<Crux[]> {
  const source = (await findWorkingCopy(sourceId))?.cruxId ?? sourceId;
  const members = hasGardenGraph()
    ? gardenId
      ? await gardenMembers(gardenId)
      : []
    : await getServices().crux.listAll();
  return members.filter(
    (crux) =>
      crux.id !== source && !['garden', 'mood', 'tool', 'snapshot'].includes(crux.kind ?? ''),
  );
}

export interface CopyArtifactsInput {
  gardenId?: string;
  sourceId: string;
  targetId: string;
  paths: string[];
  /** Optional receiving folder; source paths remain intact beneath it. */
  folder?: string;
}

/** Copy saved bytes, never move originals or overwrite a destination. */
export async function copyArtifacts(input: CopyArtifactsInput): Promise<string[]> {
  const request = structuredClone(input);
  const paths = [...new Set(request.paths)];
  const folder = (request.folder ?? '').trim().replace(/\/$/, '');
  if (!paths.length || paths.some((path) => !packagePath(path)) || (folder && !packagePath(folder)))
    throw new Error('Choose files and a relative destination folder inside the receiving Crux.');
  if (
    !(await artifactDestinations(request.gardenId, request.sourceId)).some(
      (crux) => crux.id === request.targetId,
    )
  )
    throw new Error('Choose another available Crux in this Garden.');
  const workspace = getWorkspace(request.sourceId);
  if (workspace?.data.getState().viewingSnapshotId)
    throw new Error('Return to the current files before copying to another Crux.');
  if (workspace) await documentsFor(workspace.data, workspace.ui).saveAll();
  else await flushNotebook(request.sourceId);
  await settleIngestion();
  const result = await serializeCopy(request.targetId, async () => {
    await assertCopyWritable(request.targetId);
    // Membership/deletion may change while the source editor saves.
    if (
      !(await artifactDestinations(request.gardenId, request.sourceId)).some(
        (crux) => crux.id === request.targetId,
      )
    )
      throw new Error('The receiving Crux is no longer available in this Garden.');
    const { artifact } = getServices();
    const source = await artifact.findByResource('crux', request.sourceId);
    const existing = await artifact.findByResource('crux', request.targetId);
    const targetFolder = await folderForCrux(request.targetId);
    const destinations = paths.map((path) => (folder ? `${folder}/${path}` : path));
    const occupied = existing.map((file) => pathOf(file).toLowerCase());
    for (const path of destinations) {
      const lower = path.toLowerCase();
      if (
        occupied.some((p) => p === lower || p.startsWith(lower + '/') || lower.startsWith(p + '/'))
      )
        throw new Error(`A file already exists at ${path}. Choose another receiving folder.`);
      occupied.push(lower);
      if (targetFolder) {
        try {
          await window.electronAPI!.project.readFile(targetFolder, path);
          throw new Error(`A file already exists at ${path}. Choose another receiving folder.`);
        } catch (error) {
          if (!String(error).includes('ENOENT')) throw error;
        }
      }
    }
    const registrations = [];
    for (const [index, path] of paths.entries()) {
      const file = source.find((item) => pathOf(item) === path);
      if (!file)
        throw new Error(`The source file ${path} is no longer available. Refresh and try again.`);
      const blob = await artifact.downloadBlob(file);
      registrations.push({
        resourceId: request.targetId,
        path: destinations[index]!,
        fingerprint: await putBlob(blob),
        size: blob.size,
        mimeType: file.mimeType,
        encoding: file.encoding,
        meta: {
          path: destinations[index]!,
          mode: file.meta?.mode,
          copiedFrom: { cruxId: request.sourceId, path, fingerprint: file.fingerprint },
        },
      });
    }
    await artifact.registerMany(registrations);
    await projectArtifactPaths(request.targetId, destinations);
    return destinations;
  });
  announceExternalChange(request.targetId);
  await getWorkspace(request.targetId)?.data.getState().refreshArtifacts();
  await captureEditCheckpoint(request.targetId);
  return result;
}
