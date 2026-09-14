import { importNativeAsset, readNativeAsset, validateNativeDocument } from './native-app-document';
import { notebookPath, isNotebookImage } from './notebook-path';
import { importNotebook } from './notebook-import';
import {
  isEmbeddedApp,
  nativeAppType,
  isMoqira,
  isCardinal,
  samplerType,
  samplerPath,
  validateSamplerFile,
  embeddedContentRoot,
  cardinalPath,
  validateCardinalFile,
  moqiraPath,
  validateMoqiraFile,
} from './embedded-app';
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
      const nativeApp = nativeAppType(state.crux);
      const native = nativeApp !== null;
      if (native && request.op === 'native-import') {
        await assertCopyWritable(owner);
        return importNativeAsset(owner, request.bytes, request.mimeType);
      }
      if (native && request.op === 'native-read') return readNativeAsset(owner, request.path);
      if (request.op === 'save-output') {
        // An embedded app advertises a finished output: a data URL, or raw bytes with a type.
        if (typeof request.label !== 'string') throw new Error('Name the output.');
        let blob: Blob;
        if (request.bytes instanceof ArrayBuffer) {
          if (
            typeof request.mimeType !== 'string' ||
            request.bytes.byteLength >
              (request.mimeType.startsWith('video/') ? 512_000_000 : 32_000_000)
          )
            throw new Error(
              'Use a supported image, audio, model, document, font or ZIP output up to 32 MB, or a video up to 512 MB.',
            );
          blob = new Blob([request.bytes], { type: request.mimeType });
        } else {
          if (typeof request.content !== 'string' || request.content.length > 44_000_000)
            throw new Error('Choose an output and a name.');
          const match = request.content.match(
            /^data:(image\/(?:png|jpeg|webp|gif|svg\+xml)|audio\/(?:wav|x-wav|mpeg)|application\/zip);base64,([A-Za-z0-9+/=]+)$/,
          );
          if (!match) throw new Error('Use a PNG, JPEG, WebP, GIF, SVG, WAV, MP3 or ZIP output.');
          blob = new Blob([Uint8Array.from(atob(match[2]!), (c) => c.charCodeAt(0))], {
            type: match[1],
          });
        }
        const { saveCruxOutput } = await import('./cruxspace-assets');
        const result = await saveCruxOutput(owner, blob, request.label);
        await workspace.getState().refreshArtifacts();
        return result;
      }
      if (native && request.op === 'read-file') {
        // A native app may consume ordinary files of its own Crux (for example
        // an image or sound copied in from a Cruxspace), never its record store.
        const path = typeof request.path === 'string' ? request.path : '';
        if (
          path.length > 240 ||
          path.split('/').some((p) => !p || p === '.' || p === '..' || p.startsWith('.')) ||
          !/^[\w /.-]+$/.test(path) ||
          path.startsWith('data/') ||
          !/\.(png|jpe?g|gif|webp|wav|mp3|zip|json|svg)$/i.test(path)
        )
          throw new Error('Choose a relative image, sound, bundle or JSON file in this Crux.');
        const disk = await diskFile(owner, path);
        if (disk === null) throw new Error('This file no longer exists.');
        let file = (await artifact.findByResource('crux', owner)).find((f) => pathOf(f) === path);
        if (disk && (await hashContent(disk)) !== file?.fingerprint) {
          await artifact.upload({
            resourceId: owner,
            blob: new Blob([disk as BlobPart], { type: guessMimeType(path) }),
            meta: { path },
            writeThrough: false,
          });
          file = (await artifact.findByResource('crux', owner)).find((f) => pathOf(f) === path);
        }
        if (!file) throw new Error('This file no longer exists.');
        if ((file.size ?? 0) > 32_000_000)
          throw new Error('This file is too large to use (32 MB).');
        const blob = await artifact.downloadBlob(file.id);
        return {
          bytes: await blob.arrayBuffer(),
          mimeType: blob.type || guessMimeType(path),
          fingerprint: file.fingerprint,
        };
      }
      if (request.op === 'build-book' && state.crux?.kind === 'notes') {
        // The book edition: the same build Share runs, and its EPUB kept as an output.
        await assertCopyWritable(owner);
        const manifest = (await artifact.findByResource('crux', owner)).find(
          (f) => pathOf(f) === 'notebook/publish.json',
        );
        if (!manifest) throw new Error('The notebook publication settings are missing.');
        const config = JSON.parse(await artifact.readContent(manifest.id));
        if (config.format !== 'epub')
          throw new Error(
            'Choose “Web pages and an EPUB book” under Notebook sharing settings before saving the book.',
          );
        if (!Array.isArray(config.pages) || !config.pages.length)
          throw new Error('Select at least one note with “Include in public edition” first.');
        const { buildForPublish } = await import('./site');
        const built = await buildForPublish(owner);
        const book = built.find((file) => /\.epub$/i.test(file.path));
        if (!book) throw new Error('The edition build produced no book.');
        const { saveCruxOutput } = await import('./cruxspace-assets');
        const label = `${typeof config.title === 'string' && config.title.trim() ? config.title.trim() : 'Notebook'} (EPUB)`;
        const result = await saveCruxOutput(
          owner,
          new Blob([await book.blob.arrayBuffer()], { type: 'application/epub+zip' }),
          label.slice(0, 120),
        );
        await workspace.getState().refreshArtifacts();
        return result;
      }
      if (request.op === 'read-bytes' && state.crux?.kind === 'notes') {
        // A document a person put in the Crux (a .docx beside the notebook) for Tigrana to import.
        const path = typeof request.path === 'string' ? request.path : '';
        if (
          path.length > 240 ||
          path.split('/').some((p) => !p || p === '.' || p === '..' || p.startsWith('.')) ||
          !/^[\w /.()-]+$/.test(path) ||
          !/\.docx$/i.test(path)
        )
          throw new Error('Choose a relative .docx file in this Crux.');
        const disk = await diskFile(owner, path);
        if (!disk) throw new Error('This document does not exist in the Crux.');
        if (disk.byteLength > 32_000_000) throw new Error('This document is too large (32 MB).');
        return { bytes: disk.buffer.slice(disk.byteOffset, disk.byteOffset + disk.byteLength) };
      }
      if (request.op === 'import' && state.crux?.kind === 'notes') {
        await assertCopyWritable(owner);
        return importNotebook(workspace, request);
      }
      const files = await artifact.findByResource('crux', owner);
      const moqira = isMoqira(state.crux);
      const cardinal = isCardinal(state.crux);
      const sampler = samplerType(state.crux);
      const root = embeddedContentRoot(state.crux);
      const op = request.op;
      if (op === 'list') {
        return files
          .filter((f) => pathOf(f).startsWith(root))
          .map((f) => ({
            path: pathOf(f).slice(root.length),
            fingerprint: f.fingerprint,
          }));
      }
      if (native && request.path !== 'project.json')
        throw new Error('This app can access only its project document and imported assets.');
      const path = native
        ? 'data/project.json'
        : sampler
          ? samplerPath(sampler, request.path)
          : cardinal
            ? cardinalPath(request.path)
            : moqira
              ? moqiraPath(request.path)
              : notebookPath(request.path);
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
      let writtenFingerprint: string | null = null;
      if (op === 'delete') {
        // Notes, Tigrana folder sidecars and notebook images; never publication settings or metadata.
        if (
          !existing ||
          !(/\.md$/i.test(path) || /\/\.tigrana\/folder\.json$/.test(path) || isNotebookImage(path))
        )
          throw new Error('Only an existing note, folder marker or image can be deleted.');
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
          writtenFingerprint = await hashContent(bytes);
          if (sampler) {
            const digest = writtenFingerprint;
            if (
              bytes.length > 4_000_000 ||
              path !==
                `data/assets/${digest}.${{ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[match[1]!]}`
            )
              throw new Error(
                'Imported images must keep their original bytes and content fingerprint.',
              );
          }
          await artifact.upload({
            resourceId: owner,
            blob: new Blob([bytes], { type: match[1] }),
            meta: { path },
          });
        } else {
          if (native) await validateNativeDocument(owner, request.content, nativeApp);
          if (moqira) validateMoqiraFile(path, request.content);
          if (cardinal) validateCardinalFile(request.content);
          if (sampler) validateSamplerFile(sampler, request.content);
          if (path === 'notebook/publish.json') {
            const config = JSON.parse(request.content);
            if (
              !config ||
              typeof config.title !== 'string' ||
              !Array.isArray(config.pages) ||
              (config.layout !== undefined &&
                !['single-page', 'separate-pages'].includes(config.layout)) ||
              (config.format !== undefined && !['web', 'epub'].includes(config.format)) ||
              config.pages.some(
                (p: unknown) => typeof p !== 'string' || !/\.md$/i.test(p) || !notebookPath(p),
              )
            )
              throw new Error('Choose a title and a list of Markdown pages to publish.');
          }
          writtenFingerprint = await hashContent(request.content);
          await artifact.create({ resourceId: owner, content: request.content, meta: { path } });
        }
      }
      await workspace.getState().refreshArtifacts();
      await workspace.getState().createSnapshot({
        label:
          sampler || native
            ? 'Project saved'
            : cardinal
              ? 'Instrument saved'
              : moqira
                ? 'Wireframes saved'
                : op === 'delete'
                  ? 'Deleted a note'
                  : 'Notebook saved',
        ifChanged: true,
        silent: true,
      });
      // A watcher can ingest another writer during refresh/snapshot. Acknowledge
      // our bytes, never that newer version: the next save must detect its conflict.
      return { fingerprint: writtenFingerprint };
    });
    tail = operation.catch(() => {});
    return operation;
  };
}
