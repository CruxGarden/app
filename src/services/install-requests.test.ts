import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPublishedPackage, type ExploreCrux } from '@/api/public';
import { installFallbackCopy, lookUpPublished } from './install-requests';

const MOOD_ID = '7d4f2c1e-9a3b-4c5d-8e6f-0a1b2c3d4e5f';

/** A link-only Mood: published, not Discoverable, so Explore never lists it. */
const linkOnlyMood: ExploreCrux = {
  id: MOOD_ID,
  slug: 'dusk-garden',
  title: 'Dusk Garden',
  kind: 'mood',
  meta: {},
  tags: [],
  created: '2026-10-01T00:00:00.000Z',
  updated: '2026-10-02T00:00:00.000Z',
  author_username: 'alice',
  author_display_name: 'Alice',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Install links look their item up by id (ADR 0085), never by paging Explore. */
describe('install link lookup', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('finds a link-only Mood by id through GET /explore/cruxes/:id', async () => {
    const fetchMock = vi.fn(async () => json(linkOnlyMood));
    vi.stubGlobal('fetch', fetchMock);
    const found = await lookUpPublished({ type: 'mood', cruxId: MOOD_ID }, getPublishedPackage);
    expect(found).toEqual({ kind: 'found', crux: linkOnlyMood });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toMatch(new RegExp(`/explore/cruxes/${MOOD_ID}$`));
    // One request for one item: Explore is not paged.
    expect(url).not.toMatch(/[?&]page=/);
  });

  it('a 404 is a missing item, and the confirmation offers the file route instead', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ message: 'Not found' }, 404)),
    );
    const result = await lookUpPublished({ type: 'mood', cruxId: MOOD_ID }, getPublishedPackage);
    expect(result).toEqual({ kind: 'missing' });
    const copy = installFallbackCopy('mood', 'missing');
    expect(copy.message).toContain('not published on crux.garden any more');
    expect(copy.message).toContain('.cruxmood');
    expect(copy.file).toBe('.cruxmood');
    expect(copy.link).toBe('Find Moods on crux.garden');
  });

  it('offline (fetch rejects) or a server error falls back without installing anything', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    expect(await lookUpPublished({ type: 'tool', cruxId: MOOD_ID }, getPublishedPackage)).toEqual({
      kind: 'offline',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({}, 503)),
    );
    expect(await lookUpPublished({ type: 'tool', cruxId: MOOD_ID }, getPublishedPackage)).toEqual({
      kind: 'offline',
    });
    const copy = installFallbackCopy('tool', 'offline');
    expect(copy.message).toContain('Could not reach crux.garden');
    expect(copy.message).toContain('.cruxtool');
    expect(copy.link).toBe('Find Tools on crux.garden');
  });

  it('a link whose type does not match the published item is missing, not installed as the other kind', async () => {
    const lookup = vi.fn(async () => linkOnlyMood);
    expect(await lookUpPublished({ type: 'tool', cruxId: MOOD_ID }, lookup)).toEqual({
      kind: 'missing',
    });
    expect(lookup).toHaveBeenCalledWith(MOOD_ID, undefined);
  });

  it('a malformed id (400) is missing too', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({}, 400)),
    );
    expect(await lookUpPublished({ type: 'mood', cruxId: 'nope' }, getPublishedPackage)).toEqual({
      kind: 'missing',
    });
  });
});
