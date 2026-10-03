import { expect, it } from 'vitest';
import type { Artifact, Crux } from '@/api/types';
import { starterManifest } from '@/templates/tool-starter';
import { parseManifest, type CruxToolManifest } from './crux-tools/manifest';
import { publicationPlan } from './publication-plan';
import { buildFingerprintMap, hasContentChanged } from './publish';

const definition = () => ({
  ...starterManifest,
  share: true,
  publication: {
    type: 'static' as const,
    root: 'public/',
    include: ['data/project.json', 'data/assets/'],
  },
});
const crux = (manifest: unknown = definition()): Crux => ({
  id: 'test',
  slug: 'test',
  type: 'workspace',
  kind: 'webapp',
  data: '',
  status: 'living',
  visibility: 'private',
  discoverable: false,
  authorId: 'author',
  homeId: 'home',
  created: '2026-10-02T00:00:00Z',
  updated: '2026-10-02T00:00:00Z',
  // Persisted snapshots are untrusted; rejection cases deliberately supply malformed input.
  meta: { toolManifest: manifest as CruxToolManifest },
});
const file = (path: string, fingerprint = path) =>
  ({ id: path, type: 'artifact', fingerprint, meta: { path } }) as Artifact;
const files = () => [file('public/index.html'), file('data/project.json')];

it.each([
  { type: 'execute', command: 'downloaded-script' },
  { type: 'static', root: '' },
  { type: 'static', root: '/' },
  { type: 'static', root: '../public/' },
  { type: 'static', root: 'public\\files' },
  { type: 'static', root: 'public/%2e%2e/' },
  { type: 'static', root: 'public/', include: ['private/*'] },
  { type: 'static', root: 'public/', include: ['.env'] },
  { type: 'static', root: 'public/', include: ['.crux-recovery/'] },
  { type: 'static', root: 'public/', include: ['_crux/tool-package.zip'] },
  { type: 'static', root: 'public/', include: ['data/project.json', 'data/project.json'] },
  { type: 'static', root: 'public/', command: 'build' },
  { type: 'garden-package', include: ['private'] },
])('refuses unsupported or unsafe publication declarations: %j', (publication) => {
  expect(() => parseManifest({ ...definition(), publication })).toThrow(/publication/);
});

it('rejects contradictory sharing and retains the explicit package handoff without a tool ID rule', () => {
  expect(() => parseManifest({ ...definition(), share: false })).toThrow(/share/);
  const manifest = parseManifest({
    ...starterManifest,
    app: 'another-workspace',
    share: true,
    publication: { type: 'garden-package' },
  });
  expect(publicationPlan(crux(manifest), files())).toEqual({ kind: 'garden-package' });
});

it('explains an undeclared unknown exporter without treating the editor as a public page', () => {
  const owner = crux({ ...starterManifest, share: true });
  expect(publicationPlan(owner, [file('index.html')])).toMatchObject({
    kind: 'unavailable',
    explanation: expect.stringContaining('declared a supported public edition'),
  });
  expect(publicationPlan({ ...owner, kind: 'tool' }, [file('index.html')])).toMatchObject({
    kind: 'tool-package',
  });
});

it.each(
  [
    [file('public/other.html'), file('data/project.json')],
    [file('public/index.html')],
    [...files(), file('public/data/project.json')],
    [...files(), file('public/.env.local')],
    [...files(), file('public/_crux/tool-package.zip')],
  ].map((artifacts) => ({ artifacts })),
)('refuses incomplete, colliding or private output before it can be shared', ({ artifacts }) => {
  expect(publicationPlan(crux(), artifacts)).toMatchObject({ kind: 'unavailable' });
});

it('uses exact directory boundaries and emitted paths for content changes without following private files', () => {
  const owner = crux();
  const selected = [
    ...files(),
    file('private.txt'),
    file('publicity/no.txt'),
    file('data/assets/x.bin'),
  ];
  expect(buildFingerprintMap(selected, owner)).toEqual({
    'index.html': 'public/index.html',
    'data/project.json': 'data/project.json',
    'data/assets/x.bin': 'data/assets/x.bin',
  });
  const fingerprint = buildFingerprintMap(selected, owner);
  expect(
    hasContentChanged(
      [...files(), file('private.txt', 'changed'), file('data/assets/x.bin')],
      fingerprint,
      owner,
    ),
  ).toBe(false);
  expect(
    hasContentChanged(
      [file('public/index.html', 'changed'), file('data/project.json'), file('data/assets/x.bin')],
      fingerprint,
      owner,
    ),
  ).toBe(true);
  const changedScope = crux({
    ...definition(),
    publication: { type: 'static', root: 'public/', include: ['data/project.json'] },
  });
  expect(hasContentChanged(selected, fingerprint, changedScope)).toBe(true);
  expect(
    hasContentChanged(
      selected,
      fingerprint,
      crux({ ...definition(), publication: { type: 'execute' } }),
    ),
  ).toBe(true);
});
