import { beforeEach, expect, it } from 'vitest';
import { initServices, getServices } from './index';
import { applyTemplateToCrux } from './crux-create';
import { readFigmaProject, saveFigmaReference, importFigmaExport } from './figma';
import { createCruxspace } from './cruxspaces';
import { copyCruxspaceAsset, listCruxspaceAssets } from './cruxspace-assets';
import { exportCrux, importCrux } from './crux-io';
import { pathOf } from '@/lib/artifact-path';
import { isLocalCreationTool } from './embedded-app';
import { parseFigmaReference } from '../../electron/src/figma-reference';
import { figmaLayout } from '../../electron/src/figma-layout';
const link = 'https://www.figma.com/design/Abcdef1234/Test?node-id=1-2&utm_source=discard';
const canonical = 'https://www.figma.com/design/Abcdef1234?node-id=1-2';
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
it.each([
  'javascript:alert(1)',
  'https://figma.com.attacker.test/design/Abcdef',
  'https://user:pass@figma.com/design/Abcdef',
  'http://figma.com/design/Abcdef',
  'https://figma.com/files/recent',
  'https://figma.com/design/Abcdef?node-id=bad',
])('rejects an unusable Figma link: %s', (url) => {
  expect(() => parseFigmaReference(url)).toThrow();
});
it('keeps only the document and frame identity', () => {
  expect(parseFigmaReference(link)).toEqual({
    url: canonical,
    fileKey: 'Abcdef1234',
    nodeId: '1:2',
  });
});
it('preserves a changed link and carries imported asset provenance through transfer and complete import', async () => {
  const { crux, artifact } = getServices();
  const created = await crux.create({ title: 'Figma art', type: 'workspace' });
  const { crux: source } = await applyTemplateToCrux(created, 'figma', 'webapp');
  expect(isLocalCreationTool(source)).toBe(true);
  const blank = await readFigmaProject(source.id);
  const saved = await saveFigmaReference(source.id, link, blank.fingerprint);
  await expect(
    saveFigmaReference(source.id, 'https://figma.com/design/Changed1', blank.fingerprint),
  ).rejects.toThrow('changed');
  expect((await readFigmaProject(source.id)).reference?.url).toBe(canonical);
  await expect(
    importFigmaExport(source.id, png(), 'Cover', 'https://figma.com/design/Changed1'),
  ).rejects.toThrow('changed');
  const output = await importFigmaExport(source.id, png(), 'Cover', saved.reference!.url);
  const target = await crux.create({ title: 'Site', type: 'workspace' });
  const space = await createCruxspace({
    name: 'Design to site',
    brief: '',
    cruxIds: [source.id, target.id],
  });
  expect(await listCruxspaceAssets(space.id)).toEqual([
    expect.objectContaining({
      id: output.id,
      externalSource: {
        app: 'figma',
        documentUrl: canonical,
        nodeId: '1:2',
        method: 'file-import',
      },
    }),
  ]);
  await copyCruxspaceAsset({
    spaceId: space.id,
    sourceCruxId: source.id,
    outputId: output.id,
    fingerprint: output.fingerprint,
    targetCruxId: target.id,
    path: 'public/cover.png',
  });
  const files = await artifact.findByResource('crux', target.id);
  expect(files.find((f) => pathOf(f) === 'public/cover.png')!.fingerprint).toBe(output.fingerprint);
  const sidecar = files.find((f) => pathOf(f).endsWith('.json'))!;
  expect(JSON.parse(await artifact.readContent(sidecar.id)).externalSource).toEqual(
    output.externalSource,
  );
  const archive = await exportCrux({ cruxId: source.id });
  const imported = await importCrux({ data: archive.blob, mode: 'clone' });
  expect((await readFigmaProject(imported.cruxId)).reference?.url).toBe(canonical);
  const restored = await artifact.findByResource('crux', imported.cruxId);
  expect(restored.find((f) => pathOf(f) === output.path)?.fingerprint).toBe(output.fingerprint);
});
it('keeps placement inside a secondary display and refuses an unusably small display', () => {
  const area = { x: -1440, y: 40, width: 1440, height: 860 };
  const { garden, figma } = figmaLayout(area, 'right');
  expect(garden).toEqual({ x: -420, y: 40, width: 420, height: 860 });
  expect(figma.x).toBe(-1440);
  expect(figma.x + figma.width + 12).toBe(garden.x);
  expect(() => figmaLayout({ ...area, width: 900 })).toThrow('too small');
});
