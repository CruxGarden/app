import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { inTypesetFolder } from './typeset-folder';
import { mediaToolPath } from './media-binaries';
import { documentFile } from './pandoc-command';
import { resolveInsideOrThrow, toPosixRel } from './paths';
import { printHtmlToPdf, typstFont, type PrintOptions } from './print-pdf';

const execute = promisify(execFile);

/** Convert first; render second. Document content never chooses an executable. */
export async function exportDocumentPdf(
  folder: string,
  source: string,
  output: string | undefined,
  host: { resources: string | null; userData: string },
  options: PrintOptions = {},
): Promise<{ path: string; bytes: number; engine: 'typst' | 'browser' }> {
  const input = documentFile(folder, source);
  const sourcePath = resolveInsideOrThrow(folder, input);
  const name = path.basename(sourcePath, path.extname(sourcePath));
  const out = documentFile(folder, output ?? `exports/${name}.pdf`);
  if (!/\.pdf$/i.test(out)) throw new Error('Choose a .pdf output file.');
  const target = resolveInsideOrThrow(folder, out);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  // A private, ignored temporary beside the source preserves relative image
  // paths. The watcher and preview already exclude *.crux-write-* files.
  const temporary = (extension: string) =>
    resolveInsideOrThrow(
      folder,
      path.posix.join(
        toPosixRel(folder, path.dirname(sourcePath)),
        `.crux-write-${randomUUID()}.${extension}`,
      ),
    );
  const intermediates: string[] = [];
  const createIntermediate = (extension: string) => {
    const file = temporary(extension);
    fs.closeSync(fs.openSync(file, 'wx'));
    intermediates.push(file);
    return documentFile(folder, toPosixRel(folder, file));
  };
  const runOptions = { cwd: folder, timeout: 5 * 60_000, maxBuffer: 2 * 1024 * 1024 };
  try {
    const pdf = createIntermediate('pdf');
    const result = (engine: 'typst' | 'browser') => {
      // Publish only a completed file; a declined conversion preserves an
      // existing PDF. Check containment again after the asynchronous render.
      resolveInsideOrThrow(folder, out);
      fs.renameSync(resolveInsideOrThrow(folder, pdf), target);
      return { path: toPosixRel(folder, target), bytes: fs.statSync(target).size, engine };
    };
    if (/\.html?$/i.test(input)) {
      await printHtmlToPdf(folder, input, pdf, options);
      return result('browser');
    }
    const pandoc = await mediaToolPath('pandoc', host.resources, host.userData);
    if (!pandoc) throw new Error('Pandoc is needed to convert this document, and it is missing.');
    const typst = await mediaToolPath('typst', host.resources, host.userData);
    if (typst) {
      const typeset = createIntermediate('typ');
      const font = await typstFont(typst);
      try {
        await execute(
          pandoc,
          [
            '--sandbox',
            '--standalone',
            '-t',
            'typst',
            ...(font ? ['-V', `mainfont=${font}`] : []),
            input,
            '-o',
            typeset,
          ],
          runOptions,
        );
        await inTypesetFolder(
          folder,
          typeset,
          fs.readFileSync(resolveInsideOrThrow(folder, typeset), 'utf8'),
          async (root, isolatedInput) => {
            const isolatedOutput = path.join(root, '.result.pdf');
            const packages = path.join(root, '.packages');
            fs.mkdirSync(packages);
            await execute(
              typst,
              [
                'compile',
                '--root',
                root,
                '--package-path',
                packages,
                '--package-cache-path',
                packages,
                '--',
                isolatedInput,
                isolatedOutput,
              ],
              { ...runOptions, cwd: root },
            );
            resolveInsideOrThrow(folder, pdf);
            fs.copyFileSync(isolatedOutput, resolveInsideOrThrow(folder, pdf));
          },
        );
        return result('typst');
      } catch {
        // An unavailable font or unsupported Typst document can still be printed.
        // The browser path retains its own filesystem/network restrictions.
      }
    }
    const html = createIntermediate('html');
    await execute(
      pandoc,
      ['--sandbox', '--standalone', '-t', 'html5', input, '-o', html],
      runOptions,
    );
    await printHtmlToPdf(folder, html, pdf, options);
    return result('browser');
  } finally {
    for (const file of intermediates) fs.rmSync(file, { force: true });
  }
}
