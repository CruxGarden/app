import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readEdition, buildEdition, splitNote } from './edition.mjs';

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
