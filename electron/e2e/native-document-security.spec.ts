import { test, expect } from '@playwright/test';
import {
  copyFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { launchApp } from './launch';
import { createCrux, enterGarden, storedCrux } from './multi-crux-helpers';

test('document commands refuse executable options and outside paths, then still convert a document', async () => {
  test.setTimeout(120_000);
  const { app, page, dir } = await launchApp();
  try {
    await enterGarden(page);
    const cruxId = await createCrux(page, 'Document boundary');
    const folder = (await storedCrux(page, cruxId)).projectFolder as string;
    const tools = await page.evaluate(() => window.electronAPI!.native.tools());
    test.skip(
      !tools.some((tool) => tool.tool === 'pandoc' && tool.path),
      'Pandoc is not installed',
    );
    const outside = join(dir, 'outside');
    mkdirSync(outside);
    writeFileSync(join(folder, 'document.md'), '# A local document\n\nPreserved text.\n');
    const escapedOutput = join(outside, 'escaped.html');
    const executedFilter = join(outside, 'filter-ran.txt');
    writeFileSync(
      join(folder, 'filter.lua'),
      `local file = assert(io.open(${JSON.stringify(executedFilter)}, "w")); file:write("executed"); file:close(); return {}`,
    );
    writeFileSync(join(outside, 'header.html'), '<p>outside-canary</p>');
    writeFileSync(join(folder, 'defaults.yaml'), `output-file: ${JSON.stringify(escapedOutput)}\n`);
    const attempts = [
      ['document.md', `--output=${escapedOutput}`],
      ['document.md', '--lua-filter=filter.lua', '-o', 'filtered.html'],
      [
        'document.md',
        `--include-in-header=${join(outside, 'header.html')}`,
        '--standalone',
        '-o',
        'included.html',
      ],
      ['document.md', '--defaults=defaults.yaml'],
      ['document.md', '--from=filter.lua', '-o', 'reader.html'],
    ];
    for (const args of attempts) {
      const result = await page.evaluate(
        async ({ cruxId, args }) => {
          try {
            await window.electronAPI!.native.run({ cruxId, tool: 'pandoc', args });
            return 'NOT REFUSED';
          } catch (error) {
            return (error as Error).message;
          }
        },
        { cruxId, args },
      );
      expect.soft(result, args.join(' ')).not.toBe('NOT REFUSED');
    }
    expect.soft(existsSync(escapedOutput)).toBe(false);
    expect.soft(existsSync(executedFilter)).toBe(false);
    const result = await page.evaluate(
      ({ cruxId }) =>
        window.electronAPI!.native.run({
          cruxId,
          tool: 'pandoc',
          args: ['document.md', '--standalone', '--output=exports/document.html'],
        }),
      { cruxId },
    );
    expect(result.code).toBe(0);
    expect(readFileSync(join(folder, 'exports/document.html'), 'utf8')).toContain(
      'Preserved text.',
    );
  } finally {
    await app.close();
  }
});

test('PDF printing refuses source and output symlinks outside the Project Folder', async () => {
  test.setTimeout(120_000);
  const { app, page, dir } = await launchApp();
  try {
    await enterGarden(page);
    const cruxId = await createCrux(page, 'Print boundary');
    const folder = (await storedCrux(page, cruxId)).projectFolder as string;
    const outside = join(dir, 'outside');
    mkdirSync(outside);
    writeFileSync(join(outside, 'private.html'), '<h1>Outside canary</h1>');
    writeFileSync(join(folder, 'document.html'), '<h1>Local document</h1>');
    symlinkSync(join(outside, 'private.html'), join(folder, 'linked.html'));
    symlinkSync(outside, join(folder, 'linked-output'), 'dir');
    for (const options of [
      { path: 'linked.html', out: 'exports/refused.pdf' },
      { path: 'document.html', out: 'linked-output/escaped.pdf' },
    ]) {
      const result = await page.evaluate(
        async ({ cruxId, options }) => {
          try {
            await window.electronAPI!.native.pdf({ cruxId, ...options });
            return 'NOT REFUSED';
          } catch (error) {
            return (error as Error).message;
          }
        },
        { cruxId, options },
      );
      expect.soft(result).not.toBe('NOT REFUSED');
    }
    expect.soft(existsSync(join(outside, 'escaped.pdf'))).toBe(false);
    expect.soft(existsSync(join(folder, 'exports/refused.pdf'))).toBe(false);
    await page.evaluate(
      (cruxId) =>
        window.electronAPI!.native.pdf({
          cruxId,
          path: 'document.html',
          out: 'exports/document.pdf',
        }),
      cruxId,
    );
    expect(readFileSync(join(folder, 'exports/document.pdf')).subarray(0, 5).toString()).toBe(
      '%PDF-',
    );
  } finally {
    await app.close();
  }
});

test('PDF conversion keeps local images, confines Typst includes and preserves a previous PDF on failure', async () => {
  test.setTimeout(120_000);
  const { app, page, dir } = await launchApp();
  try {
    await enterGarden(page);
    const cruxId = await createCrux(page, 'Typeset document');
    const folder = (await storedCrux(page, cruxId)).projectFolder as string;
    const tools = await page.evaluate(() => window.electronAPI!.native.tools());
    test.skip(
      !tools.some((tool) => tool.tool === 'pandoc' && tool.path),
      'Pandoc is not installed',
    );
    const documents = join(folder, 'documents');
    mkdirSync(documents);
    copyFileSync(join(__dirname, '../../public/favicon-32.png'), join(documents, 'figure.png'));
    writeFileSync(
      join(documents, 'brief.md'),
      '# Typeset document\n\n![Local image](figure.png)\n',
    );
    const convert = (source: string, out: string) =>
      page.evaluate(
        ({ cruxId, source, out }) => window.electronAPI!.native.pdf({ cruxId, path: source, out }),
        { cruxId, source, out },
      );
    const made = await convert('documents/brief.md', 'exports/brief.pdf');
    expect(made.engine).toBe(
      tools.some((tool) => tool.tool === 'typst' && tool.path) ? 'typst' : 'browser',
    );
    const previous = readFileSync(join(folder, made.path));
    expect(previous.subarray(0, 5).toString()).toBe('%PDF-');
    if (tools.some((tool) => tool.tool === 'typst' && tool.path)) {
      const secret = join(dir, 'outside-secret.txt');
      writeFileSync(secret, 'outside-typst-canary');
      symlinkSync(secret, join(documents, 'linked.txt'));
      for (const reference of [relative(documents, secret).replace(/\\/g, '/'), 'linked.txt']) {
        writeFileSync(
          join(documents, 'include.md'),
          '```{=typst}\n#read(' + JSON.stringify(reference) + ')\n```\n',
        );
        // The confined typesetter refuses the reference; the JS-free browser
        // fallback can safely print this document without executing Typst.
        expect((await convert('documents/include.md', 'exports/include.pdf')).engine).toBe(
          'browser',
        );
      }
    }
    await expect(convert('documents/missing.md', made.path)).rejects.toThrow();
    expect(readFileSync(join(folder, made.path))).toEqual(previous);
    expect(readdirSync(documents).filter((name) => name.includes('.crux-write-'))).toEqual([]);
  } finally {
    await app.close();
  }
});
