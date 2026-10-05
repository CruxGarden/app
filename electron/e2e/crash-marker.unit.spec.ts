import { test, expect } from '@playwright/test';
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionMarker, isRendererCrash } from '../src/crash-marker';
import { readLaunchSettings } from '../src/launch-settings';

/** "Did the last session end badly?" (EF04) — a marker file under userData, nothing sent. */
const profile = () => mkdtempSync(join(tmpdir(), 'crux-session-marker-'));
const at = (iso: string) => () => new Date(iso);

test('a first launch and a launch after a clean quit report nothing', () => {
  const dir = profile();
  const first = new SessionMarker(dir);
  expect(first.begin('1.0.0')).toBeNull();
  expect(existsSync(first.file)).toBe(true);
  expect(first.file).toBe(join(dir, 'session-marker.json'));
  first.end();
  expect(existsSync(first.file)).toBe(false);
  expect(new SessionMarker(dir).begin('1.0.0')).toBeNull();
});

test('a session that never ended is reported once, with its version and start time only', () => {
  const dir = profile();
  new SessionMarker(dir, at('2026-10-01T10:00:00.000Z')).begin('1.0.0');
  // No end(): the process crashed, was killed or lost power.
  const next = new SessionMarker(dir, at('2026-10-02T09:00:00.000Z'));
  expect(next.begin('1.0.1')).toEqual({
    kind: 'unclean-exit',
    at: '2026-10-01T10:00:00.000Z',
    version: '1.0.0',
  });
  expect(Object.keys(JSON.parse(readFileSync(next.file, 'utf8'))).sort()).toEqual([
    'startedAt',
    'version',
  ]);
  next.end();
  expect(new SessionMarker(dir).begin('1.0.1')).toBeNull();
});

test('a renderer crash the app survived is offered on the next launch, then forgotten', () => {
  const dir = profile();
  const session = new SessionMarker(dir, at('2026-10-01T10:00:00.000Z'));
  session.begin('1.0.0');
  session.noteRendererCrash();
  session.end();
  expect(existsSync(session.file)).toBe(true);
  const next = new SessionMarker(dir);
  expect(next.begin('1.0.0')).toEqual({
    kind: 'renderer',
    at: '2026-10-01T10:00:00.000Z',
    version: '1.0.0',
  });
  next.end();
  expect(new SessionMarker(dir).begin('1.0.0')).toBeNull();
});

test('a torn or foreign marker still counts as an unclean end and never throws', () => {
  const dir = profile();
  writeFileSync(join(dir, 'session-marker.json'), '{"startedAt":');
  expect(new SessionMarker(dir).begin('1.0.0')).toEqual({
    kind: 'unclean-exit',
    at: null,
    version: null,
  });
  writeFileSync(join(dir, 'session-marker.json'), '{"startedAt":42,"version":["x"]}');
  expect(new SessionMarker(dir).begin('1.0.0')).toEqual({
    kind: 'unclean-exit',
    at: null,
    version: null,
  });
});

test('ending or noting a crash before the session began touches nothing', () => {
  const dir = profile();
  writeFileSync(join(dir, 'session-marker.json'), '{"startedAt":"2026-10-01T10:00:00.000Z"}');
  const other = new SessionMarker(dir);
  other.noteRendererCrash();
  other.end();
  // A second instance that never owned the profile must not clear the owner's marker.
  expect(readFileSync(other.file, 'utf8')).toBe('{"startedAt":"2026-10-01T10:00:00.000Z"}');
});

test('an unwritable profile reports nothing rather than failing the launch', () => {
  const file = join(profile(), 'not-a-directory');
  writeFileSync(file, '');
  const marker = new SessionMarker(join(file, 'userData'));
  expect(marker.begin('1.0.0')).toBeNull();
  marker.noteRendererCrash();
  marker.end();
});

test('which renderer exits are crashes', () => {
  expect(isRendererCrash('crashed')).toBe(true);
  expect(isRendererCrash('oom')).toBe(true);
  expect(isRendererCrash('abnormal-exit')).toBe(true);
  expect(isRendererCrash('clean-exit')).toBe(false);
  expect(isRendererCrash('killed')).toBe(false);
  expect(isRendererCrash(undefined)).toBe(false);
});

test('the notice is for installed builds; a test profile shows it only when asked', () => {
  const profileDir = profile();
  expect(readLaunchSettings(true, {}).crashNotice).toBe(true);
  expect(readLaunchSettings(false, {}).crashNotice).toBe(false);
  expect(readLaunchSettings(false, { CRUX_TEST_PROFILE: profileDir }).crashNotice).toBe(false);
  expect(
    readLaunchSettings(false, { CRUX_TEST_PROFILE: profileDir, CRUX_CRASH_NOTICE: '1' })
      .crashNotice,
  ).toBe(true);
  // Without an isolated profile the knob grants nothing.
  expect(readLaunchSettings(false, { CRUX_CRASH_NOTICE: '1' }).crashNotice).toBe(false);
});
