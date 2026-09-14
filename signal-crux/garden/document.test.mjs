import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProject } from './document.js';

const ref = {
  __cruxBinary: { path: `assets/${'a'.repeat(64)}.bin`, kind: 'buffer', type: 'audio/midi', size: 1200 },
};
const good = {
  version: 1,
  app: 'signal',
  project: { name: 'Moss Waltz', midi: ref, saved: '2026-09-14T00:00:00.000Z' },
};

test('accepts an empty project and a saved song', () => {
  validateProject({ version: 1, app: 'signal', project: null });
  validateProject(good);
});

test('refuses inline MIDI, other types, unnamed songs and stray fields', () => {
  assert.throws(() => validateProject({ ...good, app: 'fmg' }), /Invalid song project/);
  assert.throws(() => validateProject({ ...good, project: { ...good.project, name: ' ' } }), /Name the song/);
  assert.throws(
    () => validateProject({ ...good, project: { ...good.project, midi: 'TVRoZA==' } }),
    /MIDI file/,
  );
  assert.throws(
    () =>
      validateProject({
        ...good,
        project: { ...good.project, midi: { __cruxBinary: { ...ref.__cruxBinary, type: 'text/plain' } } },
      }),
    /MIDI file/,
  );
  assert.throws(() => validateProject({ ...good, project: { ...good.project, extra: 1 } }), /fields/);
  assert.throws(() => validateProject({ ...good, project: { ...good.project, saved: 'never' } }), /save time/);
});
