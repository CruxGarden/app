import { expect, it } from 'vitest';
import type { Artifact, Crux } from '@/api/types';
import { appChanges, appChangesLabel, appPreviewKey } from './app-changes';
const crux = { kind: 'notes' } as Crux;
const file = (path: string, fingerprint: string) => ({ meta: { path }, fingerprint }) as Artifact;
it('classifies additions, deletions and modifications without reading content', () => {
  expect(
    appChanges(
      crux,
      [file('notebook/A.md', 'a'), file('src/app.ts', 'old'), file('notebook/Gone.md', 'gone')],
      [
        file('notebook/A.md', 'a'),
        file('src/app.ts', 'new'),
        file('notebook/New.md', 'new'),
        file('preview.jpg', 'image'),
        file('AGENTS.md', 'guide'),
      ],
    ),
  ).toEqual({ app: 1, content: 2 });
  expect(
    appChanges(
      { ...crux, kind: 'webapp', meta: { template: 'moqira' } },
      [],
      [file('mockups/project.json', 'x')],
    ),
  ).toEqual({ app: 0, content: 1 });
  expect(appChanges({ kind: 'webapp' } as Crux, [], [])).toBeNull();
});
it('labels only trustworthy counts and leaves legacy snapshots unclassified', () => {
  expect(appChangesLabel({ app: 1, content: 2 })).toBe('App and content changed');
  expect(appChangesLabel({ app: 0, content: 2 })).toBe('Content changed');
  expect(appChangesLabel({ app: 2, content: 0 })).toBe('App changed');
  expect(appChangesLabel({ app: 0, content: 0 })).toBe('No file changes');
  expect(appChangesLabel(undefined)).toBeNull();
  expect(appChangesLabel({ app: -1, content: 2 })).toBeNull();
});

it('keeps embedded editors alive through data saves and generated thumbnails while reloading changed sources', () => {
  const instrument: Crux = { ...crux, kind: 'webapp', meta: { template: 'cardinal-drone' } };
  const before = [
    file('index.html', 'app'),
    file('music/instrument.json', 'old'),
    file('preview.jpg', 'old'),
  ];
  const after = [
    file('AGENTS.md', 'new'),
    file('preview.jpg', 'new'),
    file('music/instrument.json', 'new'),
    file('index.html', 'app'),
  ];
  expect(appPreviewKey(instrument, before)).toBe(appPreviewKey(instrument, after));
  expect(appPreviewKey(instrument, [file('index.html', 'changed')])).not.toBe(
    appPreviewKey(instrument, before),
  );
  expect(appPreviewKey({ kind: 'webapp' } as Crux, before)).not.toBe(
    appPreviewKey({ kind: 'webapp' } as Crux, after),
  );
});
