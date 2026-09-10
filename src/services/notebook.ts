import { notebookPath, NOTEBOOK_ROOT, isNotebookImage } from './notebook-path';
import { importNotebook } from './notebook-import';
import { isEmbeddedApp, isMoqira, moqiraPath, validateMoqiraFile } from './embedded-app';
import type { StoreApi } from 'zustand';
import type { CruxState } from '@/stores/cruxStore';
import { getServices } from '@/services';
import { pathOf } from '@/lib/artifact-path';
import { flushIngestion } from './ingestion';
import { assertCopyWritable } from './working-copies';
import { folderForCrux } from './project-folder';
import { hashContent, guessMimeType } from './sqlite/helpers';

async function diskFile(owner: string, path: string): Promise<Uint8Array | null | undefined> {
  const folder = await folderForCrux(owner);
  if (!folder) return undefined;
  try {
    return await window.electronAPI!.project.readFile(folder, path);
  } catch (error) {
    if (String(error).includes('ENOENT')) return null;
    throw error;
  }
}

export { notebookPath } from './notebook-path';

/** Serial requests bind to one Working Copy; the caller cannot choose another owner. */
export function notebookSession(workspace: StoreApi<CruxState>) {
  const owner = workspace.getState().crux?.id;
  let tail: Promise<unknown> = Promise.resolve();
  return (request: Record<string, unknown>) => {
    const operation = tail.then(async () => {
      const state = workspace.getState();
      if (!owner || state.crux?.id !== owner || !isEmbeddedApp(state.crux) || state.closing)
        throw new Error('This app is no longer open.');
      // A Site preview can still point at Main when browsing Growth. Never expose a writable bridge there.
      if (state.viewingSnapshotId) throw new Error('Return to the current app to edit.');
      await flushIngestion();
      const { artifact } = getServices();
      if (request.op === 'import' && state.crux?.kind === 'notes') {
        await assertCopyWritable(owner);
        return importNotebook(workspace, request);
      }
      const files = await artifact.findByResource('crux', owner);
      const moqira = isMoqira(state.crux);
      const root = moqira ? 'mockups/' : NOTEBOOK_ROOT;
      const op = request.op;
      if (op === 'list') {
        return files
          .filter((f) => pathOf(f).startsWith(root))
          .map((f) => ({
            path: pathOf(f).slice(root.length),
            fingerprint: f.fingerprint,
          }));
      }
      const path = moqira ? moqiraPath(request.path) : notebookPath(request.path);
      let existing = files.find((f) => pathOf(f) === path);
      if (op === 'read') {
        // Watcher batches are debounced. Reconcile this file before opening it,
        // without ever writing the older Blob Store contents back onto disk.
        const disk = await diskFile(owner, path);
        if (disk === null) throw new Error('This notebook file no longer exists.');
        if (disk && (await hashContent(disk)) !== existing?.fingerprint) {
          if (isNotebookImage(path)) {
            await artifact.upload({
              resourceId: owner,
              blob: new Blob([disk as BlobPart], { type: guessMimeType(path) }),
              meta: { path },
              writeThrough: false,
            });
          } else {
            await artifact.create({
              resourceId: owner,
              content: new TextDecoder().decode(disk),
              meta: { path },
              writeThrough: false,
            });
          }
          existing = (await artifact.findByResource('crux', owner)).find((f) => pathOf(f) === path);
        }
        if (!existing) throw new Error('This notebook file no longer exists.');
        if (isNotebookImage(path)) {
          const blob = await artifact.downloadBlob(existing.id);
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let binary = '';
          for (const byte of bytes) binary += String.fromCharCode(byte);
          return {
            content: `data:${blob.type};base64,${btoa(binary)}`,
            fingerprint: existing.fingerprint,
          };
        }
        return {
          content: await artifact.readContent(existing.id),
          fingerprint: existing.fingerprint,
        };
      }
      if (op !== 'write' && op !== 'delete') throw new Error('Unknown notebook operation.');
      await assertCopyWritable(owner);
      const disk = await diskFile(owner, path);
      const diskFingerprint =
        disk === undefined ? undefined : disk === null ? null : await hashContent(disk);
      if (
        request.expected !== (existing?.fingerprint ?? null) ||
        (diskFingerprint !== undefined && request.expected !== diskFingerprint)
      )
        throw new Error(
          'This file changed elsewhere. Your draft is still here; reload before replacing it.',
        );
      if (op === 'delete') {
        if (!existing || !/\.md$/i.test(path))
          throw new Error('Only an existing note can be deleted.');
        // Preserve a recovery point even for a note changed by an external editor.
        await state.createSnapshot({
          label: 'Before deleting a note',
          ifChanged: true,
          silent: true,
        });
        await artifact.delete(existing.id);
      } else {
        if (typeof request.content !== 'string' || request.content.length > 8_000_000)
          throw new Error('The notebook file is too large.');
        if (isNotebookImage(path)) {
          const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
            request.content,
          );
          if (!match) throw new Error('Choose a PNG, JPEG, GIF or WebP image.');
          const bytes = Uint8Array.from(atob(match[2]!), (c) => c.charCodeAt(0));
          await artifact.upload({
            resourceId: owner,
            blob: new Blob([bytes], { type: match[1] }),
            meta: { path },
          });
        } else {
          if (moqira) validateMoqiraFile(path, request.content);
          if (path === 'notebook/publish.json') {
            const config = JSON.parse(request.content);
            if (
              !config ||
              typeof config.title !== 'string' ||
              !Array.isArray(config.pages) ||
              (config.layout !== undefined &&
                !['single-page', 'separate-pages'].includes(config.layout)) ||
              config.pages.some(
                (p: unknown) => typeof p !== 'string' || !/\.md$/i.test(p) || !notebookPath(p),
              )
            )
              throw new Error('Choose a title and a list of Markdown pages to publish.');
          }
          await artifact.create({ resourceId: owner, content: request.content, meta: { path } });
        }
      }
      await workspace.getState().refreshArtifacts();
      await workspace.getState().createSnapshot({
        label: moqira ? 'Wireframes saved' : op === 'delete' ? 'Deleted a note' : 'Notebook saved',
        ifChanged: true,
        silent: true,
      });
      const saved = (await artifact.findByResource('crux', owner)).find((f) => pathOf(f) === path);
      return { fingerprint: saved?.fingerprint ?? null };
    });
    tail = operation.catch(() => {});
    return operation;
  };
}
