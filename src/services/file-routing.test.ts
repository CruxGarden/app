import { readFile } from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { localApiFixture } from '@/test/local-api-fixture';
import { loadTemplate } from '@/templates';
import { initServices, getServices } from './index';
import { pathOf } from '@/lib/artifact-path';
import { routeFile, routeFolder, isArchive, stem, startFromFiles } from './file-routing';

describe('file-drop routing', () => {
  it('sends each kind of file to the tool that opens it', () => {
    expect(routeFile('Résumé.docx')).toMatchObject({
      templateId: 'notes',
      folder: 'inbox',
      open: expect.anything(),
    });
    expect(routeFile('journal.md')).toMatchObject({
      templateId: 'notes',
      folder: 'notebook/Imported',
    });
    expect(routeFile('budget.xlsx')!.templateId).toBe('tool-univer');
    expect(routeFile('photo.JPG')!.templateId).toBe('minipaint-app');
    expect(routeFile('logo.svg')!.templateId).toBe('svgedit-app');
    expect(routeFile('clip.mov')!.templateId).toBe('opencut-app');
    expect(routeFile('take.wav')!.templateId).toBe('audiomass-app');
    expect(routeFile('paper.pdf')!.templateId).toBe('bentopdf-app');
    expect(routeFile('analysis.ipynb')!.templateId).toBe('jupyterlite-app');
    expect(routeFile('screens.moq')!.templateId).toBe('moqira');
    expect(routeFile('index.html')!.templateId).toBe('blank');
    expect(routeFile('setup.exe')).toBeNull();
    expect(isArchive('a.crux')).toBe(true);
    expect(isArchive('a.cruxspace')).toBe(true);
  });
  it('a folder with Markdown is a notebook; anything else a Blank Crux', () => {
    const file = new File([''], 'x');
    expect(routeFolder([{ path: 'Chapters/One.md', file }])!.templateId).toBe('notes');
    expect(
      routeFolder([
        { path: 'index.html', file },
        { path: 'style.css', file },
      ])!.templateId,
    ).toBe('blank');
    expect(routeFolder([])).toBeNull();
  });
  it('titles come from the file', () => {
    expect(stem('inbox/My letter: draft?.docx')).toBe('My letter- draft-');
    expect(stem('.docx')).toBe('File');
  });
});

describe('start-from-files admission', () => {
  const native = localApiFixture();
  let gardenId: string;

  beforeEach(async () => {
    await initServices();
    gardenId = (await native().client.enterLocalGarden!()).id;
    // The actual Notes template requests its packaged assets over fetch in the
    // app. This service fixture serves those same bytes from the source tree.
    const notes = (await loadTemplate('notes'))!;
    const assets = new Map(
      notes.files
        .filter((file) => file.encoding === 'asset-url')
        .map((file) => [file.content, new URL(`../../notes-crux/${file.path}`, import.meta.url)]),
    );
    vi.stubGlobal('fetch', async (url: string) => {
      const file = assets.get(url);
      return file
        ? new Response(new Uint8Array(await readFile(file)))
        : new Response('', { status: 404 });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    { name: 'Markdown and converted text', folder: null, paths: ['note.md', 'note.txt'] },
    { name: 'sanitized filenames', folder: 'Website', paths: ['page:one.html', 'page?one.html'] },
    { name: 'case-insensitive filenames', folder: 'Website', paths: ['PAGE.html', 'page.html'] },
    {
      name: 'Unicode-equivalent filenames',
      folder: 'Website',
      paths: ['Café.html', 'Cafe\u0301.html'],
    },
    {
      name: 'a file and its child path',
      folder: 'Website',
      paths: ['page.html', 'page.html/child.html'],
    },
  ])('refuses $name before creating or overwriting work', async ({ folder, paths }) => {
    const { crux, artifact } = getServices();
    const existing = await crux.create({ title: 'Keep existing work', gardenId });
    await artifact.create({
      resourceId: existing.id,
      content: 'Existing bytes',
      meta: { path: 'keep.txt' },
    });
    const before = (await crux.listAll()).map((item) => item.id).sort();
    const files = paths.map((path, index) => ({
      path,
      file: new File([`Original document ${index + 1}`], path.split('/').pop()!),
    }));

    await expect(startFromFiles(files, folder, gardenId)).rejects.toThrow(
      /conflict|same destination/i,
    );
    expect((await crux.listAll()).map((item) => item.id).sort()).toEqual(before);
    expect(await Promise.all(files.map(({ file }) => file.text()))).toEqual([
      'Original document 1',
      'Original document 2',
    ]);
    await native().restart();
    expect((await crux.listAll()).map((item) => item.id).sort()).toEqual(before);
    const kept = (await artifact.findByResource('crux', existing.id))[0]!;
    expect(await artifact.readContent(kept)).toBe('Existing bytes');
  });

  it('preserves distinct note bodies after text conversion and native restart', async () => {
    const files = [
      { path: 'note.md', file: new File(['Markdown original'], 'note.md') },
      { path: 'second.txt', file: new File(['Text original'], 'second.txt') },
    ];
    const created = await startFromFiles(files, null, gardenId);
    expect(created.placed).toEqual([
      'notebook/Imported/note/note.md',
      'notebook/Imported/note/second.md',
    ]);
    await native().restart();
    const { artifact } = getServices();
    const imported = (await artifact.findByResource('crux', created.cruxId)).filter((file) =>
      created.placed.includes(pathOf(file)),
    );
    expect(imported).toHaveLength(2);
    for (const [index, path] of created.placed.entries()) {
      expect(await artifact.readContent(imported.find((file) => pathOf(file) === path)!)).toBe(
        await files[index]!.file.text(),
      );
    }
  });
});
