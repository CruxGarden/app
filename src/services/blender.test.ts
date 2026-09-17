import { beforeEach, expect, it } from 'vitest';
import { initServices, getServices } from './index';
import { applyTemplateToCrux } from './crux-create';
import { registerBlenderOutput } from './blender';
import { createCruxspace } from './cruxspaces';
import { copyCruxspaceAsset, listCruxspaceAssets } from './cruxspace-assets';
import { exportCrux, importCrux } from './crux-io';
import { pathOf } from '@/lib/artifact-path';
import { isLocalCreationTool } from './embedded-app';

beforeEach(() => initServices('local'));
it('shares a saved GLB version with native scene provenance through transfer and complete import', async () => {
  const { crux, artifact } = getServices();
  const { crux: source } = await applyTemplateToCrux(
    await crux.create({ title: 'Blender prop', type: 'workspace' }),
    'blender',
    'webapp',
  );
  expect(isLocalCreationTool(source)).toBe(true);
  // Minimal valid GLB container with a JSON chunk; live acceptance checks actual meshes.
  const json = new TextEncoder().encode('{"asset":{"version":"2.0"}} ');
  const bytes = new Uint8Array(20 + json.length);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, 0x46546c67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, bytes.length, true);
  header.setUint32(12, json.length, true);
  header.setUint32(16, 0x4e4f534a, true);
  bytes.set(json, 20);
  const model = await artifact.upload({
    resourceId: source.id,
    blob: new Blob([bytes], { type: 'model/gltf-binary' }),
    mimeType: 'model/gltf-binary',
    meta: { path: 'prop.glb' },
  });
  await expect(
    registerBlenderOutput(source.id, 'prop.glb', model.fingerprint!, 'Prop'),
  ).rejects.toThrow('Save scene.blend');
  const scene = await artifact.create({
    resourceId: source.id,
    content: 'native scene fixture',
    meta: { path: 'scene.blend' },
  });
  await expect(
    registerBlenderOutput(source.id, 'prop.glb', '0'.repeat(64), 'Prop'),
  ).rejects.toThrow('changed');
  const output = await registerBlenderOutput(source.id, 'prop.glb', model.fingerprint!, 'Prop');
  const target = await crux.create({ title: 'Game', type: 'workspace' });
  const space = await createCruxspace({
    name: 'Model to game',
    brief: '',
    cruxIds: [source.id, target.id],
  });
  expect((await listCruxspaceAssets(space.id))[0]?.externalSource).toEqual({
    app: 'blender',
    scenePath: 'scene.blend',
    sceneFingerprint: scene.fingerprint,
    method: 'saved-artifact',
  });
  await copyCruxspaceAsset({
    spaceId: space.id,
    sourceCruxId: source.id,
    outputId: output.id,
    fingerprint: output.fingerprint,
    targetCruxId: target.id,
    path: 'assets/prop.glb',
  });
  const received = await artifact.findByResource('crux', target.id);
  expect(received.find((f) => pathOf(f) === 'assets/prop.glb')?.fingerprint).toBe(
    model.fingerprint,
  );
  const archive = await exportCrux({ cruxId: source.id });
  const imported = await importCrux({ data: archive.blob, mode: 'clone' });
  const restored = await artifact.findByResource('crux', imported.cruxId);
  expect(restored.find((f) => pathOf(f) === 'scene.blend')?.fingerprint).toBe(scene.fingerprint);
  expect(restored.find((f) => pathOf(f) === output.path)?.fingerprint).toBe(output.fingerprint);
});
