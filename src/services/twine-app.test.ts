import { beforeEach, expect, it } from 'vitest';
import { initServices, getServices } from './index';
import { createCruxStore } from '@/stores/cruxStore';
import { notebookSession } from './notebook';
import { exportCrux, importCrux } from './crux-io';
import { embeddedAppToolAdapter } from './embedded-app-tool-adapters';
beforeEach(() => initServices('local'));
it('retains native stories and passages through Growth and portable Crux archives', async () => {
  const services = getServices();
  const crux = await services.crux.create({
    title: 'Research',
    kind: 'webapp',
    type: 'workspace',
    meta: { template: 'twine-app' },
  });
  const store = createCruxStore();
  store.setState({ crux });
  const call = notebookSession(store);
  const components = {
    'twine-stories': 'story1',
    'twine-stories-story1': JSON.stringify({ id: 'story1', name: 'Lantern' }),
    'twine-passages': 'passage1',
    'twine-passages-passage1': JSON.stringify({
      id: 'passage1',
      story: 'story1',
      text: 'Follow [[the light]]',
    }),
  };
  const project: Record<string, unknown> = {};
  const assets: { path: string; bytes: Uint8Array }[] = [];
  for (const [key, value] of Object.entries(components)) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    const asset = (await call({
      op: 'native-import',
      bytes: bytes.buffer,
      mimeType: 'application/json',
    })) as { path: string };
    project[key] = {
      __cruxBinary: {
        path: asset.path,
        kind: 'buffer',
        type: 'application/json',
        size: bytes.byteLength,
      },
    };
    assets.push({ path: asset.path, bytes });
  }
  const doc = { version: 1, app: 'twine', project };
  const content = JSON.stringify(doc);
  const saved = (await call({ op: 'write', path: 'project.json', content, expected: null })) as {
    fingerprint: string;
  };
  const snapshot = store.getState().growths[0]!.targetId;
  await expect(
    call({ op: 'write', path: 'project.json', content, expected: null }),
  ).rejects.toThrow('changed elsewhere');
  await expect(call({ op: 'native-read', path: '../other' })).rejects.toThrow();
  await call({
    op: 'write',
    path: 'project.json',
    content: JSON.stringify({
      version: 1,
      app: 'twine',
      project: null,
    }),
    expected: saved.fingerprint,
  });
  await store.getState().revertToSnapshot(snapshot);
  expect(((await call({ op: 'read', path: 'project.json' })) as { content: string }).content).toBe(
    content,
  );
  const imported = await importCrux({
    data: (await exportCrux({ cruxId: crux.id })).blob,
    mode: 'clone',
  });
  const files = await services.artifact.findByResource('crux', imported.cruxId);
  expect(
    await services.artifact.readContent(
      files.find((f) => f.meta?.path === 'data/project.json')!.id,
    ),
  ).toBe(content);
  for (const asset of assets) {
    const data = await services.artifact.downloadBlob(
      files.find((f) => f.meta?.path === 'data/' + asset.path)!.id,
    );
    expect(new Uint8Array(await data.arrayBuffer())).toEqual(asset.bytes);
  }
});
it('scopes native story title commands to an explicit story and bounded title', () => {
  const a = embeddedAppToolAdapter({ meta: { template: 'twine-app' } })!;
  expect(a.prepare('inspect_twine', {})).toEqual({ op: 'inspect' });
  expect(a.prepare('set_twine_title', { storyId: 'story1', title: 'Lantern' })).toEqual({
    op: 'set-title',
    storyId: 'story1',
    title: 'Lantern',
  });
  expect(() => a.prepare('set_twine_title', { title: 'Lantern' })).toThrow();
  expect(() =>
    a.prepare('set_twine_title', { storyId: 'story1', title: 'x'.repeat(301) }),
  ).toThrow();
  expect(() =>
    a.prepare('set_twine_title', { storyId: 'story1', title: 'Lantern', run: true }),
  ).toThrow();
});

it('bounds passage edits and rejects extra fields before native dispatch', () => {
  const a = embeddedAppToolAdapter({ meta: { template: 'twine-app' } })!;
  const input = { storyId: 's1', passageId: 'p1', text: '[[Next]]' };
  expect(a.prepare('set_twine_passage', input)).toEqual({ op: 'set-passage', ...input });
  expect(a.prepare('set_twine_passage', { ...input, text: '' })).toEqual({
    op: 'set-passage',
    ...input,
    text: '',
  });
  expect(() => a.prepare('set_twine_passage', { ...input, text: 'x'.repeat(100001) })).toThrow();
  expect(() => a.prepare('set_twine_passage', { ...input, passageId: '' })).toThrow();
  expect(() => a.prepare('set_twine_passage', { ...input, execute: true })).toThrow();
});
