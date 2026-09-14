import type { StoreApi } from 'zustand';
import type { CruxState } from '@/stores/cruxStore';
import { getServices } from './index';
import { pathOf } from '@/lib/artifact-path';
import { notebookSession } from './notebook';
import { flushNotebook } from './notebook-lifecycle';

export type NotebookLayout = 'single-page' | 'separate-pages';
export type NotebookFormat = 'web' | 'epub';
/** The edition renderer that understands both layouts (older Notes Cruxes carried an Astro route). */
export const NOTEBOOK_PAGE_ROUTE = 'scripts/edition.mjs';

/** Change only layout, retaining selection and app-defined publication fields. */
export async function setNotebookLayout(workspace: StoreApi<CruxState>, layout: NotebookLayout) {
  const owner = workspace.getState().crux;
  if (owner?.kind !== 'notes') throw new Error('Open a Notes Crux to change its public layout.');
  if (!['single-page', 'separate-pages'].includes(layout))
    throw new Error('Choose a supported notebook layout.');
  const call = notebookSession(workspace);
  await flushNotebook(owner.id);
  const files = await getServices().artifact.findByResource('crux', owner.id);
  if (!files.some((file) => pathOf(file) === NOTEBOOK_PAGE_ROUTE))
    throw new Error('This notebook needs an updated public reader to choose its layout.');
  const current = (await call({ op: 'read', path: 'publish.json' })) as {
    content: string;
    fingerprint: string;
  };
  const config = JSON.parse(current.content);
  await call({
    op: 'write',
    path: 'publish.json',
    content: JSON.stringify({ ...config, layout }, null, 2),
    expected: current.fingerprint,
  });
}

/** Change only the format (web pages, or web pages and an EPUB book), retaining everything else. */
export async function setNotebookFormat(workspace: StoreApi<CruxState>, format: NotebookFormat) {
  const owner = workspace.getState().crux;
  if (owner?.kind !== 'notes') throw new Error('Open a Notes Crux to change its public format.');
  if (!['web', 'epub'].includes(format)) throw new Error('Choose a supported notebook format.');
  const call = notebookSession(workspace);
  await flushNotebook(owner.id);
  const files = await getServices().artifact.findByResource('crux', owner.id);
  if (!files.some((file) => pathOf(file) === NOTEBOOK_PAGE_ROUTE))
    throw new Error('This notebook needs an updated public reader to offer a book.');
  const current = (await call({ op: 'read', path: 'publish.json' })) as {
    content: string;
    fingerprint: string;
  };
  const config = JSON.parse(current.content);
  if (format === 'web') delete config.format;
  else config.format = format;
  await call({
    op: 'write',
    path: 'publish.json',
    content: JSON.stringify(config, null, 2),
    expected: current.fingerprint,
  });
}
