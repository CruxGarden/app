import { beforeEach, describe, expect, it } from 'vitest';
import { initServices, getServices } from '../index';
import { applyTemplateToCrux } from '../crux-create';
import { exportCreation } from '../export-creation';
import { installToolFile } from './files';
import { forgetInstalledTool, installToolFromPublished, installedTools } from './installed';
import { toolManifest, toolManifests } from './registry';
import { nativeAppType, isEmbeddedApp } from '../embedded-app';
import { validateNativeDocument } from '../native-app-document';
import { hashContent } from '../sqlite/helpers';
import { putBlob } from '../blobs';
import { openToolPackage, packTool } from './package';
import { exportCrux, importCrux } from '../crux-io';
import { installImportedCreation, installMoodFile } from '../import-installation';
import { captureCurrentMood, exportMoodPackage, getInstalledMoods } from '@/lib/moods/packages';

beforeEach(async () => {
  await initServices();
});

async function authorTool() {
  const services = getServices();
  const draft = await services.crux.create({ title: 'Community notebook' });
  await applyTemplateToCrux(draft, 'tool-starter', 'webapp');
  return services.crux.update(draft.id, { kind: 'tool' });
}

describe('community tool and file installation', () => {
  it('exports and installs an unknown tool, creates an editable project and retains its contract after uninstall', async () => {
    const owner = await authorTool();
    const exported = await exportCreation({ cruxId: owner.id });
    expect(exported.filename).toMatch(/\.cruxtool$/);
    const pkg = await openToolPackage(exported.blob);
    expect(toolManifest(pkg.manifest.id)).toBeNull();
    expect(pkg.files.map((f) => f.path)).toEqual(
      expect.arrayContaining(['LICENSE', 'UPSTREAM.md', 'garden/client.js']),
    );
    const installed = await installToolFile(exported.blob);
    expect(toolManifests().some((m) => m.id === installed.id)).toBe(true);
    const services = getServices();
    const project = await services.crux.create({ title: 'My own notes' });
    const applied = await applyTemplateToCrux(project, installed.id, 'webapp');
    const artifacts = await services.artifact.findByResource('crux', project.id);
    const document = artifacts.find((a) => a.meta?.path === 'data/project.json')!;
    await services.artifact.create({
      resourceId: project.id,
      content: JSON.stringify({ version: 1, app: 'pocket-notes', text: 'A real edit' }),
      meta: { path: 'data/project.json' },
    });
    await validateNativeDocument(
      project.id,
      await services.artifact.readContent(document.id),
      'pocket-notes',
    );
    forgetInstalledTool(installed.id);
    expect(toolManifest(installed.id)).toBeNull();
    expect(nativeAppType(applied.crux)).toBe('pocket-notes');
    expect(isEmbeddedApp(applied.crux)).toBe(true);
    const archive = await exportCrux({ cruxId: project.id, runtime: 'included' });
    const imported = await importCrux({ data: archive.blob, mode: 'clone' });
    expect(await installImportedCreation(imported.cruxId)).toBeNull();
    const reopened = await services.crux.findById(imported.cruxId);
    expect(nativeAppType(reopened)).toBe('pocket-notes');
    const importedFiles = await services.artifact.findByResource('crux', imported.cruxId);
    expect(
      await services.artifact.readContent(
        importedFiles.find((a) => a.meta?.path === 'data/project.json')!,
      ),
    ).toContain('A real edit');
  });

  it('keeps same-named tools from different publications separate and rejects damaged files', async () => {
    const owner = await authorTool();
    const { blob } = await exportCreation({ cruxId: owner.id });
    const { manifest } = await openToolPackage(blob);
    const meta = {
      template: manifest.id,
      toolPackage: { version: 1, artifactId: 'package', fingerprint: await hashContent(blob) },
    };
    const deps = { apiDownload: async () => blob, putBlob };
    const a = await installToolFromPublished(
      { id: 'creator-a', slug: 'notes', author_username: 'alice', meta },
      deps,
    );
    const b = await installToolFromPublished(
      { id: 'creator-b', slug: 'notes', author_username: 'bob', meta },
      deps,
    );
    expect(a.id).not.toBe(b.id);
    expect(toolManifest(a.id)?.name).toBe(manifest.name);
    expect(toolManifest(b.id)?.name).toBe(manifest.name);
    const before = installedTools();
    await expect(installToolFile(new Blob(['not a tool']))).rejects.toThrow();
    expect(installedTools()).toEqual(before);
  });

  it('updates only the installation, leaving existing projects and their editor untouched', async () => {
    const owner = await authorTool();
    const { blob } = await exportCreation({ cruxId: owner.id });
    const pkg = await openToolPackage(blob);
    const publication = (fingerprint: string) => ({
      id: 'update-owner',
      slug: 'notes',
      author_username: 'alice',
      meta: {
        template: pkg.manifest.id,
        toolPackage: { version: 1, artifactId: 'package', fingerprint },
      },
    });
    const first = await installToolFromPublished(publication(await hashContent(blob)), {
      apiDownload: async () => blob,
      putBlob,
    });
    const same = await installToolFromPublished(publication(await hashContent(blob)), {
      apiDownload: async () => blob,
      putBlob,
    });
    expect(same.cruxId).toBe(first.cruxId);
    const services = getServices();
    const project = await services.crux.create({ title: 'Keep my editor' });
    await applyTemplateToCrux(project, first.id, 'webapp');
    const before = await services.artifact.findByResource('crux', project.id);
    const next = await packTool(
      { ...pkg.manifest, releaseVersion: '2.0.0' },
      await Promise.all(
        pkg.files.map(async (file) => ({
          path: file.path,
          mimeType: file.mimeType,
          blob: new Blob([new Uint8Array(await file.read())]),
        })),
      ),
    );
    const update = await installToolFromPublished(publication(await hashContent(next)), {
      apiDownload: async () => next,
      putBlob,
    });
    expect(update.id).toBe(first.id);
    expect(update.cruxId).not.toBe(first.cruxId);
    expect(toolManifest(update.id)?.releaseVersion).toBe('2.0.0');
    expect(await services.artifact.findByResource('crux', project.id)).toEqual(before);
    expect((await services.crux.findById(project.id)).meta?.toolManifest).toMatchObject({
      releaseVersion: '1.0.0',
    });
    expect((await services.crux.findById(update.cruxId)).meta?.toolManifest).toMatchObject({
      releaseVersion: '2.0.0',
    });
  });

  it('installs an exported Tool Crux backup, but never installs an ordinary project as a tool', async () => {
    const owner = await authorTool();
    const archive = await exportCrux({ cruxId: owner.id, runtime: 'included' });
    const imported = await importCrux({ data: archive.blob, mode: 'clone' });
    expect((await installImportedCreation(imported.cruxId))?.kind).toBe('tool');
  });

  it('imports an actual .cruxmood file without applying it', async () => {
    const mood = captureCurrentMood({ name: 'Community blue', id: 'community-blue' });
    const blob = await exportMoodPackage(mood, async () => {
      throw new Error('Unexpected asset');
    });
    const installed = await installMoodFile(blob);
    expect(installed.name).toBe('Community blue');
    expect(getInstalledMoods().some((m) => m.id === installed.id)).toBe(true);
    await expect(installMoodFile(new Blob(['not a mood']))).rejects.toThrow();
  });
});
