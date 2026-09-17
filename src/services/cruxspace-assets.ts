import { parseFigmaReference } from '../../electron/src/figma-reference';
import { getServices } from './index';
import { getCruxspace } from './cruxspaces';
import { hashContent } from './sqlite/helpers';
import { pathOf } from '@/lib/artifact-path';
import { assertCopyWritable, findWorkingCopy, serializeCopy } from './working-copies';
import { flushIngestion } from './ingestion';
import { folderForCrux } from './project-folder';
import { growthHostFor } from './growth';
import { guessMimeType } from './sqlite/helpers';

/** The remote source of an imported export; it is not a remote-document backup. */
export type ExternalOutputSource =
  | {
      app: 'figma';
      documentUrl: string;
      nodeId?: string;
      method: 'file-import' | 'mcp';
    }
  | {
      app: 'blender';
      scenePath: string;
      sceneFingerprint: string;
      method: 'saved-artifact';
    };
function cleanExternalSource(source: ExternalOutputSource): ExternalOutputSource {
  if (source.app === 'blender') {
    if (
      source.method !== 'saved-artifact' ||
      !validPath(source.scenePath) ||
      !source.scenePath.endsWith('.blend') ||
      !/^[a-f0-9]{64}$/.test(source.sceneFingerprint)
    )
      throw new Error('Invalid Blender scene provenance.');
    return {
      app: 'blender',
      scenePath: source.scenePath,
      sceneFingerprint: source.sceneFingerprint,
      method: 'saved-artifact',
    };
  }
  if (source.app !== 'figma' || !['file-import', 'mcp'].includes(source.method))
    throw new Error('Unsupported external output source.');
  const ref = parseFigmaReference(source.documentUrl);
  if (source.nodeId !== undefined && source.nodeId !== ref.nodeId)
    throw new Error('The source frame does not match its Figma link.');
  return {
    app: 'figma',
    documentUrl: ref.url,
    method: source.method,
    ...(ref.nodeId ? { nodeId: ref.nodeId } : {}),
  };
}
export interface CruxOutput {
  version: 1;
  id: string;
  label: string;
  path: string;
  fingerprint: string;
  mimeType: string;
  size: number;
  created: string;
  externalSource?: ExternalOutputSource;
}
export interface CruxspaceAsset extends CruxOutput {
  sourceCruxId: string;
  sourceTitle: string;
}
export interface AssetOrigin {
  version: 1;
  /** Present when a ZIP bundle was expanded: the relative entries written under `path`. */
  unpacked?: string[];
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
  externalSource?: ExternalOutputSource;
}
/** Output formats a member may advertise: raster images (v1), and since the game Cruxspace, audio and ZIP bundles. */
const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/flac': 'flac',
  'audio/midi': 'mid',
  'model/stl': 'stl',
  'application/x-rawgraphs+json': 'rawgraphs',
  'application/x-moqira+json': 'moq',
  'model/gltf+json': 'gltf',
  'model/gltf-binary': 'glb',
  'application/x-blockbench-model+json': 'bbmodel',
  'model/3mf': '3mf',
  'model/obj': 'obj',
  'application/amf+xml': 'amf',
  'model/x3d+xml': 'x3d',
  'application/dxf': 'dxf',
  'application/zip': 'zip',
  'application/epub+zip': 'epub',
  'font/otf': 'otf',
  'font/ttf': 'ttf',
  'font/woff': 'woff',
  'font/woff2': 'woff2',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/csv': 'csv',
  'application/x-ipynb+json': 'ipynb',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'video/webm': 'webm',
  'video/mp4': 'mp4',
};
const MAX_OUTPUT = 32_000_000;
/** A recording is bigger than a picture: video outputs get their own cap. */
const MAX_VIDEO_OUTPUT = 512_000_000;
const maxFor = (type: string) => (type.startsWith('video/') ? MAX_VIDEO_OUTPUT : MAX_OUTPUT);
const MAX_BUNDLE_ENTRIES = 2000;
const MAX_BUNDLE_BYTES = 64_000_000;
/** The family a destination path must match, and the words the errors use. */
export function outputKind(mimeType: string): 'image' | 'audio' | 'bundle' {
  return mimeType.startsWith('image/')
    ? 'image'
    : mimeType.startsWith('audio/')
      ? 'audio'
      : 'bundle';
}
const KIND_PATTERN = {
  image: /\.(png|jpe?g|gif|webp|svg)$/i,
  audio: /\.(wav|mp3|flac|mid)$/i,
  bundle:
    /\.(zip|epub|otf|ttf|woff|woff2|stl|3mf|obj|amf|x3d|dxf|csv|pptx|ipynb|gltf|glb|bbmodel|rawgraphs|moq)$/i,
};
const KIND_EXAMPLE = {
  image: 'assets/cover.png',
  audio: 'assets/chime.wav',
  bundle: 'assets/game.zip',
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
  externalSource?: ExternalOutputSource,
): Promise<CruxOutput> {
  const source = externalSource ? cleanExternalSource(externalSource) : undefined;
  // The checkpoint runs after the copy's serialization lock is released: the
  // snapshot path itself updates the Working Copy under that lock, so taking
  // it inside would wait on itself forever when a turn snapshot is queued.
  const output = await serializeCopy(owner, async () => {
    await assertCopyWritable(owner);
    await getServices().crux.findById(owner);
    const ext = EXTENSIONS[blob.type];
    if (!ext || !blob.size || blob.size > maxFor(blob.type))
      throw new Error(
        'Choose a PNG, JPEG, WebP, GIF, WAV, MP3, FLAC, ZIP, PDF, DOCX, EPUB or font file (32 MB) or a WebM/MP4 video (512 MB).',
      );
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
      ...(source ? { externalSource: source } : {}),
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
    return output;
  });
  await checkpoint(owner, `Output: ${output.label}`);
  return output;
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
        if (output.externalSource)
          output.externalSource = cleanExternalSource(output.externalSource);
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
        output.size > MAX_OUTPUT ||
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
  /** A file path, or with `unpack` the folder a ZIP bundle is expanded into. */
  path: string;
  unpack?: boolean;
}
export async function assetProvenancePath(path: string) {
  return `cruxspace-assets/${await hashContent(path)}.json`;
}
export async function copyCruxspaceAsset(input: UseCruxspaceAsset) {
  const result = await serializeCopy(input.targetCruxId, async () => {
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
    const kind = outputKind(asset.mimeType);
    const unpack = !!input.unpack;
    if (unpack && kind !== 'bundle') throw new Error('Only a ZIP bundle can be unpacked.');
    if (
      !validPath(input.path) ||
      input.path.startsWith('exports/') ||
      (unpack ? /\.[a-z0-9]+$/i.test(input.path) : !KIND_PATTERN[kind].test(input.path))
    )
      throw new Error(
        unpack
          ? 'Choose a relative folder to unpack into, for example public/game.'
          : `Choose a relative ${kind} path, for example ${KIND_EXAMPLE[kind]}.`,
      );
    const files = await artifact.findByResource('crux', input.targetCruxId);
    const folder = await folderForCrux(input.targetCruxId);
    const taken = async (path: string) => {
      if (files.some((f) => pathOf(f).toLowerCase() === path.toLowerCase())) return true;
      if (!folder) return false;
      try {
        await window.electronAPI!.project.readFile(folder, path);
        return true;
      } catch (error) {
        if (!String(error).includes('ENOENT')) throw error;
        return false;
      }
    };
    if (!unpack && (await taken(input.path)))
      throw new Error('A file already exists at this path. Choose a new path.');
    const source = (await artifact.findByResource('crux', asset.sourceCruxId)).find(
      (f) => pathOf(f) === asset.path,
    );
    if (!source) throw new Error('This output is no longer available.');
    const blob = await artifact.downloadBlob(source.id);
    if ((await hashContent(new Uint8Array(await blob.arrayBuffer()))) !== input.fingerprint)
      throw new Error('The selected output changed. Refresh the assets.');
    // A bundle is expanded into ordinary files under the chosen folder; the
    // sidecar names every entry so the whole set can be traced to one output.
    const entries: { path: string; blob: Blob }[] = [];
    if (unpack) {
      const { default: JSZip } = await import('jszip');
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      let total = 0;
      for (const [name, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const target = `${input.path}/${name.replace(/^\.?\/+/, '')}`;
        if (!validPath(target)) throw new Error(`The bundle contains an unusable path: ${name}`);
        if (entries.length >= MAX_BUNDLE_ENTRIES)
          throw new Error('The bundle has too many files to unpack (2,000 at most).');
        const bytes = await entry.async('uint8array');
        total += bytes.byteLength;
        if (total > MAX_BUNDLE_BYTES) throw new Error('The bundle is too large to unpack (64 MB).');
        if (await taken(target))
          throw new Error(`A file already exists at ${target}. Choose an empty folder.`);
        entries.push({
          path: target,
          blob: new Blob([bytes as BlobPart], { type: guessMimeType(target) }),
        });
      }
      if (!entries.length) throw new Error('The bundle has no files to unpack.');
    }
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
      ...(asset.externalSource ? { externalSource: asset.externalSource } : {}),
      ...(unpack ? { unpacked: entries.map((e) => e.path.slice(input.path.length + 1)) } : {}),
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
    let imported;
    if (unpack) {
      // Text entries become editable text Artifacts (a site can change the game
      // page it received); everything else stays binary.
      const textual = (type: string) =>
        /^text\/|^application\/(javascript|json|xml)|\+xml$|\+json$/.test(type);
      for (const entry of entries)
        imported = textual(entry.blob.type)
          ? await artifact.create({
              resourceId: input.targetCruxId,
              content: await entry.blob.text(),
              meta: { path: entry.path },
            })
          : await artifact.upload({
              resourceId: input.targetCruxId,
              blob: entry.blob,
              mimeType: entry.blob.type,
              meta: { path: entry.path },
            });
    } else
      imported = await artifact.upload({
        resourceId: input.targetCruxId,
        blob,
        mimeType: asset.mimeType,
        meta: { path: input.path },
      });
    return {
      artifact: imported!,
      origin,
      provenancePath,
      entries: entries.map((e) => e.path),
      label: `Used ${asset.label} from ${space.name}`,
    };
  });
  // See saveCruxOutput: checkpoint only after releasing the copy's lock.
  await checkpoint(input.targetCruxId, result.label);
  return result;
}
