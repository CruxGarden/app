import { getServices } from './index';
import { putBlob } from './blobs';
import { importMoodPackage, installMood, refreshInstalledMoods } from '@/lib/moods/packages';
import { nativeMoodLibrary } from './mood-library';
import { installToolFromCrux } from './crux-tools/installed';

/** Both import entry points install without silently wearing a Mood. */
export async function installMoodFile(file: Blob, gardenId?: string) {
  const pkg = await importMoodPackage(file, putBlob);
  if (!pkg) throw new Error('This file does not contain a Mood package.');
  return installMood(pkg, { gardenId });
}

/** Only distributable kinds install. Importing an ordinary tool-created project stays a project. */
export async function installImportedCreation(cruxId: string, gardenId?: string) {
  const services = getServices();
  const crux = await services.crux.findById(cruxId);
  if (crux.kind === 'tool') {
    const tool = await installToolFromCrux(cruxId);
    if (!tool) throw new Error('This Tool Crux has no valid tool definition.');
    return { kind: 'tool' as const, id: tool.id, name: tool.manifest?.name ?? crux.title };
  }
  if (crux.kind === 'mood') {
    // Private imports already carry the real Mood Crux into the destination Garden.
    if (nativeMoodLibrary()) {
      const moods = await refreshInstalledMoods(gardenId);
      const mood = moods.find((m) => m.id === cruxId);
      if (!mood) throw new Error('The imported Mood could not be opened in this Garden.');
      return { kind: 'mood' as const, id: mood.id, name: mood.name };
    }
    const files = await services.artifact.findByResource('crux', cruxId);
    const packageFile = files.find((f) => (f.meta?.path || f.filename) === 'mood.cruxmood');
    if (!packageFile) throw new Error('This Mood Crux is missing mood.cruxmood.');
    const mood = await installMoodFile(await services.artifact.downloadBlob(packageFile), gardenId);
    return { kind: 'mood' as const, id: mood.id, name: mood.name };
  }
  return null;
}
