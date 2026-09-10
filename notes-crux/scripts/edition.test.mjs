import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readEdition } from './edition.mjs';
function fixture(t) {
  const folder = mkdtempSync(join(tmpdir(), 'notes-edition-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  mkdirSync(join(folder, 'notebook/assets'), { recursive: true });
  const write = (path, content) => writeFileSync(join(folder, 'notebook', path), content);
  write('Public.md', '# Public\n![Drawing](assets/drawing.png)\n[Private](Private.md)');
  write('Private.md', 'SECRET_NOTE_TEXT');
  write('assets/drawing.png', Buffer.from([1, 2, 3]));
  write('assets/private.png', 'SECRET_IMAGE');
  write('publish.json', JSON.stringify({ title: 'Public edition', pages: ['Public.md'] }));
  return { folder, write };
}
test('only selected notes and referenced images enter the public edition', (t) => {
  const { folder } = fixture(t);
  const edition = readEdition(folder);
  assert.equal(edition.pages.length, 1);
  assert.deepEqual(Object.keys(edition.images), ['assets/drawing.png']);
  assert.ok(!JSON.stringify(edition).includes('SECRET'));
});
test('new notebooks cannot accidentally publish all notes', (t) => {
  const { folder, write } = fixture(t);
  write('publish.json', '{"title":"Notebook","pages":[]}');
  assert.throws(() => readEdition(folder), /Select at least one/);
});
test('missing selected pages and escapes stop publication', (t) => {
  const { folder, write } = fixture(t);
  for (const path of ['Missing.md', '../secret.md', 'assets/../Private.md']) {
    write('publish.json', JSON.stringify({ title: 'Notebook', pages: [path] }));
    assert.throws(() => readEdition(folder));
  }
  symlinkSync(join(folder, '..'), join(folder, 'notebook', 'escape'));
  write('publish.json', JSON.stringify({ title: 'Notebook', pages: ['escape/test.md'] }));
  assert.throws(() => readEdition(folder));
});
test('nested notes and reference-style images resolve within the notebook', (t) => {
  const { folder, write } = fixture(t);
  mkdirSync(join(folder, 'notebook/Ideas'));
  write('Ideas/Page.md', '![Sketch][image]\n\n[image]: ../assets/drawing.png');
  write('publish.json', '{"title":"Notebook","pages":["Ideas/Page.md"]}');
  assert.deepEqual(Object.keys(readEdition(folder).images), ['assets/drawing.png']);
});
test('frontmatter stays private even for a selected page', (t) => {
  const { folder, write } = fixture(t);
  write('Public.md', '---\ninternal: PRIVATE_FRONTMATTER\n---\n# Public body');
  assert.equal(readEdition(folder).pages[0].markdown, '# Public body');
  write('Public.md', '---\ninternal: missing closing delimiter');
  assert.throws(() => readEdition(folder), /unclosed frontmatter/);
});
