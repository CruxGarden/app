import { describe, expect, it } from 'vitest';
import { carriesFiles, droppedFiles, namePastedImages, pastedImages } from './composer-files';

const image = (name = 'image.png', type = 'image/png') => new File(['px'], name, { type });
const clipboard = (text: string, files: File[] = [], items: unknown[] = []) => ({
  getData: (format: string) => (format === 'text/plain' ? text : ''),
  files,
  items: items as never,
});

describe('a paste into the composer', () => {
  it('carries an image when the clipboard holds one', () => {
    const shot = image();
    expect(pastedImages(clipboard('', [shot]))).toEqual([shot]);
  });

  it('reads a screenshot offered only as a clipboard item', () => {
    const shot = image();
    const items = [
      { kind: 'string', type: 'text/html', getAsFile: () => null },
      { kind: 'file', type: 'image/png', getAsFile: () => shot },
    ];
    expect(pastedImages(clipboard('', [], items))).toEqual([shot]);
  });

  it('leaves every text paste to the text path, short or long', () => {
    expect(pastedImages(clipboard('just a line'))).toEqual([]);
    expect(pastedImages(clipboard('x'.repeat(5000)))).toEqual([]);
    // A spreadsheet or document selection: words with a picture of them beside.
    expect(pastedImages(clipboard('A1\tB1', [image()]))).toEqual([]);
  });

  it('ignores files that are not images, and an empty clipboard', () => {
    const pdf = new File(['%PDF'], 'brief.pdf', { type: 'application/pdf' });
    expect(pastedImages(clipboard('', [pdf]))).toEqual([]);
    expect(pastedImages(clipboard(''))).toEqual([]);
    expect(pastedImages(null)).toEqual([]);
  });
});

describe('naming pasted images', () => {
  const now = new Date('2026-10-04T09:15:30.123Z');

  it('gives a clipboard image a generated name and keeps its bytes and type', async () => {
    const [named] = namePastedImages([image()], [], now);
    expect(named!.name).toBe('pasted-image-20261004-091530.png');
    expect(named!.type).toBe('image/png');
    expect(await named!.text()).toBe('px');
  });

  it('takes the extension from the image type', () => {
    const names = namePastedImages(
      [
        image('image.png', 'image/jpeg'),
        image('clip', 'image/webp'),
        image('odd.tga', 'image/x-tga'),
      ],
      [],
      now,
    ).map((file) => file.name);
    expect(names).toEqual([
      'pasted-image-20261004-091530.jpg',
      'pasted-image-20261004-091530.webp',
      'pasted-image-20261004-091530.tga',
    ]);
  });

  it('never collides with Artifacts or with another image in the same paste', () => {
    const names = namePastedImages(
      [image(), image(), image()],
      ['Pasted-Image-20261004-091530.png', 'pasted-image-20261004-091530-2.png', 'index.html'],
      now,
    ).map((file) => file.name);
    expect(names).toEqual([
      'pasted-image-20261004-091530-3.png',
      'pasted-image-20261004-091530-4.png',
      'pasted-image-20261004-091530-5.png',
    ]);
  });
});

describe('a drop on the composer', () => {
  const entry = (isDirectory: boolean) => ({
    kind: 'file',
    webkitGetAsEntry: () => ({ isDirectory }),
  });

  it('answers only drags that carry files', () => {
    expect(carriesFiles({ types: ['Files'] })).toBe(true);
    expect(carriesFiles({ types: ['text/plain'] })).toBe(false);
    expect(carriesFiles({ types: ['application/x-crux-pane'] })).toBe(false);
    expect(carriesFiles(null)).toBe(false);
  });

  it('hands over every dropped file, any type, in order', () => {
    const a = image('a.png');
    const b = new File(['hi'], 'notes.txt', { type: 'text/plain' });
    expect(droppedFiles({ files: [a, b], items: [entry(false), entry(false)] })).toEqual({
      files: [a, b],
      folders: 0,
    });
    expect(droppedFiles({ files: [a, b] })).toEqual({ files: [a, b], folders: 0 });
  });

  it('leaves folders out and counts them', () => {
    const a = image('a.png');
    const folder = new File([], 'assets');
    expect(droppedFiles({ files: [folder, a], items: [entry(true), entry(false)] })).toEqual({
      files: [a],
      folders: 1,
    });
  });
});
