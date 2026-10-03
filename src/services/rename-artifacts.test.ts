import { beforeEach, expect, it } from 'vitest';
import { writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { localApiFixture } from '@/test/local-api-fixture';
import { initServices, getServices } from './index';
import { pathOf } from '@/lib/artifact-path';

const native = localApiFixture();
beforeEach(() => initServices());
async function fixture() {
  const { crux, artifact } = getServices();
  const owner = await crux.create({ title: 'Rename', type: 'workspace' });
  const folder = owner.meta!.projectFolder as string;
  const source = await artifact.create({
    resourceId: owner.id,
    content: 'Source',
    meta: { path: 'source.txt' },
  });
  const target = await artifact.create({
    resourceId: owner.id,
    content: 'Target',
    meta: { path: 'target.txt' },
  });
  return { owner, folder, source, target, artifact };
}
it('requires exact replacement consent, preserves both until approval and retains history after restart', async () => {
  const { owner, folder, source, target, artifact } = await fixture();
  await expect(artifact.update(source, { meta: { path: 'target.txt' } })).rejects.toThrow(
    /already exists/,
  );
  expect(readFileSync(join(folder, 'source.txt'), 'utf8')).toBe('Source');
  expect(readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('Target');
  const replaced = await artifact.update(source, { meta: { path: 'target.txt' }, replace: target });
  expect(replaced.id).toBe(source.id);
  expect(existsSync(join(folder, 'source.txt'))).toBe(false);
  expect(readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('Source');
  await native().restart();
  const files = await artifact.findByResource('crux', owner.id);
  expect(files.map(pathOf)).toEqual(['target.txt']);
  expect(await artifact.readContent(files[0]!)).toBe('Source');
  const history = await native().client.fileContent!.history(owner.id);
  const safety = history.checkpoints.find((x) => x.reason === 'safety')!;
  expect(
    (await native().client.fileContent!.inspectCheckpoint(owner.id, safety.id)).files.map(
      (x) => x.path,
    ),
  ).toEqual(['source.txt', 'target.txt']);
});
it('refuses a changed approved destination in the native manifest and on disk', async () => {
  const { owner, folder, source, target, artifact } = await fixture();
  await artifact.create({ resourceId: owner.id, content: 'Changed', meta: { path: 'target.txt' } });
  writeFileSync(join(folder, 'target.txt'), 'Changed');
  await expect(
    artifact.update(source, { meta: { path: 'target.txt' }, replace: target }),
  ).rejects.toThrow(/changed/);
  expect(readFileSync(join(folder, 'source.txt'), 'utf8')).toBe('Source');
  expect(readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('Changed');
  const latest = (await artifact.findByResource('crux', owner.id)).find(
    (x) => pathOf(x) === 'target.txt',
  )!;
  writeFileSync(join(folder, 'target.txt'), 'Unsaved external change');
  await expect(
    artifact.update(source, { meta: { path: 'target.txt' }, replace: latest }),
  ).rejects.toThrow(/changed/);
  expect(readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('Unsaved external change');
});
it('native commit refusal keeps both originals and permits the same approved retry', async () => {
  const { folder, source, target, artifact } = await fixture();
  await native().faultSql(
    "CREATE TRIGGER refuse_rename BEFORE UPDATE ON file_content_heads BEGIN SELECT RAISE(ABORT, 'Storage refused'); END",
  );
  await expect(
    artifact.update(source, { meta: { path: 'target.txt' }, replace: target }),
  ).rejects.toThrow(/Storage refused/);
  expect(readFileSync(join(folder, 'source.txt'), 'utf8')).toBe('Source');
  expect(readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('Target');
  await native().faultSql('DROP TRIGGER refuse_rename');
  await artifact.update(source, { meta: { path: 'target.txt' }, replace: target });
  expect(readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('Source');
});

it('renames only case spelling through native storage and preserves it across restart', async () => {
  const { owner, folder, source, artifact } = await fixture();
  const renamed = await artifact.update(source, { meta: { path: 'Source.txt' } });
  expect(renamed.id).toBe(source.id);
  expect(readdirSync(folder)).toContain('Source.txt');
  expect(readdirSync(folder)).not.toContain('source.txt');
  await native().restart();
  const current = (await artifact.findByResource('crux', owner.id)).find(
    (file) => file.id === source.id,
  )!;
  expect(pathOf(current)).toBe('Source.txt');
  expect(await artifact.readContent(current)).toBe('Source');
  expect(readFileSync(join(folder, 'target.txt'), 'utf8')).toBe('Target');
});
