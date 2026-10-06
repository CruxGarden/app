import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { documentFile } from './pandoc-command';
import { resolveInsideOrThrow } from './paths';
import { inTypesetFolder } from './typeset-folder';
import type { NativeResult } from './native-process';
import { runTypstOffline } from './typst-offline';

/** Typst's command surface is deliberately smaller than its unrestricted CLI. */
export function planTypstRun(folder: string, input: unknown): { input: string; output: string } {
  if (
    !Array.isArray(input) ||
    input.length !== 3 ||
    input.some((arg) => typeof arg !== 'string' || arg.length > 8192 || arg.includes('\0')) ||
    input[0] !== 'compile'
  ) {
    throw new Error('Use Typst with: compile source.typ output.pdf.');
  }
  const source = documentFile(folder, input[1]);
  const output = documentFile(folder, input[2]);
  if (!/\.typ$/i.test(source) || !/\.pdf$/i.test(output))
    throw new Error('Choose a .typ source and a .pdf output inside the Project Folder.');
  return { input: source, output };
}

/**
 * Both Make PDF and standalone Typst use this boundary. Typst receives a
 * private copy without symlinks, an app-selected root, and empty package paths.
 * The reviewed compiler adapter separately refuses package downloads.
 */
export async function compileTypstPdf(
  binary: string,
  folder: string,
  input: string,
  output: string,
  timeoutMs = 5 * 60_000,
): Promise<NativeResult> {
  const source = resolveInsideOrThrow(folder, documentFile(folder, input));
  const out = documentFile(folder, output);
  // Validate the destination before starting the expensive conversion, and
  // again when publishing. A failed compilation leaves an existing PDF intact.
  resolveInsideOrThrow(folder, out);
  const info = await fs.stat(source);
  if (!info.isFile() || info.size > 64 * 1024 * 1024)
    throw new Error('Choose a document no larger than 64 MiB.');
  return inTypesetFolder(folder, input, await fs.readFile(source, 'utf8'), async (root, local) => {
    const resultPath = path.join(root, '.result.pdf');
    const packages = path.join(root, '.packages');
    await fs.mkdir(packages);
    const result = await runTypstOffline(
      binary,
      [
        'compile',
        '--root',
        root,
        '--package-path',
        packages,
        '--package-cache-path',
        packages,
        '--',
        local,
        resultPath,
      ],
      root,
      timeoutMs,
    );
    if (result.code !== 0) return result;
    const target = resolveInsideOrThrow(folder, out);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = path.join(path.dirname(target), `.crux-write-${randomUUID()}.pdf`);
    try {
      await fs.copyFile(resultPath, temporary, constants.COPYFILE_EXCL);
      resolveInsideOrThrow(folder, out);
      // Rename replaces a destination symlink/hardlink rather than writing
      // through it, and readers never see a partly copied PDF.
      await fs.rename(temporary, target);
    } finally {
      await fs.rm(temporary, { force: true });
    }
    return result;
  });
}

export async function runTypst(binary: string, folder: string, args: unknown, timeoutMs?: number) {
  const plan = planTypstRun(folder, args);
  return compileTypstPdf(binary, folder, plan.input, plan.output, timeoutMs);
}
