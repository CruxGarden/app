import { describe, it, expect } from 'vitest';
import { fromOpenverse, fromCommons, defaultFolder } from './media-finder';

describe('Find media catalogues', () => {
  it('reads Openverse rows for images and audio', () => {
    const items = fromOpenverse(
      [
        { id: 'abc', title: 'Seedlings', url: 'https://x/seed.jpg', thumbnail: 'https://x/t.jpg', creator: 'Ana', creator_url: 'https://x/ana', license: 'by', license_version: '4.0', license_url: 'https://cc/by', attribution: '"Seedlings" by Ana is licensed under CC BY 4.0.', foreign_landing_url: 'https://flickr/1', filetype: 'jpg', width: 800, height: 600 },
        { id: 'nope' },
      ],
      'image',
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ provider: 'openverse', kind: 'image', license: 'BY', fileUrl: 'https://x/seed.jpg', sourceUrl: 'https://flickr/1', width: 800 });
    const audio = fromOpenverse([{ id: 'a1', title: 'Chime', url: 'https://x/c.mp3', creator: 'Bo', license: 'cc0', duration: 1200, filetype: 'mp3' }], 'audio');
    expect(audio[0]).toMatchObject({ kind: 'audio', duration: 1200, license: 'CC0' });
    expect(audio[0]!.attribution).toContain('Chime');
  });
  it('reads Wikimedia Commons pages for video', () => {
    const items = fromCommons({
      '12': { pageid: 12, title: 'File:Bees at work.webm', imageinfo: [{ url: 'https://upload/bees.webm', descriptionurl: 'https://commons/File:Bees', mime: 'video/webm', thumburl: 'https://upload/bees.jpg', width: 640, height: 360, extmetadata: { Artist: { value: '<a href="x">Cy</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://cc/by-sa/4.0' } } }] },
      '13': { pageid: 13, title: 'File:No info.webm' },
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ provider: 'wikimedia-commons', kind: 'video', title: 'Bees at work', creator: 'Cy', license: 'CC BY-SA 4.0', filetype: 'webm' });
  });
  it('places each kind in its own folder', () => {
    expect([defaultFolder('image'), defaultFolder('audio'), defaultFolder('video')]).toEqual(['images', 'audio', 'media']);
  });
});
