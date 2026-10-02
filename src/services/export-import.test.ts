import { beforeEach, expect, it } from 'vitest';
import { localApiFixture } from '@/test/local-api-fixture';
import { getServices, initServices } from './index';
import { exportCrux, importCrux, peekImport } from './crux-io';
import { growthHostFor } from './growth';

const native = localApiFixture();
beforeEach(() => initServices());
const write = (id: string, text: string) =>
  getServices().artifact.create({
    resourceId: id,
    content: text,
    meta: { path: 'hello.txt' },
  });

it('copies an empty Crux with its title and presentation metadata', async () => {
  const crux = await getServices().crux.create({
    title: 'Empty Crux',
    meta: {
      layout: { paneOrder: ['workshop', 'artifacts'] },
      theme: { mode: 'light' },
      custom: { keep: true },
    },
  });
  const archive = await exportCrux({ cruxId: crux.id });
  const copy = await importCrux({ data: archive.blob, mode: 'clone' });
  expect(copy.cruxId).not.toBe(crux.id);
  expect(copy.title).toBe('Empty Crux');
  expect(copy.layout).toEqual(crux.meta?.layout);
  expect(copy.theme).toEqual(crux.meta?.theme);
  expect((await getServices().crux.findById(copy.cruxId)).meta?.custom).toEqual({ keep: true });
  expect(await getServices().artifact.findByResource('crux', copy.cruxId)).toEqual([]);
  expect(copy.failedArtifacts).toEqual([]);
});

it('retains authoritative Collaboration rather than stale dialog messages', async () => {
  const messages = [
    { role: 'user' as const, content: 'Keep our discussion', timestamp: '2026-01-01' },
  ];
  const crux = await getServices().crux.create({ title: 'Conversation', meta: { messages } });
  await write(crux.id, 'Our work');
  const archive = await exportCrux({
    cruxId: crux.id,
    messages: [{ role: 'user', content: 'Stale' }],
  });
  const copy = await importCrux({ data: archive.blob, mode: 'clone' });
  expect((await getServices().crux.findById(copy.cruxId)).meta?.messages).toEqual(messages);
});

it('retains marked Growth timestamps and edge metadata with remapped snapshot identity', async () => {
  const crux = await getServices().crux.create({ title: 'History' });
  await write(crux.id, 'First');
  await (await growthHostFor(crux.id)).snapshot({ label: 'First draft', requestedBy: 'person' });
  const [edge] = await getServices().dimension.findBySourceAndType(crux.id, 'growth');
  await getServices().dimension.update(edge!.id, {
    meta: { ...edge!.meta, custom: 'Keep this annotation' },
  });
  const before = (await getServices().dimension.findBySourceAndType(crux.id, 'growth'))[0]!;
  const archive = await exportCrux({ cruxId: crux.id });
  const copy = await importCrux({ data: archive.blob, mode: 'clone' });
  const [after] = await getServices().dimension.findBySourceAndType(copy.cruxId, 'growth');
  expect(after!.targetId).not.toBe(before.targetId);
  expect(after!.created).toBe(before.created);
  expect(after!.weight).toBe(before.weight);
  expect(after!.meta).toMatchObject({ label: 'First draft', custom: 'Keep this annotation' });
  expect((await getServices().crux.findById(after!.targetId)).created).toBe(
    (await getServices().crux.findById(before.targetId)).created,
  );
});

it('leaves deployment/session state behind and gives a copy its own native Project Folder', async () => {
  const crux = await getServices().crux.create({
    title: 'Portable',
    type: 'workspace',
    meta: {
      publishedAt: '2026-01-01',
      publishedVersion: 42,
      publishedFingerprints: ['old'],
      turnJob: { secret: 'Do not transfer' },
      agentHost: { token: 'Do not transfer' },
      settings: {
        agentSessionId: 'private',
        agentSessions: { main: 'private' },
        custom: 'Keep this',
      },
    },
  });
  await write(crux.id, 'Our work');
  const archive = await exportCrux({ cruxId: crux.id });
  const { cruxData } = await peekImport(archive.blob);
  const meta = cruxData.meta as Record<string, unknown>;
  for (const key of [
    'projectFolder',
    'publishedAt',
    'publishedVersion',
    'publishedFingerprints',
    'turnJob',
    'agentHost',
  ])
    expect(meta).not.toHaveProperty(key);
  expect(meta.settings).toMatchObject({ custom: 'Keep this' });
  expect(meta.settings).not.toHaveProperty('agentSessionId');
  expect(meta.settings).not.toHaveProperty('agentSessions');
  const copy = await importCrux({ data: archive.blob, mode: 'clone' });
  const reopened = await getServices().crux.findById(copy.cruxId);
  expect(reopened.meta?.projectFolder).toBeTruthy();
  expect(reopened.meta?.projectFolder).not.toBe(crux.meta?.projectFolder);
  expect(reopened.meta).not.toHaveProperty('publishedAt');
});

it('captures its source identity before asynchronous admission checks', async () => {
  const first = await getServices().crux.create({ title: 'Selected source' });
  const other = await getServices().crux.create({ title: 'Other source' });
  const options = { cruxId: first.id };
  const exporting = exportCrux(options);
  options.cruxId = other.id;
  const archive = await exporting;
  expect((await peekImport(archive.blob)).cruxData.id).toBe(first.id);
});

it('refuses actual Store read failure rather than exporting an incomplete archive', async () => {
  const crux = await getServices().crux.create({ title: 'Store work' });
  await getServices().store.set(crux.id, 'views', 42, 'public');
  await native().faultSql('ALTER TABLE store RENAME TO unavailable_store');
  try {
    await expect(exportCrux({ cruxId: crux.id })).rejects.toThrow();
  } finally {
    await native().faultSql('ALTER TABLE unavailable_store RENAME TO store');
  }
  const archive = await exportCrux({ cruxId: crux.id });
  const copy = await importCrux({ data: archive.blob, mode: 'clone' });
  expect(await getServices().store.get(copy.cruxId, 'views')).toBe(42);
});

it('rolls back native Store write refusal without partial records, then retries', async () => {
  const crux = await getServices().crux.create({ title: 'Keep original' });
  await write(crux.id, 'Keep original content');
  await getServices().store.set(crux.id, 'views', 42, 'public');
  const archive = await exportCrux({ cruxId: crux.id });
  const before = await native().client.all('SELECT id, deleted FROM cruxes ORDER BY id');
  await native().faultSql(
    "CREATE TRIGGER refuse_archive_store BEFORE INSERT ON store BEGIN SELECT RAISE(ABORT, 'Store admission refused'); END",
  );
  try {
    await expect(importCrux({ data: archive.blob, mode: 'clone' })).rejects.toThrow();
  } finally {
    await native().faultSql('DROP TRIGGER refuse_archive_store');
  }
  expect(await native().client.all('SELECT id, deleted FROM cruxes ORDER BY id')).toEqual(before);
  expect(await getServices().store.get(crux.id, 'views')).toBe(42);
  const copy = await importCrux({ data: archive.blob, mode: 'clone' });
  expect(await getServices().store.get(copy.cruxId, 'views')).toBe(42);
});
