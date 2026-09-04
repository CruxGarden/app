import { describe, it, expect } from 'vitest';
import {
  uniqueFileName,
  uniqueItemPath,
  titleFromFileName,
  describeBatch,
  MAX_TRANSCODE_BYTES,
} from './builder-files';

describe('uniqueFileName', () => {
  it('sanitises and keeps a free name as-is', () => {
    expect(uniqueFileName('Harbor Sunset.png', new Set())).toBe('Harbor-Sunset.png');
    expect(uniqueFileName('My Song (final) v2.wav', new Set())).toBe('My-Song-final-v2.wav');
  });
  it('bumps a taken name before the extension', () => {
    const taken = new Set(['IMG_0001.jpg', 'IMG_0001-2.jpg']);
    expect(uniqueFileName('IMG_0001.jpg', taken)).toBe('IMG_0001-3.jpg');
  });
  it('collides on the sanitised name, not the original', () => {
    expect(uniqueFileName('a b.png', new Set(['a-b.png']))).toBe('a-b-2.png');
  });
  it('never produces an empty or dot-only name', () => {
    expect(uniqueFileName('日本語.jpg', new Set())).toBe('file.jpg');
    expect(uniqueFileName('日本語.jpg', new Set(['file.jpg']))).toBe('file-2.jpg');
    expect(uniqueFileName('(((', new Set())).toBe('file');
  });
});

describe('uniqueItemPath', () => {
  const tpl = 'src/pages/posts/{slug}.md';
  it('interpolates slug/title/today', () => {
    const { path, vars } = uniqueItemPath(tpl, 'Harbor Sunset', new Set(), '2026-09-04');
    expect(path).toBe('src/pages/posts/harbor-sunset.md');
    expect(vars).toEqual({ slug: 'harbor-sunset', title: 'Harbor Sunset', today: '2026-09-04' });
  });
  it('dedupes against existing and in-batch paths', () => {
    const taken = new Set(['src/pages/posts/img-0001.md']);
    const a = uniqueItemPath(tpl, 'IMG 0001', taken);
    expect(a.path).toBe('src/pages/posts/img-0001-2.md');
    expect(a.vars.slug).toBe('img-0001-2');
    taken.add(a.path);
    expect(uniqueItemPath(tpl, 'IMG 0001', taken).path).toBe('src/pages/posts/img-0001-3.md');
  });
  it('keeps non-Latin titles apart (they all slugify to "untitled")', () => {
    const taken = new Set<string>();
    const first = uniqueItemPath(tpl, '日本語', taken);
    taken.add(first.path);
    const second = uniqueItemPath(tpl, '中文', taken);
    expect(first.path).toBe('src/pages/posts/untitled.md');
    expect(second.path).toBe('src/pages/posts/untitled-2.md');
  });
});

describe('titleFromFileName', () => {
  it('drops the extension and turns separators into spaces', () => {
    expect(titleFromFileName('wet-leaves.png')).toBe('wet leaves');
    expect(titleFromFileName('IMG_0001.jpg')).toBe('IMG 0001');
    expect(titleFromFileName('Garden Loop.wav')).toBe('Garden Loop');
  });
});

describe('describeBatch', () => {
  it('matches the wording the Builder dialogs promise', () => {
    expect(describeBatch({ added: 2, singular: 'post' })).toBe('Added 2 posts.');
    expect(describeBatch({ added: 1, singular: 'item', converted: 1 })).toBe(
      'Added 1 item (1 converted for the web).',
    );
    expect(describeBatch({ added: 0, singular: 'item', skipped: 2 })).toBe(
      'Added 0 items; skipped 2 non-media files.',
    );
  });
  it('lists failures after the summary', () => {
    expect(describeBatch({ added: 1, singular: 'post', failed: ['x.png: too big'] })).toBe(
      "Added 1 post.\n\nCouldn't add 1 file:\nx.png: too big",
    );
  });
  it('exposes the transcode cap', () => {
    expect(MAX_TRANSCODE_BYTES).toBe(524288000);
  });
});
