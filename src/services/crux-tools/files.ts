import type { Crux, Artifact } from '@/api/types';
import { pathOf } from '@/lib/artifact-path';
import { manifestFor } from './registry';
import { parseManifest } from './manifest';
import { packTool, openToolPackage, TOOL_PACKAGE_PATH } from './package';
import { getServices } from '../index';
import { putBlob } from '../blobs';
import { hashContent } from '../sqlite/helpers';
import { publishableArtifacts } from '../publish';
import { installToolFromPublished } from './installed';

/** The same complete archive is used for Explore and .cruxtool files. */
export async function exportToolFile(crux: Crux, artifacts: Artifact[]) {
  const service = getServices().artifact;
  const packed = artifacts.find((file) => pathOf(file) === TOOL_PACKAGE_PATH);
  let blob: Blob;
  if (packed) {
    blob = await service.downloadBlob(packed);
    await openToolPackage(blob);
  } else {
    const definition = artifacts.find((file) => pathOf(file) === 'crux-tool.json');
    const manifest = definition
      ? parseManifest(JSON.parse(await service.readContent(definition)))
      : manifestFor(crux);
    if (!manifest) throw new Error('Add a valid crux-tool.json before exporting a tool.');
    blob = await packTool(
      manifest,
      await Promise.all(
        publishableArtifacts(artifacts).map(async (file) => ({
          path: pathOf(file),
          blob: await service.downloadBlob(file),
          mimeType: file.mimeType || 'application/octet-stream',
        })),
      ),
    );
  }
  return { blob, filename: `${crux.slug || 'tool'}.cruxtool`, failed: [] as string[] };
}

export async function installToolFile(blob: Blob) {
  const { manifest } = await openToolPackage(blob);
  const fingerprint = await hashContent(blob);
  // A file has no authenticated publisher identity. Scope it to its content;
  // never let its claimed id replace a published or built-in installation.
  return installToolFromPublished(
    {
      id: `file-${fingerprint}`,
      slug: manifest.id,
      author_username: '',
      meta: { template: manifest.id, toolPackage: { version: 1, artifactId: 'file', fingerprint } },
    },
    { apiDownload: async () => blob, putBlob },
  );
}
