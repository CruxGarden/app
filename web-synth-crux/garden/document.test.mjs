import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateProject, MAX_KEYS } from './document.js';
test('accepts an empty project and a composition of string entries', () => {
  validateProject({ version: 1, app: 'web-synth', project: null });
  validateProject({ version: 1, app: 'web-synth', project: { state: { vcmState: '{}', vc_1: 'x' }, saved: '2026-09-13T00:00:00Z' } });
});
test('rejects other apps, extra keys, non-string entries and oversized compositions', () => {
  assert.throws(() => validateProject({ version: 1, app: 'kan', project: null }), /Invalid web-synth project/);
  assert.throws(() => validateProject({ version: 1, app: 'web-synth', project: null, extra: 1 }));
  assert.throws(() => validateProject({ version: 1, app: 'web-synth', project: { state: { a: 1 } } }), /entry/);
  assert.throws(() => validateProject({ version: 1, app: 'web-synth', project: { state: {}, other: 1 } }));
  const state = Object.fromEntries(Array.from({ length: MAX_KEYS + 1 }, (_, i) => [`k${i}`, '']));
  assert.throws(() => validateProject({ version: 1, app: 'web-synth', project: { state } }), /too many/);
  assert.throws(() => validateProject({ version: 1, app: 'web-synth', project: { state: { big: 'x'.repeat(16_000_001) } } }), /too large/);
});
