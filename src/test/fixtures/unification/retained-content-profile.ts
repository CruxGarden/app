import { createHash } from 'node:crypto';
import { SettingsKey } from '../../../lib/constants';
import { toolFunctionProfile } from './tool-function-profile';
import { legacyIds } from './legacy-profile';

/** Additional OLD typed references with no Artifact row. Keep the original fixture frozen. */
export function retainedContentProfile() {
  const profile = toolFunctionProfile();
  function blob(label: string) {
    const bytes = Buffer.concat([Buffer.from([0, 255]), Buffer.from(`Retained ${label} — café`)]);
    const fingerprint = createHash('sha256').update(bytes).digest('hex');
    profile.blobs.push({ fingerprint, bytes: [...bytes] });
    return fingerprint;
  }
  function patchMeta(table: string, id: string, patch: object) {
    const row = profile.tables[table]!.find((row) => row.id === id)!;
    row.meta = JSON.stringify({ ...JSON.parse(String(row.meta)), ...patch });
  }
  patchMeta('cruxes', legacyIds.shared, {
    authorSnapshots: { old: { name: 'Previous author', avatarFingerprint: blob('old author') } },
    personaSnapshots: {
      old: {
        name: 'Previous companion',
        thumbnailFingerprint: blob('old dark portrait'),
        thumbnailFingerprintLight: blob('old light portrait'),
      },
    },
  });
  patchMeta('working_copies', legacyIds.copy, {
    authorSnapshots: { task: { avatarFingerprint: blob('task author') } },
    personaSnapshots: { task: { thumbnailFingerprint: blob('task companion') } },
  });
  const journal = profile.tables.task_merges![0]!;
  journal.data = JSON.stringify({
    ...JSON.parse(String(journal.data)),
    base: { 'base.bin': { fingerprint: blob('journal base') } },
    main: { 'main.bin': { fingerprint: blob('journal main') } },
    task: { 'task.bin': { fingerprint: blob('journal task') } },
    manifest: { 'result.bin': { fingerprint: blob('journal result') } },
    conflicts: [{ path: 'conflict.bin', task: { fingerprint: blob('journal conflict') } }],
  });
  const settings: Record<string, unknown> = {
    [SettingsKey.BackgroundImage]: blob('background'),
    [SettingsKey.MoodCover]: blob('mood cover'),
    [SettingsKey.Persona]: {
      name: 'Legacy companion',
      systemPrompt: 'Preserve this instruction.',
      thumbnailFingerprint: blob('current dark portrait'),
      thumbnailFingerprintLight: blob('current light portrait'),
    },
    [SettingsKey.SoundTrack]: {
      fingerprint: blob('music'),
      name: 'Legacy ambient track',
      type: 'audio/wav',
    },
    [SettingsKey.MoodAssets]: [{ fingerprint: blob('font'), name: 'Legacy font', kind: 'font' }],
    [SettingsKey.MoodThemeDark]: {
      accent: '#446688',
      paneBackground: 'asset:' + blob('dark token'),
    },
    [SettingsKey.MoodThemeLight]: { paneBackground: 'asset:' + blob('light token') },
    [SettingsKey.MoodUserPresets]: [
      {
        name: 'Retained theme',
        section: 'Dark',
        overrides: { paneBackground: 'asset:' + blob('preset token') },
      },
    ],
    [SettingsKey.MoodPackages]: [
      {
        format: 'crux-mood',
        version: 1,
        id: 'retained-mood',
        name: 'Retained Mood',
        created: '2026-09-20T12:00:00.000Z',
        cover: blob('package cover'),
        background: { type: 'image', image: blob('package background') },
        persona: { name: 'Package companion', thumbnailFingerprint: blob('package portrait') },
        assets: [{ fingerprint: blob('package asset'), name: 'Package file', kind: 'image' }],
        theme: {
          format: 'crux-mood-theme',
          version: 1,
          name: 'Package theme',
          section: 'Dark',
          overrides: { paneBackground: 'asset:' + blob('package token') },
        },
        sound: {
          track: { fingerprint: blob('package track'), name: 'Package sound', type: 'audio/wav' },
        },
      },
    ],
  };
  for (const [key, value] of Object.entries(settings)) {
    const record = { key, value: typeof value === 'string' ? value : JSON.stringify(value) };
    const old = profile.tables.settings!.find((row) => row.key === key);
    if (old) Object.assign(old, record);
    else profile.tables.settings!.push(record);
  }
  return profile;
}
