import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateProject, MAX_SONG } from './document.js';
test('accepts an empty project and a URL-hash song', () => {
  validateProject({ version: 1, app: 'beepbox', project: null });
  validateProject({ version: 1, app: 'beepbox', project: { song: '9n31s0k0l00e03t2ma7g0fj07i0r1O_U00o3T0v1L4u00q1d1f8y0z8C0w2c0h0T1v1L4u00q1d1f8y0z1C2w0c0h0b4x000000000000000000000000000000000000000000000000h4g000000014h000000004h400000000p16000000', saved: '2026-09-13T00:00:00Z' } });
});
test('rejects other apps, extra keys, empty or oversized or unsafe songs', () => {
  assert.throws(() => validateProject({ version: 1, app: 'web-synth', project: null }), /Invalid BeepBox project/);
  assert.throws(() => validateProject({ version: 1, app: 'beepbox', project: null, extra: 1 }));
  assert.throws(() => validateProject({ version: 1, app: 'beepbox', project: { song: '' } }), /song/);
  assert.throws(() => validateProject({ version: 1, app: 'beepbox', project: { song: '<script>' } }), /song/);
  assert.throws(() => validateProject({ version: 1, app: 'beepbox', project: { song: 'a'.repeat(MAX_SONG + 1) } }), /song/);
  assert.throws(() => validateProject({ version: 1, app: 'beepbox', project: { song: 'abc', other: 1 } }));
});
