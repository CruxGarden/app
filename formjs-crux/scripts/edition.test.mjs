import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildEdition } from './edition.mjs';

const here = dirname(fileURLToPath(import.meta.url));
test('the edition carries the viewer, the schema and the store client', () => {
  const folder = mkdtempSync(join(tmpdir(), 'formjs-edition-'));
  try {
    mkdirSync(join(folder, 'data'), { recursive: true });
    mkdirSync(join(folder, 'vendor/flatpickr'), { recursive: true });
    for (const f of ['form-viewer.umd.js', 'form-js.css', 'LICENSE']) writeFileSync(join(folder, 'vendor', f), readFileSync(join(here, '../vendor', f)));
    writeFileSync(join(folder, 'vendor/flatpickr/light.css'), '');
    writeFileSync(join(folder, 'data/project.json'), JSON.stringify({ version: 1, app: 'formjs', project: { name: 'RSVP <3', schema: { type: 'default', components: [{ type: 'textfield', key: 'name', label: 'Name' }, { type: 'text', text: 'hi' }] }, saved: 'x' } }));
    const built = buildEdition(folder);
    assert.deepEqual(built, { name: 'RSVP <3', fields: 1 });
    const html = readFileSync(join(folder, 'dist/index.html'), 'utf8');
    assert.match(html, /<title>RSVP &lt;3<\/title>/);
    assert.match(html, /vendor\/form-viewer\.umd\.js/);
    assert.ok(existsSync(join(folder, 'dist/vendor/form-viewer.umd.js')));
    assert.equal(JSON.parse(readFileSync(join(folder, 'dist/form.json'), 'utf8')).components.length, 2);
    assert.match(readFileSync(join(folder, 'dist/viewer.js'), 'utf8'), /crux:store:set/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
