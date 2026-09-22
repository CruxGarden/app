import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { packTool, openToolPackage, TOOL_PACKAGE_PATH } from './package';
import { toolManifest } from './registry';
import { hashContent } from '../sqlite/helpers';
import { initServices, getServices } from '../index';
import { installToolFromPublished, installedTool, recordInstalledTool } from './installed';
import { putBlob } from '../blobs';
import * as templates from '@/templates';
import { applyTemplateToCrux } from '../crux-create';

const manifest = toolManifest('p5-app')!;
const inputs = () => [
  { path: 'empty.txt', blob: new Blob([]), mimeType: 'text/plain' },
  { path: manifest.entryFile, blob: new Blob(['<html>Editor</html>']), mimeType: 'text/html' },
  {
    path: 'src/editor.ts',
    blob: new Blob(['export const editor = true;']),
    mimeType: 'text/plain',
  },
  { path: 'LICENSE', blob: new Blob(['Original license']), mimeType: 'text/plain' },
  {
    path: 'assets/binary.dat',
    blob: new Blob([new Uint8Array([0, 255, 17])]),
    mimeType: 'application/octet-stream',
  },
];
async function published(blob: Blob) {
  return {
    id: 'published-tool',
    slug: 'p5',
    author_username: 'keeper',
    meta: {
      template: manifest.id,
      toolPackage: {
        version: 1,
        artifactId: 'package-artifact',
        fingerprint: await hashContent(blob),
      },
    },
  };
}

describe('single-entity tool packages', () => {
  beforeEach(async () => {
    await initServices('local');
  });
  afterEach(() => vi.restoreAllMocks());

  it('fingerprints the complete version deterministically and preserves all source and binary bytes', async () => {
    const a = await packTool(manifest, inputs());
    const b = await packTool(manifest, inputs().reverse());
    expect(await hashContent(a)).toBe(await hashContent(b));
    const opened = await openToolPackage(a, manifest.id, await hashContent(a));
    expect(opened.manifest).toEqual(manifest);
    for (const input of inputs()) {
      const file = opened.files.find((file) => file.path === input.path)!;
      expect(await file.read()).toEqual(new Uint8Array(await input.blob.arrayBuffer()));
    }
  });

  it('rejects the wrong version fingerprint or tool identity', async () => {
    const blob = await packTool(manifest, inputs());
    await expect(openToolPackage(blob, manifest.id, '0'.repeat(64))).rejects.toThrow(/fingerprint/);
    await expect(openToolPackage(blob, 'maps-app')).rejects.toThrow(/different tool/);
  });

  it.each(['../outside', '/absolute', 'folder/../outside', 'C:/outside', 'folder\\outside'])(
    'rejects unsafe package path %s',
    async (path) => {
      await expect(
        packTool(manifest, [...inputs(), { path, blob: new Blob(['x']), mimeType: 'text/plain' }]),
      ).rejects.toThrow(/path/);
    },
  );

  it('rejects extra files and manifest size lies before installation', async () => {
    const zip = await JSZip.loadAsync(await (await packTool(manifest, inputs())).arrayBuffer());
    zip.file('unlisted', 'x');
    await expect(
      openToolPackage(new Blob([await zip.generateAsync({ type: 'arraybuffer' })]), manifest.id),
    ).rejects.toThrow(/unexpected/);
    zip.remove('unlisted');
    const header = JSON.parse(await zip.file('tool-package.json')!.async('text'));
    header.files[0].size += 1;
    zip.file('tool-package.json', JSON.stringify(header));
    await expect(
      openToolPackage(new Blob([await zip.generateAsync({ type: 'arraybuffer' })]), manifest.id),
    ).rejects.toThrow(/incomplete/);
  });

  it('downloads once, stores one Artifact, and unpacks editable project files locally', async () => {
    const blob = await packTool(manifest, inputs());
    const apiDownload = vi.fn(async () => blob);
    const save = vi.fn(putBlob);
    const tool = await installToolFromPublished(await published(blob), {
      apiDownload,
      putBlob: save,
    });
    expect(apiDownload).toHaveBeenCalledExactlyOnceWith('keeper', 'p5', 'package-artifact');
    expect(save).toHaveBeenCalledTimes(1);
    const services = getServices();
    const artifacts = await services.artifact.findByResource('crux', tool.cruxId);
    expect(artifacts.map((file) => file.meta?.path)).toEqual([TOOL_PACKAGE_PATH]);
    vi.spyOn(templates, 'loadTemplate').mockResolvedValue(null);
    const project = await services.crux.create({ title: 'Editable sketch' });
    await applyTemplateToCrux(project, manifest.id, 'webapp');
    const files = await services.artifact.findByResource('crux', project.id);
    expect(files.map((file) => file.meta?.path).sort()).toEqual(
      inputs()
        .map((file) => file.path)
        .sort(),
    );
    const source = files.find((file) => file.meta?.path === 'src/editor.ts')!;
    expect(await services.artifact.readContent(source.id)).toBe('export const editor = true;');
  });

  it('keeps the previous installation when the download does not match', async () => {
    const old = { id: manifest.id, cruxId: 'previous', installedAt: '2026-09-21' };
    recordInstalledTool(old);
    const expected = await published(await packTool(manifest, inputs()));
    const save = vi.fn(putBlob);
    await expect(
      installToolFromPublished(expected, {
        apiDownload: async () => new Blob(['wrong']),
        putBlob: save,
      }),
    ).rejects.toThrow(/fingerprint/);
    expect(save).not.toHaveBeenCalled();
    expect(installedTool(manifest.id)).toEqual(old);
  });
});
