import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTICES_PATH, loadNotices, parseNotices, resetNoticesCache } from './notices';

// The shape vite-plugin-notices.ts emits.
const RULE = '\n\n' + '='.repeat(72) + '\n\n';
const FILE =
  'Third-party renderer and worker notices. Each component retains its own license.\n' +
  'GSAP uses its Standard No Charge license, not an OSI license.\n' +
  'Bundled Crux Tools carry separate notices in their files.\n\n' +
  [
    '                                 Apache License\n                           Version 2.0, January 2004\n\nTERMS AND CONDITIONS',
    'react@19.1.0\nDeclared license: "MIT"\n\nMIT License\n\nCopyright (c) Meta Platforms, Inc.',
    '@scope/dual@2.0.0\nDeclared license: [{"type":"MIT"},{"type":"Apache-2.0"}]\n\nDual text',
    'odd@0.0.1\nNo declared line here\n\nBody',
  ].join(RULE);

describe('open-source notices', () => {
  beforeEach(() => resetNoticesCache());

  it('splits the build’s file into one entry per component', () => {
    const notices = parseNotices(FILE)!;
    expect(notices.preamble.split('\n')).toHaveLength(3);
    expect(notices.preamble).toContain('Bundled Crux Tools carry separate notices');
    expect(notices.entries.map((e) => [e.name, e.license])).toEqual([
      ['Apache License', null],
      ['react@19.1.0', 'MIT'],
      ['@scope/dual@2.0.0', '[{"type":"MIT"},{"type":"Apache-2.0"}]'],
      ['odd@0.0.1', null],
    ]);
    expect(notices.entries[1]!.text).toBe('MIT License\n\nCopyright (c) Meta Platforms, Inc.');
    expect(notices.entries[0]!.text).toContain('TERMS AND CONDITIONS');
    expect(notices.entries[3]!.text).toBe('No declared line here\n\nBody');
  });

  it('reads Windows line endings the same way', () => {
    expect(parseNotices(FILE.replace(/\n/g, '\r\n'))!.entries).toHaveLength(4);
  });

  it('is not fooled by a dev server answering with the app’s own page', () => {
    expect(
      parseNotices('<!doctype html><html><body><div id="root"></div></body></html>'),
    ).toBeNull();
    expect(parseNotices('')).toBeNull();
  });

  it('fetches lazily, once, from the app root', async () => {
    const fetcher = vi.fn(async () => new Response(FILE));
    expect(fetcher).not.toHaveBeenCalled();
    const [first, second] = await Promise.all([loadNotices(fetcher), loadNotices(fetcher)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(NOTICES_PATH);
    expect(first).toBe(second);
    expect(first!.entries).toHaveLength(4);
  });

  it('answers null for a build without the file, and retries after a failed read', async () => {
    expect(await loadNotices(async () => new Response('missing', { status: 404 }))).toBeNull();
    resetNoticesCache();
    const failing = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await loadNotices(failing)).toBeNull();
    expect((await loadNotices(async () => new Response(FILE)))!.entries).toHaveLength(4);
  });
});
