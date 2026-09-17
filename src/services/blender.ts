import { getServices } from './index';
import { pathOf } from '@/lib/artifact-path';
import { guessMimeType } from '@/lib/mime';
import { flushIngestion } from './ingestion';
import { assertCopyWritable } from './working-copies';
import { saveCruxOutput } from './cruxspace-assets';
import { hashContent } from './sqlite/helpers';

/** Share a specific saved version, never claim the open native scene is saved. */
export async function registerBlenderOutput(
  owner: string,
  path: string,
  fingerprint: string,
  label: string,
) {
  await flushIngestion();
  await assertCopyWritable(owner);
  const { crux, artifact } = getServices();
  if ((await crux.findById(owner)).meta?.template !== 'blender')
    throw new Error('Open a Blender Crux first.');
  const files = await artifact.findByResource('crux', owner);
  const scene = files.find((f) => pathOf(f) === 'scene.blend');
  if (!scene?.fingerprint) throw new Error('Save scene.blend in the Project Folder first.');
  const file = files.find((f) => pathOf(f) === path && f.fingerprint === fingerprint);
  if (!file) throw new Error('The selected output changed. Select its current saved version.');
  const type = guessMimeType(path);
  if (!['image/png', 'image/jpeg', 'image/webp', 'model/gltf-binary'].includes(type))
    throw new Error('Choose a saved PNG, JPEG, WebP or GLB Artifact.');
  const bytes = new Uint8Array(await (await artifact.downloadBlob(file.id)).arrayBuffer());
  if ((await hashContent(bytes)) !== fingerprint)
    throw new Error('The selected output changed. Select its current saved version.');
  if (type === 'model/gltf-binary') {
    const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (
      bytes.length < 20 ||
      header.getUint32(0, true) !== 0x46546c67 ||
      header.getUint32(4, true) !== 2 ||
      header.getUint32(8, true) !== bytes.length
    )
      throw new Error('This file is not a complete GLB 2 model. Export it again from Blender.');
  }
  return saveCruxOutput(owner, new Blob([bytes], { type }), label, {
    app: 'blender',
    scenePath: 'scene.blend',
    sceneFingerprint: scene.fingerprint,
    method: 'saved-artifact',
  });
}
