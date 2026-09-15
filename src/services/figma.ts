import { getServices } from './index';
import { pathOf } from '@/lib/artifact-path';
import { assertCopyWritable, serializeCopy } from './working-copies';
import { growthHostFor } from './growth';
import { flushIngestion } from './ingestion';
import { saveCruxOutput } from './cruxspace-assets';
import { parseFigmaReference } from '../../electron/src/figma-reference';

export const FIGMA_PROJECT_PATH = 'figma/project.json';
export async function readFigmaProject(owner: string) {
  const { crux, artifact } = getServices();
  if ((await crux.findById(owner)).meta?.template !== 'figma')
    throw new Error('Open a Figma Crux first.');
  const file = (await artifact.findByResource('crux', owner)).find(
    (f) => pathOf(f) === FIGMA_PROJECT_PATH,
  );
  if (!file)
    throw new Error('The Figma reference file is missing. Restore figma/project.json from Growth.');
  if (!file.fingerprint) throw new Error('The Figma reference has no saved content.');
  const data = JSON.parse(await artifact.readContent(file.id));
  if (
    data.version !== 1 ||
    data.app !== 'figma' ||
    !(data.documentUrl === null || typeof data.documentUrl === 'string')
  )
    throw new Error('The Figma reference file is invalid. Check figma/project.json.');
  return {
    fingerprint: file.fingerprint,
    reference: data.documentUrl ? parseFigmaReference(data.documentUrl) : null,
  };
}

export async function saveFigmaReference(owner: string, url: string, expected: string | null) {
  const reference = parseFigmaReference(url);
  await flushIngestion();
  await serializeCopy(owner, async () => {
    await assertCopyWritable(owner);
    const current = await readFigmaProject(owner);
    if (current.fingerprint !== expected)
      throw new Error('The Figma link changed. Reload it before saving.');
    await getServices().artifact.create({
      resourceId: owner,
      content: JSON.stringify({ version: 1, app: 'figma', documentUrl: reference.url }, null, 2),
      meta: { path: FIGMA_PROJECT_PATH },
    });
  });
  await (
    await growthHostFor(owner)
  ).snapshot({ label: 'Linked Figma document', requestedBy: 'person' });
  return readFigmaProject(owner);
}

/** File import is explicitly attributed; a saved link alone cannot prove MCP editing. */
export async function importFigmaExport(
  owner: string,
  file: Blob,
  label: string,
  expectedUrl: string,
) {
  if (
    !['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf'].includes(
      file.type,
    )
  )
    throw new Error('Choose a PNG, JPEG, WebP, SVG or PDF exported from Figma.');
  await flushIngestion();
  const { reference } = await readFigmaProject(owner);
  if (!reference || reference.url !== parseFigmaReference(expectedUrl).url)
    throw new Error('The Figma link changed. Reload it before importing the export.');
  return saveCruxOutput(owner, file, label, {
    app: 'figma',
    documentUrl: reference.url,
    ...(reference.nodeId ? { nodeId: reference.nodeId } : {}),
    method: 'file-import',
  });
}
