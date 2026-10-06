import { exportCrux, importCrux } from './crux-io';
import { getServices } from './index';

/** Use the same complete archive path as a portable copy, including Tasks and history. */
export async function duplicateCrux(
  cruxId: string,
  gardenId: string | undefined,
  onProgress: (status: string) => void,
) {
  const exported = await exportCrux({ cruxId, onProgress });
  if (exported.failed.length)
    throw new Error('The copy could not be made because its export is incomplete.');
  onProgress('Creating independent copy…');
  const imported = await importCrux({ data: exported.blob, mode: 'clone', gardenId });
  try {
    if (imported.failedArtifacts.length) throw new Error('Some files could not be copied.');
    return await getServices().crux.update(imported.cruxId, { title: `${imported.title} — copy` });
  } catch (error) {
    // Only this newly created copy is rolled back; the source is never changed.
    await getServices().crux.trash(imported.cruxId);
    throw error;
  }
}
