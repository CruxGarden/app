import { createHash } from 'node:crypto';
import { SettingsKey } from '../../../lib/constants';
import { synthPreset } from '../../../audio/synth-patch';

// Fixed, invented identities/content. Never capture a person's actual profile.
// Keep this OLD representation as migrations evolve; new migrations must read it.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const legacyIds = {
  author: id(1),
  home: id(2),
  shared: id(3),
  private: id(4),
  base: id(5),
  tip: id(6),
  copy: id(7),
  task: id(8),
  candidate: id(9),
  spaceA: id(10),
  spaceB: id(11),
  mood: id(12),
  rootConversation: id(13),
  gardenConversation: id(14),
};
export type FixtureRow = Record<string, string | number | null>;
export interface LegacyProfile {
  tables: Record<string, FixtureRow[]>;
  blobs: { fingerprint: string; bytes: number[] }[];
}

/** A preservation fixture, not a proposed new schema or export format. */
export function legacyProfile(): LegacyProfile {
  const i = legacyIds;
  const now = '2026-09-20T12:00:00.000Z';
  const messages = [{ id: id(20), role: 'user', content: 'Keep the shared work — café 🌱' }];
  const patch = { ...synthPreset('glow'), name: 'My quiet room', space: 0.81 };
  const payloads = [
    Buffer.from('First draft\n'),
    Buffer.from('Shared creation — café 🌱\n'),
    Buffer.from([0, 255, 128, 13, 10, 0, 42]),
    Buffer.from('Private sibling\n'),
  ];
  const blobs = payloads.map((bytes) => ({
    fingerprint: createHash('sha256').update(bytes).digest('hex'),
    bytes: [...bytes],
  }));
  const crux = (n: string, title: string, kind: string | null, meta: object) => ({
    id: n,
    slug: n,
    title,
    kind,
    type: 'workspace',
    author_id: i.author,
    home_id: i.home,
    created: now,
    updated: now,
    meta: JSON.stringify(meta),
  });
  const edge = (n: number, source: string, target: string, type: string, kind: string | null) => ({
    id: id(n),
    source_id: source,
    target_id: target,
    type,
    kind,
    author_id: i.author,
    home_id: i.home,
    created: now,
    updated: now,
    meta: JSON.stringify({ retained: { camelCase: true } }),
  });
  const file = (n: number, owner: string, path: string, blob: number, encoding = 'utf-8') => ({
    id: id(n),
    resource_id: owner,
    author_id: i.author,
    home_id: i.home,
    path,
    filename: path.split('/').pop()!,
    encoding,
    size: blobs[blob]!.bytes.length,
    fingerprint: blobs[blob]!.fingerprint,
    created: now,
    updated: now,
    meta: JSON.stringify({ path, preserved: 'metadata' }),
  });
  const settings: Record<string, unknown> = {
    [SettingsKey.LocalAuthorId]: i.author,
    [SettingsKey.LocalAuthorIdLegacy]: i.author,
    [SettingsKey.LocalHomeId]: i.home,
    [SettingsKey.GardenMemory]: 'The untagged root has its own memory.',
    [SettingsKey.KeeperConversations]: [
      { id: i.rootConversation, title: 'Root', createdAt: 1, messages },
      { id: i.gardenConversation, title: 'Studio', createdAt: 2, messages, cruxspaceId: i.spaceA },
    ],
    [SettingsKey.ActiveMoodId]: i.mood,
    [SettingsKey.WornMoodId]: 'plasma',
    [SettingsKey.SynthPatch]: patch,
    [SettingsKey.SynthPresetBanks]: { plasma: [patch] },
    [SettingsKey.MoodThemeDark]: { accent: '#446688' },
    [SettingsKey.WorkspaceLayouts]: [
      {
        name: 'Read and make',
        layout: {
          direction: 'row',
          first: 'collaboration',
          second: 'workshop',
          splitPercentage: 35,
        },
      },
    ],
    [SettingsKey.ResonanceOptIn]: 'false',
    [SettingsKey.Persona]: {
      name: 'Legacy companion',
      systemPrompt: 'Keep this instruction until migration policy is settled.',
    },
    [`cruxgarden:cruxspace:${i.spaceA}`]: {
      version: 1,
      id: i.spaceA,
      name: 'Studio',
      brief: 'Shared work',
      cruxIds: [i.shared],
      created: now,
      updated: now,
    },
    [`cruxgarden:cruxspace:${i.spaceB}`]: {
      version: 1,
      id: i.spaceB,
      name: 'Library',
      brief: 'Private sibling',
      cruxIds: [i.shared, i.private],
      created: now,
      updated: now,
    },
    [`cruxgarden:composer:${i.shared}`]: 'Unsent draft',
    'cruxgarden:schedules': [
      {
        id: id(30),
        title: 'Remember',
        enabled: false,
        trigger: { kind: 'event', event: 'snapshot' },
        actions: [{ kind: 'prompt', cruxId: i.shared, prompt: 'Review' }],
        lastFired: now,
      },
    ],
    'cruxgarden:alerts': [
      {
        id: id(31),
        key: 'fixture-notice',
        kind: 'reminder',
        at: now,
        title: 'Existing notice',
        body: 'Keep me',
        state: 'new',
        cruxId: i.shared,
      },
    ],
  };
  return {
    blobs,
    tables: {
      authors: [
        { id: i.author, username: 'fixture-author', home_id: i.home, created: now, updated: now },
      ],
      cruxes: [
        crux(i.shared, 'Shared creation', null, {
          settings: { activeBranch: i.tip, entryFile: 'work.txt' },
          messages,
        }),
        crux(i.private, 'Private sibling', null, {
          messages: [{ ...messages[0], content: 'Never include in Studio sharing.' }],
        }),
        crux(i.base, 'Base', 'snapshot', { messages, settings: { entryFile: 'work.txt' } }),
        crux(i.tip, 'Tip', 'snapshot', {
          parentCruxId: i.base,
          messages: [],
          settings: { entryFile: 'work.txt' },
        }),
        crux(i.candidate, 'Task result', 'snapshot', {
          contentOwnerId: i.copy,
          parentCruxId: i.base,
          messages: [],
        }),
        {
          ...crux(i.mood, 'Legacy Mood', null, {
            retained: 'Mood Crux coexists with package settings',
          }),
          type: 'mood',
        },
      ],
      dimensions: [
        edge(40, i.shared, i.base, 'growth', null),
        edge(41, i.shared, i.tip, 'growth', null),
        edge(42, i.copy, i.candidate, 'growth', null),
        edge(43, i.shared, i.private, 'graft', 'reference'),
        edge(44, i.shared, i.mood, 'garden', 'derivation'),
      ],
      artifacts: [
        file(50, i.shared, 'work.txt', 1),
        file(51, i.shared, 'assets/raw.bin', 2, 'base64'),
        file(52, i.base, 'work.txt', 0),
        file(53, i.tip, 'work.txt', 1),
        file(54, i.copy, 'work.txt', 1),
        file(55, i.candidate, 'work.txt', 1),
        file(56, i.private, 'private.txt', 3),
      ],
      working_copies: [
        {
          id: i.copy,
          crux_id: i.shared,
          task_id: i.task,
          title: 'Review',
          base_snapshot_id: i.base,
          phase: 'ready',
          meta: JSON.stringify({ settings: { activeBranch: i.candidate } }),
          created: now,
          updated: now,
        },
      ],
      task_merges: [
        {
          id: id(60),
          crux_id: i.shared,
          copy_id: i.copy,
          candidate_id: i.candidate,
          phase: 'review',
          data: JSON.stringify({
            baseId: i.base,
            sourceHead: i.candidate,
            targetHead: i.tip,
            resultHead: i.candidate,
            resolutions: {},
          }),
          created: now,
        },
      ],
      store: [
        {
          id: id(61),
          crux_id: i.shared,
          key: 'guestbook',
          value: JSON.stringify({ text: 'A retained visitor entry' }),
          mode: 'public',
          created: now,
          updated: now,
        },
      ],
      settings: Object.entries(settings).map(([key, value]) => ({
        key,
        value: typeof value === 'string' ? value : JSON.stringify(value),
      })),
      schema_version: [], // Native legacy databases do not populate this table.
    },
  };
}

export async function seedLegacyProfile(
  db: {
    run(sql: string, params?: unknown[]): unknown;
    blobWrite(fingerprint: string, bytes: Uint8Array): unknown;
  },
  fixture = legacyProfile(),
) {
  for (const [table, rows] of Object.entries(fixture.tables)) {
    for (const row of rows) {
      const columns = Object.keys(row);
      await db.run(
        `INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
        Object.values(row),
      );
    }
  }
  for (const blob of fixture.blobs)
    await db.blobWrite(blob.fingerprint, Uint8Array.from(blob.bytes));
}
