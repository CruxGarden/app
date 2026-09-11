import { beforeEach, expect, it } from 'vitest';
import { initServices, getServices } from './index';
import { createCruxStore } from '@/stores/cruxStore';
import { notebookSession } from './notebook';
import { exportCrux, importCrux } from './crux-io';
import { embeddedAppToolAdapter } from './embedded-app-tool-adapters';

beforeEach(() => initServices('local'));
it('preserves native AudioMass tracks and PCM channel bytes in Growth and complete Crux archives', async () => {
  const services = getServices();
  const crux = await services.crux.create({
    title: 'AudioMass',
    kind: 'webapp',
    type: 'workspace',
    meta: { template: 'audiomass-app' },
  });
  const store = createCruxStore();
  store.setState({ crux });
  const call = notebookSession(store);
  const bytes = new Uint8Array([137, 80, 78, 71]);
  const asset = (await call({
    op: 'native-import',
    bytes: bytes.buffer,
    mimeType: 'application/octet-stream',
  })) as { path: string };
  const audio = {
    __cruxAudio: {
      length: 1,
      sampleRate: 48000,
      channels: [
        {
          __cruxBinary: {
            path: asset.path,
            kind: 'buffer',
            type: 'application/octet-stream',
            size: 4,
          },
        },
      ],
    },
  };
  const doc = {
    version: 1,
    app: 'audiomass',
    project: {
      waveform: audio,
      multitrackOn: true,
      editorMarkers: [],
      multitrackMarkers: [],
      multitrack: {
        tracks: [{ id: 'mt1', name: 'Recording', vol: 1, pan: 0 }],
        clips: [
          { id: 'mc1', track: 'mt1', start: 0, in: 0, out: 1 / 48000, fi: 0, fo: 0, buffer: audio },
        ],
      },
    },
  };
  const content = JSON.stringify(doc);
  const saved = (await call({ op: 'write', path: 'project.json', content, expected: null })) as {
    fingerprint: string;
  };
  const snapshot = store.getState().growths[0]!.targetId;
  await expect(
    call({ op: 'write', path: 'project.json', content, expected: null }),
  ).rejects.toThrow('changed elsewhere');
  await expect(call({ op: 'native-read', path: '../index.html' })).rejects.toThrow();
  await expect(
    call({
      op: 'write',
      path: 'project.json',
      content: JSON.stringify({ version: 1, app: 'openmosh', local: {}, databases: {} }),
      expected: saved.fingerprint,
    }),
  ).rejects.toThrow('AudioMass');
  await call({
    op: 'write',
    path: 'project.json',
    content: JSON.stringify({ version: 1, app: 'audiomass', project: null }),
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
  const raster = await services.artifact.downloadBlob(
    files.find((f) => f.meta?.path === 'data/' + asset.path)!.id,
  );
  expect(new Uint8Array(await raster.arrayBuffer())).toEqual(bytes);
});

it('scopes agent operations to a native track rename', () => {
  const adapter = embeddedAppToolAdapter({ meta: { template: 'audiomass-app' } })!;
  expect(adapter.prepare('inspect_audiomass', {})).toEqual({ op: 'inspect' });
  expect(adapter.prepare('rename_audiomass_track', { id: 'mt1', name: 'Voice' })).toEqual({
    op: 'rename-track',
    id: 'mt1',
    name: 'Voice',
  });
  expect(() =>
    adapter.prepare('rename_audiomass_track', { id: 'mt1', name: 'Voice', path: '../other' }),
  ).toThrow();
});
