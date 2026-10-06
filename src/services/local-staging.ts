import type { Crux, Artifact } from '@/api/types';
import { buildFingerprintMap, validateNotebookPublication } from './publish';
import type { StoreApi } from 'zustand';
import type { CruxState } from '@/stores/cruxStore';
import type { UIState } from '@/stores/uiStore';
import { prepareWorkspacePublication, assertPublicationWorkspace } from './workspace-documents';
import { isEmbeddedApp } from './embedded-app';
import { publicationPlan } from './publication-plan';
import { downloadPublicationBlob } from './publication-files';
import { buildForPublish, preparePublishSources } from './site';
import { assertCopyWritable } from './working-copies';
import { openExternal } from './desktop';

export async function websiteSourceHash(crux: Crux, artifacts: Artifact[]) {
  const fingerprints = Object.entries(buildFingerprintMap(artifacts, crux)).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(fingerprints)),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function stageWebsite(data: StoreApi<CruxState>, ui: StoreApi<UIState>) {
  const id = data.getState().crux?.id;
  const bridge = window.electronAPI?.staging;
  if (!id || !bridge) throw new Error('Local website testing is unavailable.');
  await assertCopyWritable(id);
  const prepared = await prepareWorkspacePublication(data, ui, id);
  const plan = publicationPlan(prepared.crux, prepared.artifacts);
  if (plan.kind === 'unavailable') throw new Error(plan.explanation);
  if (isEmbeddedApp(prepared.crux) && plan.kind !== 'static' && prepared.crux.kind !== 'notes')
    throw new Error(
      'Local testing currently supports websites and declared static editions. Use this tool’s preview for its editable content.',
    );
  if (plan.kind === 'garden-package' || plan.kind === 'tool-package')
    throw new Error('Local testing is for websites, not editable packages.');
  const limit = 100 * 1024 * 1024;
  const files: { path: string; blob: Blob }[] = [];
  let sources = prepared.artifacts;
  if (plan.kind === 'build') {
    sources = structuredClone(await preparePublishSources(id));
    if (prepared.crux.kind === 'notes')
      await validateNotebookPublication(sources, downloadPublicationBlob);
    files.push(...(await buildForPublish(id)));
  } else {
    if (plan.files.length > 5000)
      throw new Error('Local test websites are limited to 5,000 files.');
    let size = 0;
    for (const { file, path } of plan.files) {
      if (path.startsWith('functions/')) continue;
      const blob = await downloadPublicationBlob(file);
      size += blob.size;
      if (size > limit) throw new Error('Local test websites are limited to 100 MB.');
      files.push({ path, blob });
    }
  }
  if (files.length > 5000 || files.reduce((sum, f) => sum + f.blob.size, 0) > limit)
    throw new Error('Local test websites are limited to 5,000 files and 100 MB.');
  const bytes = await Promise.all(
    files
      .filter((file) => !file.path.startsWith('functions/'))
      .map(async (file) => ({
        path: file.path,
        data: new Uint8Array(await file.blob.arrayBuffer()),
      })),
  );
  const sourceHash = await websiteSourceHash(prepared.crux, sources);
  assertPublicationWorkspace(data, ui, id);
  return bridge.publish({
    sourceHash,
    id,
    title: prepared.crux.title || 'Untitled website',
    files: bytes,
  });
}

export async function openLocalTestGarden() {
  const bridge = window.electronAPI?.staging;
  if (!bridge) throw new Error('Local website testing is unavailable.');
  const style = getComputedStyle(document.documentElement);
  const theme = Object.fromEntries(
    [
      '--color-bg',
      '--color-surface',
      '--color-text',
      '--color-text-muted',
      '--color-accent',
      '--color-border',
      '--font-body',
      '--font-display',
      '--font-scale',
      '--radius-lg',
    ].map((key) => [key, style.getPropertyValue(key).trim()]),
  );
  const url = await bridge.openGarden(theme);
  await openExternal(url);
  return url;
}
