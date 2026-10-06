import { test, expect } from '@playwright/test';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm, stat, truncate } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { planPandocRun } from '../src/pandoc-command';
import { inTypesetFolder } from '../src/typeset-folder';

test('document commands refuse executable options, unsafe paths and sandbox overrides', async () => {
  const root = await mkdtemp(join(tmpdir(), 'crux-document-policy-'));
  const folder = join(root, 'project');
  await mkdir(folder);
  await symlink(root, join(folder, 'outside'), 'dir');
  try {
    for (const option of [
      '--filter',
      '--lua-filter',
      '--defaults',
      '--data-dir',
      '--resource-path',
      '--include-in-header',
      '--extract-media',
      '--pdf-engine',
      '--metadata-file',
      '--sandbox',
    ]) {
      for (const args of [
        ['source.md', `${option}=outside`],
        ['source.md', option, 'outside'],
      ]) {
        expect(() => planPandocRun(folder, args)).toThrow();
      }
    }
    for (const output of [
      join(root, 'escape.html'),
      '../escape.html',
      'outside/escape.html',
      'C:\\escape.html',
      'document.pdf',
    ]) {
      expect(() => planPandocRun(folder, ['source.md', `--output=${output}`])).toThrow();
    }
    expect(() => planPandocRun(folder, ['source.md', '--from=reader.lua'])).toThrow();
    expect(() => planPandocRun(folder, ['source.md', '--to=writer.lua'])).toThrow();
    expect(() => planPandocRun(folder, ['https://example.test/source.md'])).toThrow();
    // A name beginning with '-' remains a filename, and equals output syntax
    // receives the same containment checks as a separate output argument.
    const plan = planPandocRun(folder, ['--output=exports/doc.html', '--', '--source.md']);
    expect(plan.args).toContain('./--source.md');
    expect(plan.outputs).toEqual([join(folder, 'exports/doc.html')]);
    expect(plan.args[0]).toBe('--sandbox');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('typesetting copies local assets without private files or links and always releases its scratch folder', async () => {
  const root = await mkdtemp(join(tmpdir(), 'crux-document-copy-'));
  const folder = join(root, 'project');
  await mkdir(join(folder, 'docs'), { recursive: true });
  await mkdir(join(folder, '.crux'));
  await writeFile(join(root, 'outside.txt'), 'outside');
  await writeFile(join(folder, '.crux', 'token'), 'private');
  await writeFile(join(folder, '.env'), 'private');
  await writeFile(join(folder, 'docs', 'image.png'), 'image bytes');
  await symlink(join(root, 'outside.txt'), join(folder, 'docs', 'link.txt'));
  let scratch = '';
  try {
    await expect(
      inTypesetFolder(folder, 'docs/main.typ', '#image("image.png")', async (copy, input) => {
        scratch = copy;
        expect(await readFile(input, 'utf8')).toContain('image.png');
        expect(await readFile(join(copy, 'docs', 'image.png'), 'utf8')).toBe('image bytes');
        for (const name of ['.crux/token', '.env', 'docs/link.txt'])
          await expect(stat(join(copy, name))).rejects.toThrow();
        await writeFile(join(folder, 'docs', 'image.png'), 'new bytes');
        expect(await readFile(join(copy, 'docs', 'image.png'), 'utf8')).toBe('image bytes');
        throw new Error('render declined');
      }),
    ).rejects.toThrow('render declined');
    await expect(stat(scratch)).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('typesetting refuses a project above its copy budget before invoking the compiler', async () => {
  const root = await mkdtemp(join(tmpdir(), 'crux-document-limit-'));
  try {
    const large = join(root, 'large.bin');
    await writeFile(large, '');
    await truncate(large, 65 * 1024 * 1024);
    let invoked = false;
    await expect(
      inTypesetFolder(root, 'main.typ', 'hello', async () => {
        invoked = true;
      }),
    ).rejects.toThrow('too large');
    expect(invoked).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
