import { describe, it, expect } from 'vitest';
import { actionsFor } from './ConvertActions';

/**
 * Contextual conversion (Daniel, 2026-09-21): what a file *is* decides what
 * the Artifacts pane offers. The arguments are the same ones the collaborator
 * would pass, so they are worth holding still.
 */
describe('what a file can become', () => {
  it('offers a video a streaming version first, and never converts it to itself', () => {
    const labels = actionsFor('video/clip.mov').map((a) => a.label);
    expect(labels[0]).toBe('For streaming');
    expect(labels).toEqual(
      expect.arrayContaining([
        'To MP4',
        'To WebM',
        'To GIF',
        'Poster',
        'Frames',
        'Take the audio out',
      ]),
    );
    expect(actionsFor('video/clip.mp4').map((a) => a.label)).not.toContain('To MP4');
    const streaming = actionsFor('video/clip.mov')[0]!;
    const args = streaming.args('video/clip.mov');
    expect(streaming.tool).toBe('ffmpeg');
    expect(args).toContain('-movflags');
    expect(args).toContain('+faststart');
    expect(args.at(-1)).toBe('video/clip-web.mp4');
    // Never over the source.
    for (const a of actionsFor('video/clip.mov'))
      expect(a.args('video/clip.mov').at(-1)).not.toBe('video/clip.mov');
  });

  it('offers audio a streaming version and an evened-out one', () => {
    const actions = actionsFor('audio/take.wav');
    expect(actions.map((a) => a.label)).toEqual([
      'For streaming',
      'To MP3',
      'Even out the loudness',
    ]);
    expect(actions.every((a) => a.tool === 'ffmpeg')).toBe(true);
    expect(actions.at(-1)!.args('audio/take.wav')).toContain('loudnorm=I=-16:TP=-1.5:LRA=11');
  });

  it('offers a picture web sizes through ImageMagick, and the folder as a video through ffmpeg', () => {
    const actions = actionsFor('images/card.png');
    const byLabel = Object.fromEntries(actions.map((a) => [a.label, a]));
    expect(byLabel['Web ready']!.tool).toBe('magick');
    expect(byLabel['Web ready']!.args('images/card.png').at(-1)).toBe('images/card-web.webp');
    expect(byLabel['Thumbnail']!.args('images/card.png')).toContain('512x512^');
    expect(byLabel['Favicon']!.args('images/card.png')).toContain('icon:auto-resize=16,32,48,64');
    expect(byLabel['To PNG']).toBeUndefined(); // it already is one
    expect(byLabel['Folder to video']!.tool).toBe('ffmpeg');
    expect(byLabel['Folder to video']!.args('images/card.png').at(-1)).toBe('exports/images.mp4');
  });

  it('offers a document the other formats, through pandoc, minus the one it is', () => {
    const actions = actionsFor('notes/brief.md');
    expect(actions.every((a) => a.tool === 'pandoc')).toBe(true);
    expect(actions.map((a) => a.label)).toEqual([
      'To Word',
      'To HTML',
      'To EPUB',
      'To PDF',
      'To plain text',
    ]);
    expect(actions[0]!.args('notes/brief.md')).toEqual([
      'notes/brief.md',
      '-o',
      'notes/brief.docx',
    ]);
    // A page and a book stand on their own.
    const html = actions.find((a) => a.label === 'To HTML')!;
    expect(html.args('notes/brief.md')).toContain('--standalone');
    expect(actionsFor('notes/brief.docx').map((a) => a.label)).toContain('To Markdown');
  });

  it('offers nothing for a file no tool here can convert', () => {
    expect(actionsFor('data/project.json')).toEqual([]);
    expect(actionsFor('src/main.ts')).toEqual([]);
  });
});
