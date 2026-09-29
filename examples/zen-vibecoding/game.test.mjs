import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missions, validateArtifact, restoreProgress, newProgress } from './missions.mjs';
const bytes = (value) =>
  new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
test('seed rejects missing, malformed and unsafe visual values', () => {
  const check = missions[0].checks[0];
  for (const value of [
    '<html>fallback</html>',
    null,
    [],
    {},
    { name: '', color: '#aabbcc' },
    { name: 'Fern', color: 'url(https://example.com)' },
  ])
    assert.ok(validateArtifact(check, bytes(value)));
  assert.equal(validateArtifact(check, bytes({ name: 'Fern', color: '#aabbcc' })), null);
});
test('independent outputs must each satisfy their contract', () => {
  for (const mission of missions)
    for (const check of mission.checks) {
      assert.ok(validateArtifact(check, new Uint8Array()));
      if (check.fields)
        assert.equal(
          validateArtifact(
            check,
            bytes(
              Object.fromEntries(
                check.fields.map((f) => [f, f === 'color' ? '#aabbcc' : 'An actual result']),
              ),
            ),
          ),
          null,
        );
    }
  assert.ok(validateArtifact(missions[0].checks[0], new Uint8Array(65537)));
  assert.ok(validateArtifact(missions[4].checks[1], bytes('<html>missing</html>')));
});
test('restore validates before accepting progress and bounds user input', () => {
  const p = newProgress();
  p.notes.push({
    title: 'Switching',
    feeling: 'Confusing',
    text: 'Where did my agent go?',
    at: '2026-09-29',
  });
  p.completed = [0, 0];
  assert.deepEqual(restoreProgress(p).completed, [0]);
  assert.equal(restoreProgress(p).notes[0].text, p.notes[0].text);
  for (const value of [
    null,
    {},
    { ...p, chapter: 99 },
    { ...p, completed: [-1] },
    { ...p, notes: [{ text: 'bad' }] },
    { ...p, notes: Array(501).fill(p.notes[0]) },
  ])
    assert.throws(() => restoreProgress(value));
});
