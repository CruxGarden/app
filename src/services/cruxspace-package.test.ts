import { beforeEach, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { getServices, initServices } from './index';
import { createCruxspace, deleteCruxspace, getCruxspace, listCruxspaces } from './cruxspaces';
import { saveCruxOutput, listCruxspaceAssets, copyCruxspaceAsset } from './cruxspace-assets';
import {
  exportCruxspace,
  importCruxspace,
  peekCruxspace,
  toolsNeeded,
  missingTools,
} from './cruxspace-package';
import { useKeeperStore, keeperConversationsFor } from '@/stores/keeperStore';
import { growthHostFor } from './growth';

const png = () =>
  new Blob(
    [
      Uint8Array.from(
        atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPfkAAAAASUVORK5CYII=',
        ),
        (c) => c.charCodeAt(0),
      ),
    ],
    { type: 'image/png' },
  );

beforeEach(() => initServices('local'));

async function makeSpace() {
  const { crux, artifact } = getServices();
  const source = await crux.create({ title: 'Artwork', type: 'workspace' });
  const target = await crux.create({ title: 'Website', type: 'workspace' });
  await artifact.create({
    resourceId: target.id,
    content: '<h1>Release</h1>',
    meta: { path: 'index.html' },
  });
  const space = await createCruxspace({
    name: 'Release',
    brief: 'Ship the cover.',
    cruxIds: [source.id, target.id],
  });
  const output = await saveCruxOutput(source.id, png(), 'Cover');
  await copyCruxspaceAsset({
    spaceId: space.id,
    outputId: output.id,
    sourceCruxId: source.id,
    fingerprint: output.fingerprint,
    targetCruxId: target.id,
    path: 'assets/cover.png',
  });
  const growth = await growthHostFor(target.id);
  await growth.snapshot({ label: 'Cover placed', requestedBy: 'person' });
  return { source, target, space, output };
}

it('packs every member once, with outputs, transfers and checkpoint labels in the manifest', async () => {
  const { source, target, space, output } = await makeSpace();
  const result = await exportCruxspace({ spaceId: space.id });
  expect(result.filename).toMatch(/^release-.*\.cruxspace$/);
  expect(result.failed).toEqual([]);
  const { manifest } = result;
  expect(manifest.space).toMatchObject({ id: space.id, name: 'Release', brief: 'Ship the cover.' });
  expect(manifest.members.map((m) => m.id)).toEqual([source.id, target.id]);
  expect(manifest.members[0]!.outputs).toMatchObject([{ id: output.id, label: 'Cover' }]);
  expect(manifest.transfers).toMatchObject([
    {
      sourceCruxId: source.id,
      targetCruxId: target.id,
      outputId: output.id,
      path: 'assets/cover.png',
    },
  ]);
  expect(manifest.members[1]!.checkpoints.map((c) => c.label)).toContain('Cover placed');
  const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
  const names = Object.keys(zip.files).filter((n) => !zip.files[n]!.dir);
  expect(names).toContain('cruxspace.json');
  expect(names).toContain(`members/${source.id}/crux.json`);
  expect(names).toContain(`members/${target.id}/blobs.json`);
  // The cover's bytes live in the source output and in the target's copy, yet travel once.
  const blobs = names.filter((n) => n.startsWith('blobs/'));
  expect(blobs).toContain(`blobs/${output.fingerprint}`);
  expect(new Set(blobs).size).toBe(blobs.length);
  expect(names.some((n) => n.startsWith('artifacts/'))).toBe(false);
});

it('restores a package into an empty Garden with the original identities, then copies with lineage', async () => {
  const { source, target, space, output } = await makeSpace();
  const { blob } = await exportCruxspace({ spaceId: space.id });
  const { crux } = getServices();
  await deleteCruxspace(space.id);
  await crux.delete(source.id);
  await crux.delete(target.id);
  expect((await peekCruxspace(blob)).conflicts).toEqual([]);

  const restored = await importCruxspace({ data: blob });
  expect(restored.space.id).toBe(space.id);
  expect(restored.space.origin).toBeUndefined();
  expect(restored.members.map((m) => m.id)).toEqual([source.id, target.id]);
  expect((await getCruxspace(space.id)).cruxIds).toEqual([source.id, target.id]);
  const assets = await listCruxspaceAssets(space.id);
  expect(assets).toMatchObject([{ id: output.id, sourceCruxId: source.id, label: 'Cover' }]);
  expect(
    (await getServices().artifact.findByResource('crux', target.id)).map((f) => f.meta?.path),
  ).toEqual(expect.arrayContaining(['index.html', 'assets/cover.png']));
  const growth = await growthHostFor(target.id);
  expect((await growth.list()).map((g) => g.label)).toContain('Cover placed');

  // The same package again: identities exist, so it becomes a copy that records where it came from.
  expect((await peekCruxspace(blob)).conflicts).toEqual([source.id, target.id, space.id]);
  const copy = await importCruxspace({ data: blob });
  expect(copy.space.id).not.toBe(space.id);
  expect(copy.space.origin).toMatchObject({ spaceId: space.id });
  expect(Object.keys(copy.space.origin!.members)).toEqual([source.id, target.id]);
  expect(copy.members.map((m) => m.sourceId)).toEqual([source.id, target.id]);
  expect(copy.members.every((m) => m.id !== m.sourceId)).toBe(true);
  expect((await listCruxspaces()).map((s) => s.name)).toEqual(['Release', 'Release']);
  expect(await listCruxspaceAssets(copy.space.id)).toMatchObject([{ label: 'Cover' }]);
});

it('refuses packages that are not Cruxspaces and leaves nothing behind', async () => {
  const zip = new JSZip();
  zip.file(
    'cruxspace.json',
    JSON.stringify({
      version: 1,
      format: 'cruxspace/1.0',
      space: { id: 'x', name: 'X', brief: '' },
      members: [{ id: 'm1', title: 'M', archive: 'members/m1/' }],
      unavailable: [],
    }),
  );
  const broken = await zip.generateAsync({ type: 'blob' });
  await expect(importCruxspace({ data: broken })).rejects.toThrow(/missing the file list/);
  expect(await listCruxspaces()).toEqual([]);
  expect(await getServices().crux.listAll()).toEqual([]);
  const other = new JSZip();
  other.file('crux.json', '{}');
  await expect(
    importCruxspace({ data: await other.generateAsync({ type: 'blob' }) }),
  ).rejects.toThrow(/cruxspace\.json is missing/);
});

it("carries the Keeper's conversation that built the Cruxspace, and brings it back retagged", async () => {
  const { space } = await makeSpace();
  // The garden-level conversation, as the Keeper's store records it.
  useKeeperStore.setState({
    conversations: [
      {
        id: 'k1',
        title: 'Build me a release',
        createdAt: Date.now(),
        cruxspaceId: space.id,
        messages: [
          { role: 'user', content: 'Build me a release', timestamp: 't' },
          { role: 'assistant', content: 'Planted Release.', timestamp: 't' },
        ],
      },
    ],
    activeId: 'k1',
  });
  const { blob } = await exportCruxspace({ spaceId: space.id });
  const { manifest } = await peekCruxspace(blob);
  expect(manifest.keeper).toHaveLength(1);
  expect(manifest.keeper![0]!.messages[1]!.content).toBe('Planted Release.');

  // A copy into the same Garden: the conversation arrives with a new id, tagged to the copy.
  useKeeperStore.setState({ conversations: [], activeId: null });
  const copy = await importCruxspace({ data: blob });
  const carried = keeperConversationsFor(copy.space.id);
  expect(carried).toHaveLength(1);
  expect(carried[0]!.id).not.toBe('k1');
  expect(carried[0]!.messages.map((m) => m.content)).toEqual([
    'Build me a release',
    'Planted Release.',
  ]);
});

/**
 * A package that needs Kan and Piskel should say so, because its members
 * import perfectly well and then open empty (the office-garden kink).
 */
const manifestWith = (templates: (string | null)[]) =>
  ({
    version: 1,
    format: 'cruxspace/1.0',
    exportedAt: new Date().toISOString(),
    space: { id: 's', name: 'S', brief: '', created: '', updated: '' },
    members: templates.map((template, index) => ({
      id: `m${index}`,
      title: `M${index}`,
      slug: `m${index}`,
      template,
      archive: '',
      checkpoints: [],
      outputs: [],
    })),
    transfers: [],
    unavailable: [],
  }) as unknown as Parameters<typeof toolsNeeded>[0];

it('names the Crux Tools its members were made with, once each', () => {
  const needed = toolsNeeded(manifestWith(['kan-app', 'piskel-app', 'kan-app', null, 'blank']));
  expect(needed.map((t) => t.id).sort()).toEqual(['kan-app', 'piskel-app']);
  expect(needed.every((t) => t.name)).toBe(true);
});

it('prefers what the package recorded over what the members imply', () => {
  const manifest = manifestWith(['piskel-app']);
  manifest.tools = [{ id: 'kan-app', name: 'Kan' }];
  expect(toolsNeeded(manifest).map((t) => t.id)).toEqual(['kan-app']);
});

it('counts a tool this Garden cannot open a member with as missing', async () => {
  // Every tool is bundled in this build, so the one thing worth testing — the
  // filter — is tested against a Garden that has none of them.
  const registry = await import('./crux-tools/registry');
  const available = vi.spyOn(registry, 'isToolAvailable').mockReturnValue(false);
  try {
    expect(missingTools(manifestWith(['kan-app'])).map((t) => t.id)).toEqual(['kan-app']);
    // A template that is not a Crux Tool needs nothing installed.
    expect(missingTools(manifestWith(['blank', null]))).toEqual([]);
  } finally {
    available.mockRestore();
  }
});
