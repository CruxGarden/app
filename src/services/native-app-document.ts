import { validateProject as validateAudioMass } from '../../audiomass-crux/src/garden/model.js';
import { validateProject as validateMiniPaint } from '../../minipaint-crux/garden/model.js';
import { getServices } from './index';
import { hashContent } from './sqlite/helpers';
import { folderForCrux } from './project-folder';
import { pathOf } from '@/lib/artifact-path';

export const OPENMOSH_STORES: Record<string, string[]> = {
  'openmosh-sequence-media': ['media', 'pools', 'sessions', 'timelines'],
  'openmosh-tracks': ['tracks'],
  'openmosh-fonts': ['fonts'],
};
export function nativeAssetPath(value: unknown): string {
  if (typeof value !== 'string' || !/^assets\/[a-f0-9]{64}\.bin$/.test(value))
    throw new Error('Choose an imported asset from this app.');
  return 'data/' + value;
}
async function verifyOriginal(owner: string, path: string, fingerprint: string) {
  const folder = await folderForCrux(owner);
  if (!folder) return;
  const bytes = await window.electronAPI!.project.readFile(folder, path);
  if ((await hashContent(bytes)) !== fingerprint)
    throw new Error(
      'The original media changed on disk. Restore its original bytes before continuing.',
    );
}
export async function importNativeAsset(owner: string, bytes: unknown, mimeType: unknown) {
  if (!(bytes instanceof ArrayBuffer) || !bytes.byteLength || bytes.byteLength > 128_000_000)
    throw new Error('Choose a media or font file up to 128 MB.');
  if (
    typeof mimeType !== 'string' ||
    mimeType.length > 100 ||
    !/^(image|video|audio|font|application)\/[a-zA-Z0-9.+-]+$/.test(mimeType)
  )
    throw new Error('Choose a valid media or font type.');
  const fingerprint = await hashContent(new Uint8Array(bytes));
  const path = `assets/${fingerprint}.bin`;
  const service = getServices().artifact;
  const existing = (await service.findByResource('crux', owner)).find(
    (f) => pathOf(f) === 'data/' + path,
  );
  if (existing && existing.fingerprint !== fingerprint)
    throw new Error('The original asset changed on disk. Reload the saved project.');
  if (existing) await verifyOriginal(owner, 'data/' + path, fingerprint);
  if (!existing)
    await service.upload({
      resourceId: owner,
      blob: new Blob([bytes], { type: mimeType }),
      mimeType,
      meta: { path: 'data/' + path },
    });
  return { path, fingerprint };
}
export async function readNativeAsset(owner: string, path: unknown) {
  const full = nativeAssetPath(path);
  const service = getServices().artifact;
  const existing = (await service.findByResource('crux', owner)).find((f) => pathOf(f) === full);
  if (!existing || existing.fingerprint !== full.slice(12, -4))
    throw new Error('The saved media is missing or has changed.');
  await verifyOriginal(owner, full, existing.fingerprint);
  const blob = await service.downloadBlob(existing.id);
  return {
    bytes: await blob.arrayBuffer(),
    mimeType: blob.type,
    fingerprint: existing.fingerprint,
  };
}
export async function validateNativeDocument(
  owner: string,
  content: string,
  app: 'openmosh' | 'minipaint' | 'audiomass' = 'openmosh',
) {
  if (content.length > 4_000_000) throw new Error('The native project metadata is too large.');
  const doc = JSON.parse(content);
  if (app === 'audiomass') validateAudioMass(doc);
  else if (app === 'minipaint') validateMiniPaint(doc);
  else {
    if (
      !doc ||
      doc.version !== 1 ||
      doc.app !== 'openmosh' ||
      !doc.local ||
      !doc.databases ||
      typeof doc.local !== 'object' ||
      typeof doc.databases !== 'object' ||
      Array.isArray(doc.local) ||
      Array.isArray(doc.databases)
    )
      throw new Error('Choose an OpenMosh project document.');
    for (const [key, value] of Object.entries(doc.local)) {
      if (!key.startsWith('openmosh') || typeof value !== 'string')
        throw new Error('Invalid OpenMosh settings.');
    }
    for (const [db, stores] of Object.entries(doc.databases)) {
      if (
        !Object.hasOwn(OPENMOSH_STORES, db) ||
        !stores ||
        typeof stores !== 'object' ||
        Array.isArray(stores)
      )
        throw new Error('Invalid OpenMosh storage.');
      for (const [store, rows] of Object.entries(stores)) {
        if (!OPENMOSH_STORES[db]!.includes(store) || !Array.isArray(rows) || rows.length > 10000)
          throw new Error('Invalid OpenMosh records.');
      }
    }
  }
  const files = new Map(
    (await getServices().artifact.findByResource('crux', owner)).map((f) => [pathOf(f), f]),
  );
  function visit(value: unknown, depth = 0) {
    if (depth > 80) throw new Error('The project is nested too deeply.');
    if (!value || typeof value !== 'object') return;
    if ('__cruxBinary' in value) {
      const ref = value.__cruxBinary as { path: string; kind: string; type: string; size: number };
      if (
        !ref ||
        !['blob', 'buffer', 'file'].includes(ref.kind) ||
        typeof ref.type !== 'string' ||
        !Number.isSafeInteger(ref.size)
      )
        throw new Error('Invalid media reference.');
      const path = nativeAssetPath(ref.path);
      const file = files.get(path);
      if (!file || file.fingerprint !== ref.path.slice(7, -4) || file.size !== ref.size)
        throw new Error('Import the original media before saving the project.');
      return;
    }
    for (const child of Object.values(value)) visit(child, depth + 1);
  }
  visit(app === 'openmosh' ? doc.databases : doc.project);
  // The caller flushes watcher ingestion first. Validate Blob Store references
  // without rereading every video on each slider edit; import/read verify disk bytes.
}
