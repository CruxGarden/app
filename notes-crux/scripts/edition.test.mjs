import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readEdition, buildEdition, splitNote } from './edition.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
function notebook(config) {
  const root = mkdtempSync(join(tmpdir(), 'notes-edition-'));
  mkdirSync(join(root, 'notebook/Research'), { recursive: true });
  mkdirSync(join(root, 'notebook/.assets'), { recursive: true });
  writeFileSync(join(root, 'notebook/publish.json'), JSON.stringify(config));
  writeFileSync(
    join(root, 'notebook/Start.md'),
    '---\nsecret: PRIVATE_FRONTMATTER\n---\n# Start\n\nA quiet place. See [the journal](Research/Field%20journal.md) and [private](Private.md).\n\n![seed](.assets/seed.png)\n',
  );
  writeFileSync(
    join(root, 'notebook/Research/Field journal.md'),
    '# Field journal\n\nSECOND_PAGE_BODY\n',
  );
  writeFileSync(join(root, 'notebook/Private.md'), 'PRIVATE_NOTE_BODY\n');
  writeFileSync(join(root, 'notebook/.assets/seed.png'), png);
  return root;
}
test('splitNote keeps frontmatter out of the body', () => {
  assert.equal(splitNote('---\na: 1\n---\nbody').body, 'body');
  assert.throws(() => splitNote('---\nunclosed'), /unclosed frontmatter/);
});
test('readEdition keeps only selected notes, inlines images and refuses private pages', () => {
  const root = notebook({ title: 'Shared', pages: ['Start.md', 'Research/Field journal.md'] });
  try {
    const edition = readEdition(root);
    assert.equal(edition.pages.length, 2);
    assert.ok(!edition.pages.some((p) => p.markdown.includes('PRIVATE_FRONTMATTER')));
    assert.match(edition.images['.assets/seed.png'], /^data:image\/png;base64,/);
    assert.throws(
      () => readEdition(notebook({ title: 'x', pages: [] })),
      /Select at least one note/,
    );
    assert.throws(
      () => readEdition(notebook({ title: 'x', pages: ['Start.md'], layout: 'grid' })),
      /single-page or separate-pages/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('an empty selection still builds a placeholder edition (a Task verification runs the build)', async () => {
  const root = notebook({ title: 'Draft', pages: [] });
  try {
    const edition = await buildEdition(root);
    assert.equal(edition.pages.length, 0);
    assert.match(readFileSync(join(root, 'dist/index.html'), 'utf8'), /No pages are public yet/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('single-page and separate-pages editions render without private material', async () => {
  const root = notebook({ title: 'Shared', pages: ['Start.md', 'Research/Field journal.md'] });
  try {
    await buildEdition(root);
    const single = readFileSync(join(root, 'dist/index.html'), 'utf8');
    assert.match(single, /aria-label="Search notebook"/);
    assert.match(single, /SECOND_PAGE_BODY/);
    assert.match(single, /href="#Research%2FField%20journal\.md"/);
    assert.match(single, /data:image\/png;base64,/);
    assert.ok(!single.includes('PRIVATE_NOTE_BODY') && !single.includes('PRIVATE_FRONTMATTER'));
    assert.ok(!single.includes('href="Private.md"'));
    writeFileSync(
      join(root, 'notebook/publish.json'),
      JSON.stringify({
        title: 'Shared',
        pages: ['Start.md', 'Research/Field journal.md'],
        layout: 'separate-pages',
      }),
    );
    await buildEdition(root);
    assert.ok(existsSync(join(root, 'dist/notes/Research/Field journal.md/index.html')));
    const separate = readFileSync(join(root, 'dist/notes/Start.md/index.html'), 'utf8');
    assert.match(separate, /href="\/notes\/Research\/Field%20journal\.md\/"/);
    assert.ok(!separate.includes('Search notebook'));
    assert.equal(readFileSync(join(root, 'dist/index.html'), 'utf8'), separate);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// A small ZIP reader for the book: walks the central directory, inflates each entry.
function unzip(bytes) {
  const { inflateRawSync } = require('node:zlib');
  let eocd = bytes.length - 22;
  while (bytes.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  const count = bytes.readUInt16LE(eocd + 10);
  let offset = bytes.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    assert.equal(bytes.readUInt32LE(offset), 0x02014b50);
    const method = bytes.readUInt16LE(offset + 10);
    const csize = bytes.readUInt32LE(offset + 20);
    const nameLen = bytes.readUInt16LE(offset + 28);
    const local = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLen).toString('utf8');
    const dataStart = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const packed = bytes.subarray(dataStart, dataStart + csize);
    entries.push({ name, method, data: method === 0 ? packed : inflateRawSync(packed) });
    offset += 46 + nameLen + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
  }
  return entries;
}
test('buildEdition with format epub writes the book beside the site and links to it', async () => {
  const root = notebook({
    title: 'Shared Journal',
    pages: ['Start.md', 'Research/Field journal.md'],
    format: 'epub',
  });
  try {
    await buildEdition(root);
    const index = readFileSync(join(root, 'dist/index.html'), 'utf8');
    assert.match(index, /href="\/shared-journal\.epub" download/);
    const bytes = readFileSync(join(root, 'dist/shared-journal.epub'));
    // The first entry is the stored mimetype, as EPUB requires.
    assert.equal(bytes.subarray(30, 38).toString(), 'mimetype');
    assert.equal(bytes.subarray(38, 58).toString(), 'application/epub+zip');
    const entries = unzip(bytes);
    const names = entries.map((e) => e.name);
    assert.deepEqual(names.slice(0, 5), [
      'mimetype',
      'META-INF/container.xml',
      'OEBPS/package.opf',
      'OEBPS/nav.xhtml',
      'OEBPS/style.css',
    ]);
    assert.equal(entries[0].method, 0);
    const text = (name) => entries.find((e) => e.name === name).data.toString('utf8');
    assert.match(text('OEBPS/package.opf'), /<dc:title>Shared Journal<\/dc:title>/);
    assert.match(text('OEBPS/package.opf'), /<itemref idref="ch1" \/><itemref idref="ch2" \/>/);
    assert.match(text('OEBPS/nav.xhtml'), /<a href="text\/ch2.xhtml">Field journal<\/a>/);
    const first = text('OEBPS/text/ch1.xhtml');
    assert.match(first, /<h1>Start<\/h1>/);
    assert.match(first, /<a href="ch2.xhtml">the journal<\/a>/);
    assert.match(first, /<a data-private="true">private<\/a>/);
    assert.match(first, /<img src="..\/images\/img1.png" alt="seed" \/>/);
    assert.ok(names.includes('OEBPS/images/img1.png'));
    assert.ok(!first.includes('PRIVATE_FRONTMATTER'));
    assert.ok(!entries.some((e) => e.data.includes('PRIVATE_NOTE_BODY')));
    assert.match(text('OEBPS/text/ch2.xhtml'), /SECOND_PAGE_BODY/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('the web format writes no book and the site has no download link', async () => {
  const root = notebook({ title: 'Shared', pages: ['Start.md'] });
  try {
    await buildEdition(root);
    assert.ok(!existsSync(join(root, 'dist/shared.epub')));
    assert.ok(!readFileSync(join(root, 'dist/index.html'), 'utf8').includes('Download the book'));
    assert.throws(
      () => readEdition(notebook({ title: 'x', pages: ['Start.md'], format: 'pdf' })),
      /web or epub/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
