import { getServices } from './index';
import { getCruxspace } from './cruxspaces';
import { hashContent } from './sqlite/helpers';
import { pathOf } from '@/lib/artifact-path';
import { assertCopyWritable, findWorkingCopy, serializeCopy } from './working-copies';
import { flushIngestion } from './ingestion';
import { folderForCrux } from './project-folder';
import { growthHostFor } from './growth';

export interface CruxOutput {
  version: 1;
  id: string;
  label: string;
  path: string;
  fingerprint: string;
  mimeType: string;
  size: number;
  created: string;
}
export interface CruxspaceAsset extends CruxOutput {
  sourceCruxId: string;
  sourceTitle: string;
}
export interface AssetOrigin {
  version: 1;
  spaceId: string;
  spaceName: string;
  sourceCruxId: string;
  sourceTitle: string;
  outputId: string;
  sourcePath: string;
  fingerprint: string;
  label: string;
  path: string;
  imported: string;
}
const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
function validPath(path: string) {
  return (
    path.length <= 240 &&
    !path.split('/').some((p) => !p || p === '.' || p === '..' || p.startsWith('.')) &&
    /^[\w /.-]+$/.test(path)
  );
}
async function checkpoint(owner: string, label: string) {
  await flushIngestion();
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent('crux:external-change', { detail: { cruxId: owner } }));
  await (await growthHostFor(owner)).snapshot({ label, requestedBy: 'person' });
}

/** A finished output and its descriptor are ordinary files; Growth and archives retain both. */
export async function saveCruxOutput(
  owner: string,
  blob: Blob,
  label: string,
): Promise<CruxOutput> {
  return serializeCopy(owner, async () => {
    await assertCopyWritable(owner);
    await getServices().crux.findById(owner);
    const ext = EXTENSIONS[blob.type];
    if (!ext || !blob.size || blob.size > 4_000_000)
      throw new Error('Choose a PNG, JPEG, WebP or GIF up to 4 MB.');
    if (!label.trim() || label.length > 120)
      throw new Error('Name the output using up to 120 characters.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const id = crypto.randomUUID();
    const output: CruxOutput = {
      version: 1,
      id,
      label: label.trim(),
      path: `exports/${id}.${ext}`,
      fingerprint: await hashContent(bytes),
      mimeType: blob.type,
      size: blob.size,
      created: new Date().toISOString(),
    };
    const { artifact } = getServices();
    await artifact.upload({
      resourceId: owner,
      blob,
      mimeType: blob.type,
      meta: { path: output.path },
    });
    await artifact.create({
      resourceId: owner,
      content: JSON.stringify(output, null, 2),
      meta: { path: `exports/${id}.asset.json` },
    });
    await checkpoint(owner, `Output: ${output.label}`);
    return output;
  });
}

export async function listCruxspaceAssets(spaceId: string): Promise<CruxspaceAsset[]> {
  await flushIngestion();
  const space = await getCruxspace(spaceId);
  const { crux, artifact } = getServices();
  const live = new Map((await crux.listAll()).map((c) => [c.id, c]));
  const assets: CruxspaceAsset[] = [];
  for (const id of space.cruxIds) {
    const source = live.get(id);
    if (!source) continue;
    const files = await artifact.findByResource('crux', id);
    for (const descriptor of files.filter((f) =>
      /^exports\/[\w-]+\.asset\.json$/.test(pathOf(f)),
    )) {
      if ((descriptor.size ?? 0) > 16000) continue;
      let output: CruxOutput;
      try {
        output = JSON.parse(await artifact.readContent(descriptor.id));
      } catch {
        continue;
      }
      if (
        output?.version !== 1 ||
        typeof output.id !== 'string' ||
        !/^[\w-]{1,80}$/.test(output.id) ||
        typeof output.label !== 'string' ||
        !output.label.trim() ||
        output.label.length > 120 ||
        typeof output.created !== 'string' ||
        !Number.isFinite(Date.parse(output.created)) ||
        typeof output.fingerprint !== 'string' ||
        !/^[a-f0-9]{64}$/.test(output.fingerprint) ||
        !Number.isSafeInteger(output.size) ||
        output.size <= 0 ||
        output.size > 4_000_000 ||
        typeof output.path !== 'string' ||
        !validPath(output.path) ||
        !EXTENSIONS[output.mimeType]
      )
        continue;
      if (
        pathOf(descriptor) !== `exports/${output.id}.asset.json` ||
        !output.path.startsWith(`exports/${output.id}.`)
      )
        continue;
      const file = files.find((f) => pathOf(f) === output.path);
      if (!file || file.fingerprint !== output.fingerprint || file.size !== output.size) continue;
      assets.push({ ...output, sourceCruxId: id, sourceTitle: source.title || 'Untitled' });
    }
  }
  return assets.sort((a, b) => b.created.localeCompare(a.created));
}

export interface UseCruxspaceAsset {
  spaceId: string;
  sourceCruxId: string;
  outputId: string;
  fingerprint: string;
  targetCruxId: string;
  path: string;
}
export async function assetProvenancePath(path: string) {
  return `cruxspace-assets/${await hashContent(path)}.json`;
}
export async function copyCruxspaceAsset(input: UseCruxspaceAsset) {
  return serializeCopy(input.targetCruxId, async () => {
    const { artifact } = getServices();
    const space = await getCruxspace(input.spaceId);
    const copy = await findWorkingCopy(input.targetCruxId);
    const live = await getServices().crux.listAll();
    if (!live.some((c) => c.id === (copy?.cruxId ?? input.targetCruxId)))
      throw new Error('The receiving Crux is no longer available.');
    if (!space.cruxIds.includes(copy?.cruxId ?? input.targetCruxId))
      throw new Error('The receiving Crux must belong to this Cruxspace.');
    await assertCopyWritable(input.targetCruxId);
    const asset = (await listCruxspaceAssets(input.spaceId)).find(
      (a) =>
        a.id === input.outputId &&
        a.sourceCruxId === input.sourceCruxId &&
        a.fingerprint === input.fingerprint,
    );
    if (!asset)
      throw new Error(
        'This output is no longer available at the selected version. Refresh the assets.',
      );
    if (
      !validPath(input.path) ||
      !/\.(png|jpe?g|gif|webp)$/i.test(input.path) ||
      input.path.startsWith('exports/')
    )
      throw new Error('Choose a relative image path, for example assets/cover.png.');
    const files = await artifact.findByResource('crux', input.targetCruxId);
    if (files.some((f) => pathOf(f).toLowerCase() === input.path.toLowerCase()))
      throw new Error('A file already exists at this path. Choose a new path.');
    const folder = await folderForCrux(input.targetCruxId);
    if (folder) {
      let exists = false;
      try {
        await window.electronAPI!.project.readFile(folder, input.path);
        exists = true;
      } catch (error) {
        if (!String(error).includes('ENOENT')) throw error;
      }
      if (exists) throw new Error('A file already exists at this path. Choose a new path.');
    }
    const source = (await artifact.findByResource('crux', asset.sourceCruxId)).find(
      (f) => pathOf(f) === asset.path,
    );
    if (!source) throw new Error('This output is no longer available.');
    const blob = await artifact.downloadBlob(source.id);
    if ((await hashContent(new Uint8Array(await blob.arrayBuffer()))) !== input.fingerprint)
      throw new Error('The selected output changed. Refresh the assets.');
    const origin: AssetOrigin = {
      version: 1,
      spaceId: space.id,
      spaceName: space.name,
      sourceCruxId: asset.sourceCruxId,
      sourceTitle: asset.sourceTitle,
      outputId: asset.id,
      sourcePath: asset.path,
      fingerprint: asset.fingerprint,
      label: asset.label,
      path: input.path,
      imported: new Date().toISOString(),
    };
    const provenancePath = await assetProvenancePath(input.path);
    if (files.some((f) => pathOf(f) === provenancePath))
      throw new Error('An earlier import already records this path. Choose a new path.');
    // Write the sidecar first: an interrupted copy can leave a recoverable
    // reference, but can never silently lose the origin of successful bytes.
    await artifact.create({
      resourceId: input.targetCruxId,
      content: JSON.stringify(origin, null, 2),
      meta: { path: provenancePath },
    });
    const imported = await artifact.upload({
      resourceId: input.targetCruxId,
      blob,
      mimeType: asset.mimeType,
      meta: { path: input.path },
    });
    await checkpoint(input.targetCruxId, `Used ${asset.label} from ${space.name}`);
    return { artifact: imported, origin, provenancePath };
  });
}
