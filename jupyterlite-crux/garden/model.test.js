import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateProject } from './model.js';
const ref = {
  __cruxBinary: {
    kind: 'buffer',
    type: 'application/json',
    path: 'assets/' + 'a'.repeat(64) + '.bin',
    size: 100,
  },
};
const doc = () => ({
  version: 1,
  app: 'jupyterlite',
  project: {
    files: [
      { path: 'research', type: 'directory', content: null },
      {
        path: 'research/analysis.ipynb',
        type: 'notebook',
        format: 'json',
        mimetype: 'application/x-ipynb+json',
        content: ref,
      },
    ],
    open: ['research/analysis.ipynb'],
    active: 'research/analysis.ipynb',
  },
});
test('accepts native notebook files and rejects escaped, duplicate or missing active documents', () => {
  validateProject(doc());
  for (const path of ['../secret', '/absolute', 'folder/../secret', 'folder\\file']) {
    const d = doc();
    d.project.files[1].path = path;
    assert.throws(() => validateProject(d));
  }
  const d = doc();
  d.project.files.push(d.project.files[1]);
  assert.throws(() => validateProject(d), /unique/);
  const missing = doc();
  missing.project.open = ['absent.ipynb'];
  assert.throws(() => validateProject(missing), /saved document/);
});
test('requires imported file bytes while allowing an empty launcher', () => {
  validateProject({
    version: 1,
    app: 'jupyterlite',
    project: { files: [], open: [], active: null },
  });
  const d = doc();
  d.project.files[1].content = 'data';
  assert.throws(() => validateProject(d), /bytes/);
});
