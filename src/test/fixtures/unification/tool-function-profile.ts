import { createHash } from 'node:crypto';
import { legacyIds, legacyProfile } from './legacy-profile';
import frozen from './tool-package-v1.json';
import { SettingsKey } from '../../../lib/constants';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const toolFunctionIds = {
  tool: id(100),
  legacyTool: id(101),
  packageArtifact: id(102),
  publishedTool: id(103),
  visitorA: id(104),
  visitorB: id(105),
};
export const preservedFunction = `export default async function (req, ctx) {
  return ctx.json({ previous: await ctx.store.get('guestbook'), input: await req.json() });
}
`;
export const preservedEvent = `export const match = 'fixture:*';
export default async function (req, ctx) {
  await ctx.store.set('last-fixture', ctx.event.data, 'public');
}
`;
export const preservedSchedule = `export const schedule = 'every 10m';
export default async function (req, ctx) { ctx.log('fixture schedule'); }
`;

/** Add old package/per-file Tool installations and Functions to the frozen baseline.
 * A recovery fixture, not a selective sharing policy. All content/identities invented. */
export function toolFunctionProfile() {
  const fixture = legacyProfile();
  const now = '2026-09-20T12:00:00.000Z';
  const ids = toolFunctionIds;
  const addFile = (
    fileId: string,
    owner: string,
    path: string,
    bytes: Buffer,
    mimeType: string,
  ) => {
    const fingerprint = createHash('sha256').update(bytes).digest('hex');
    if (!fixture.blobs.some((blob) => blob.fingerprint === fingerprint))
      fixture.blobs.push({ fingerprint, bytes: [...bytes] });
    fixture.tables.artifacts!.push({
      id: fileId,
      resource_id: owner,
      author_id: legacyIds.author,
      home_id: legacyIds.home,
      path,
      filename: path.split('/').pop()!,
      encoding: mimeType.startsWith('text/') ? 'utf-8' : 'binary',
      mime_type: mimeType,
      size: bytes.length,
      fingerprint,
      created: now,
      updated: now,
      meta: JSON.stringify({ path, fixture: 'tool-function' }),
    });
    return fingerprint;
  };
  const bytes = Buffer.from(frozen.archiveBase64, 'base64');
  const fingerprint = addFile(
    ids.packageArtifact,
    ids.tool,
    '_crux/tool-package.zip',
    bytes,
    'application/zip',
  );
  const base = fixture.tables.cruxes![0]!;
  fixture.tables.cruxes!.push(
    {
      ...base,
      id: ids.tool,
      slug: 'installed-package',
      title: 'Installed Tool',
      kind: 'tool',
      meta: JSON.stringify({
        template: frozen.manifest.id,
        toolPackage: {
          version: 1,
          artifactId: ids.packageArtifact,
          fingerprint,
          size: bytes.length,
          fileCount: frozen.files.length,
          unpackedBytes: frozen.files.reduce(
            (sum, f) => sum + Buffer.from(f.base64, 'base64').length,
            0,
          ),
        },
        installedFrom: {
          cruxId: ids.publishedTool,
          author: 'fixture-upstream',
          slug: 'published-tool',
        },
        toolInfo: frozen.manifest.toolInfo,
      }),
    },
    {
      ...base,
      id: ids.legacyTool,
      slug: 'installed-files',
      title: 'Legacy Tool',
      kind: 'tool',
      meta: JSON.stringify({
        template: 'legacy-preservation-tool',
        installedFrom: { cruxId: ids.publishedTool },
      }),
    },
  );
  frozen.files.forEach((file, index) =>
    addFile(
      id(110 + index),
      ids.legacyTool,
      file.path,
      Buffer.from(file.base64, 'base64'),
      file.mimeType,
    ),
  );
  addFile(
    id(120),
    legacyIds.shared,
    'functions/hello.js',
    Buffer.from(preservedFunction),
    'text/javascript',
  );
  addFile(
    id(121),
    legacyIds.shared,
    'functions/on-fixture.js',
    Buffer.from(preservedEvent),
    'text/javascript',
  );
  addFile(
    id(122),
    legacyIds.shared,
    'functions/tick.js',
    Buffer.from(preservedSchedule),
    'text/javascript',
  );
  addFile(
    id(123),
    legacyIds.shared,
    'functions/egress.json',
    Buffer.from('{"hosts":["example.invalid"]}\n'),
    'application/json',
  );
  addFile(
    id(124),
    legacyIds.base,
    'functions/hello.js',
    Buffer.from('export default () => ({ version: 0 });\n'),
    'text/javascript',
  );
  fixture.tables.dimensions!.push({
    ...fixture.tables.dimensions![0]!,
    id: id(125),
    source_id: legacyIds.shared,
    target_id: ids.tool,
    type: 'gate',
    kind: 'tool-source',
    meta: JSON.stringify({ packageFingerprint: fingerprint, releaseVersion: '1.0.0' }),
  });
  fixture.tables.settings!.push({
    key: SettingsKey.InstalledTools,
    value: JSON.stringify({
      [frozen.manifest.id]: {
        id: frozen.manifest.id,
        cruxId: ids.tool,
        publishedCruxId: ids.publishedTool,
        author: 'fixture-upstream',
        slug: 'published-tool',
        installedAt: now,
      },
      'legacy-preservation-tool': {
        id: 'legacy-preservation-tool',
        cruxId: ids.legacyTool,
        installedAt: now,
      },
    }),
  });
  [ids.visitorA, ids.visitorB].forEach((visitorId, index) =>
    fixture.tables.store!.push({
      id: id(130 + index),
      crux_id: legacyIds.shared,
      visitor_id: visitorId,
      key: 'guestbook',
      value: JSON.stringify({ text: `Private visitor ${index + 1}` }),
      mode: 'protected',
      created: now,
      updated: now,
    }),
  );
  return fixture;
}
