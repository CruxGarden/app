import { exportCrux, type ExportOptions } from './crux-io';
import { getServices } from './index';
import { exportToolFile } from './crux-tools/files';
import { importMoodPackage } from '@/lib/moods/packages';
import { hashContent } from './sqlite/helpers';

/** User-facing exports distinguish installable packages from project archives. */
export async function exportCreation(options: ExportOptions) {
  const services = getServices();
  const crux = await services.crux.findById(options.cruxId);
  if (crux.kind !== 'tool' && crux.kind !== 'mood') return exportCrux(options);
  const files = await services.artifact.findByResource('crux', crux.id);
  if (crux.kind === 'tool') return exportToolFile(crux, files);
  const file = files.find((f) => (f.meta?.path || f.filename) === 'mood.cruxmood');
  if (!file) throw new Error('This Mood is missing its installable package.');
  const blob = await services.artifact.downloadBlob(file);
  if (!(await importMoodPackage(blob, hashContent)))
    throw new Error('This Mood package is invalid.');
  return { blob, filename: `${crux.slug || 'mood'}.cruxmood`, failed: [] as string[] };
}
export function creationExportLabel(kind?: string | null) {
  return kind === 'tool'
    ? 'Export Tool (.cruxtool)'
    : kind === 'mood'
      ? 'Export Mood (.cruxmood)'
      : 'Export Crux';
}
