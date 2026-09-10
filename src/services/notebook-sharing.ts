import type { StoreApi } from 'zustand';
import type { CruxState } from '@/stores/cruxStore';
import { getServices } from './index';
import { pathOf } from '@/lib/artifact-path';
import { notebookSession } from './notebook';
import { flushNotebook } from './notebook-lifecycle';

export type NotebookLayout = 'single-page' | 'separate-pages';
export const NOTEBOOK_PAGE_ROUTE = 'src/pages/notes/[...note].astro';

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
