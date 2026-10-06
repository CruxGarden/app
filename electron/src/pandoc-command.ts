import * as path from 'node:path';
import { resolveInsideOrThrow, toPosixRel } from './paths';

/** A file argument is always explicit, contained and unable to become an option. */
export function documentFile(folder: string, value: string): string {
  if (!value || value === '-') throw new Error('Choose a file inside the Project Folder.');
  const absolute = resolveInsideOrThrow(folder, value);
  if (absolute === path.resolve(folder)) throw new Error('Choose a file, not the Project Folder.');
  return `./${toPosixRel(folder, absolute)}`;
}

const switches = new Set([
  '-s',
  '--standalone',
  '--toc',
  '--table-of-contents',
  '-N',
  '--number-sections',
  '--strip-comments',
  '--ascii',
  '--file-scope',
  '--preserve-tabs',
  '--quiet',
]);
// Formats are names, never paths to executable Lua readers/writers.
const formats = new Set([
  'plain',
  'markdown',
  'markdown_strict',
  'markdown_mmd',
  'markdown_phpextra',
  'gfm',
  'commonmark',
  'commonmark_x',
  'html',
  'html4',
  'html5',
  'docx',
  'odt',
  'epub',
  'epub2',
  'epub3',
  'rtf',
  'latex',
  'typst',
  'json',
  'native',
  'rst',
  'org',
  'textile',
  'asciidoc',
  'asciidoctor',
  'opml',
  'fb2',
  'ipynb',
  'mediawiki',
  'revealjs',
  'slidy',
  'dzslides',
  's5',
  'slideous',
  'pptx',
  'beamer',
  'docbook',
  'docbook4',
  'docbook5',
  'jats',
  'tei',
  'texinfo',
  'man',
  'ms',
  'bibtex',
  'biblatex',
  'csljson',
]);
const valueOptions = new Set([
  '-o',
  '--output',
  '-f',
  '--from',
  '-r',
  '--read',
  '-t',
  '--to',
  '-w',
  '--write',
  '-M',
  '--metadata',
  '-V',
  '--variable',
  '--wrap',
  '--columns',
  '--toc-depth',
  '--shift-heading-level-by',
  '--tab-stop',
]);

/**
 * The user/agent command surface: conversion options only. Defaults, filters,
 * custom readers/writers, resource/include paths and PDF engines cannot enter.
 * Pandoc's own sandbox also prevents document include directives reading files
 * that were not explicitly admitted. It does not sandbox filters or PDF engines,
 * which is why those are never exposed here.
 */
export function planPandocRun(
  folder: string,
  input: unknown,
): { args: string[]; outputs: string[] } {
  if (
    !Array.isArray(input) ||
    !input.length ||
    input.length > 128 ||
    input.some((arg) => typeof arg !== 'string' || arg.length > 8192 || arg.includes('\0'))
  ) {
    throw new Error('Give Pandoc a bounded list of text arguments.');
  }
  if (input.length === 1 && ['--help', '-h', '--version', '-v'].includes(input[0])) {
    return { args: input, outputs: [] };
  }
  const args = ['--sandbox'];
  const outputs: string[] = [];
  let inputs = 0;
  let positional = false;
  for (let index = 0; index < input.length; index++) {
    const arg: string = input[index];
    if (arg === '--' && !positional) {
      positional = true;
      continue;
    }
    if (positional || !arg.startsWith('-')) {
      args.push(documentFile(folder, arg));
      inputs++;
      continue;
    }
    const equals = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const option = equals < 0 ? arg : arg.slice(0, equals);
    if (switches.has(option) && equals < 0) {
      args.push(option);
      continue;
    }
    if (!valueOptions.has(option)) throw new Error(`Pandoc option is not allowed: ${option}`);
    let value: string = equals < 0 ? input[++index] : arg.slice(equals + 1);
    if (typeof value !== 'string' || !value) throw new Error(`Give ${option} a value.`);
    if (option === '-o' || option === '--output') {
      if (outputs.length) throw new Error('Choose one Pandoc output file.');
      value = documentFile(folder, value);
      if (/\.pdf$/i.test(value)) throw new Error('Use Make PDF for PDF output.');
      outputs.push(resolveInsideOrThrow(folder, value));
    } else if (['-f', '--from', '-r', '--read', '-t', '--to', '-w', '--write'].includes(option)) {
      if (!/^[a-z0-9_]+(?:[+-][a-z0-9_]+)*$/.test(value) || !formats.has(value.split(/[+-]/)[0]!)) {
        throw new Error('Choose a built-in Pandoc format, not a reader or writer file.');
      }
    } else if (option === '--wrap') {
      if (!['auto', 'none', 'preserve'].includes(value)) throw new Error('Unknown wrapping mode.');
    } else if (
      ['--columns', '--toc-depth', '--shift-heading-level-by', '--tab-stop'].includes(option)
    ) {
      if (!/^-?\d{1,4}$/.test(value)) throw new Error(`Give ${option} a small integer.`);
    }
    args.push(option, value);
  }
  if (!inputs) throw new Error('Choose at least one document inside the Project Folder.');
  return { args, outputs };
}
