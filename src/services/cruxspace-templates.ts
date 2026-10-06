import catalog from '@/data/cruxspace-templates.json';
import { importCruxspace, type ImportCruxspaceResult } from './cruxspace-package';
import { getServices } from './index';
import { deleteCruxspace } from './cruxspaces';
import { isEmbeddedApp } from './embedded-app';
import { useUIStore } from '@/stores/uiStore';

export const cruxspaceTemplates = catalog;
export type CruxspaceTemplate = (typeof catalog)[number];
export type ExampleMode = 'beside' | 'start';

/** Templates are ordinary portable packages; all history and clone rules stay in the importer. */
export async function startCruxspaceTemplate(options: {
  templateId: string;
  name?: string;
  exampleMode?: ExampleMode;
  onProgress?: (message: string) => void;
}): Promise<{ space: ImportCruxspaceResult['space']; exampleSpaceId?: string }> {
  const template = catalog.find((entry) => entry.id === options.templateId);
  if (!template) throw new Error('Choose an available undertaking.');
  const name = options.name?.trim() || template.name;
  if (name.length > 120) throw new Error('Use a name up to 120 characters.');
  const mode = options.exampleMode ?? 'beside';
  if (mode !== 'beside' && mode !== 'start') throw new Error('Choose how to use the example.');
  const editions = mode === 'beside' ? ['starter', 'example'] : ['example'];
  // Fetch every file first; a connection failure must not leave half an undertaking.
  const packages = await Promise.all(
    editions.map(async (edition) => {
      const response = await fetch(
        `${import.meta.env.BASE_URL}cruxspace-templates/${template.id}-${edition}.cruxspace`,
      );
      if (!response.ok) throw new Error(`Could not load ${template.name}. Please try again.`);
      return response.arrayBuffer();
    }),
  );
  const imported: ImportCruxspaceResult[] = [];
  try {
    // The undertaking is one Garden; beside it, its worked example grows inside it.
    for (const [index, data] of packages.entries()) {
      const result = await importCruxspace({
        data,
        mode: 'clone',
        onProgress: options.onProgress,
        ...(index === 0 ? { name } : { gardenId: imported[0]!.space.id }),
      });
      imported.push(result);
      if (result.failedArtifacts.length || result.unavailable.length || result.missingTools.length)
        throw new Error(
          'This undertaking could not be restored completely. No partial copy was kept.',
        );
    }
    for (const result of imported)
      for (const member of result.members)
        if (isEmbeddedApp(await getServices().crux.findById(member.id)))
          useUIStore.getState().seedCruxLayout(member.id, 27);
    const space = imported[0]!.space;
    return { space, ...(imported[1] ? { exampleSpaceId: imported[1].space.id } : {}) };
  } catch (error) {
    for (const result of imported.reverse()) {
      for (const member of result.members) await getServices().crux.delete(member.id);
      await deleteCruxspace(result.space.id);
    }
    throw error;
  }
}
