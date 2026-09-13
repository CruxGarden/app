import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateProject } from './document.js';
const ref = (size) => ({
  __cruxBinary: {
    path: 'assets/' + 'c'.repeat(64) + '.bin',
    kind: 'buffer',
    type: 'application/pdf',
    size,
  },
});
const entry = (over = {}) => ({
  id: 'a1b2c3d4',
  name: 'sample.pdf',
  type: 'application/pdf',
  size: 1109,
  pages: 2,
  source: 'upload',
  tool: 'rotate-pdf',
  created: '2026-09-13T00:00:00.000Z',
  file: ref(1109),
  ...over,
});
const doc = (documents, name = 'PDF work') => ({
  version: 1,
  app: 'bentopdf',
  project: { name, documents },
});
test('accepts an empty project and listed documents', () => {
  validateProject(doc([]));
  validateProject(
    doc([
      entry(),
      entry({ source: 'tool', name: 'sample-rotated.pdf' }),
      entry({ source: 'agent', pages: null }),
    ])
  );
});
test('rejects other apps, bad entries and bad references', () => {
  assert.throws(() =>
    validateProject({
      version: 1,
      app: 'pptist',
      project: { name: 'x', documents: [] },
    })
  );
  assert.throws(() => validateProject(doc([], '')), /project name/);
  assert.throws(
    () => validateProject(doc([entry({ extra: 1 })])),
    /document entry/
  );
  assert.throws(
    () => validateProject(doc([entry({ source: 'download' })])),
    /source/
  );
  assert.throws(
    () => validateProject(doc([entry({ file: ref(5) })])),
    /file reference/
  );
  assert.throws(
    () =>
      validateProject(
        doc([
          entry({
            file: {
              __cruxBinary: {
                path: 'x.pdf',
                kind: 'buffer',
                type: 'application/pdf',
                size: 1109,
              },
            },
          }),
        ])
      ),
    /file reference/
  );
  assert.throws(
    () => validateProject(doc([entry({ pages: 1.5 })])),
    /page count/
  );
});
