import { describe, expect, it, vi } from 'vitest';
import { routeDeepLink, type DeepLinkRoutes } from './install-requests';
import { checkForUpdates, moodUpdateAvailable, toolUpdateAvailable } from './update-notices';
import {
  catalogFromExplore,
  emptyCatalogCopy,
  toolAvailability,
  uninstalledToolCopy,
} from './tool-catalog';
import { formatToolSize, toolSummaryOf, trustRows } from '@/components/explore/tool-trust';
import type { InstalledTool } from './crux-tools/installed';

function routes(overrides: Partial<DeepLinkRoutes> = {}) {
  return {
    askToInstall: vi.fn(),
    openExplore: vi.fn(),
    findLocalCrux: vi.fn(async () => null),
    openCrux: vi.fn(),
    notify: vi.fn(),
    ...overrides,
  } satisfies DeepLinkRoutes;
}

describe('install from the website (deep links)', () => {
  it('asks to install and opens Explore — nothing is installed by the link', async () => {
    const r = routes();
    const outcome = await routeDeepLink({ kind: 'install', type: 'tool', cruxId: 'abc' }, r);
    expect(outcome).toBe('asked-to-install');
    expect(r.askToInstall).toHaveBeenCalledWith({ type: 'tool', cruxId: 'abc' });
    expect(r.openExplore).toHaveBeenCalledWith('tool');
    // The only side effects are asking and showing; there is no install route at all.
    expect(Object.keys(r).some((key) => /^install/i.test(key))).toBe(false);
  });

  it('opens a Crux only when this garden has it', async () => {
    const missing = routes();
    expect(await routeDeepLink({ kind: 'open-crux', cruxId: 'x' }, missing)).toBe('crux-not-here');
    expect(missing.openCrux).not.toHaveBeenCalled();
    expect(missing.notify).toHaveBeenCalled();

    const here = routes({ findLocalCrux: vi.fn(async () => ({ id: 'x', kind: null })) });
    expect(await routeDeepLink({ kind: 'open-crux', cruxId: 'x' }, here)).toBe('opened-crux');
    expect(here.openCrux).toHaveBeenCalledWith({ id: 'x', kind: null });
  });

  it('ignores other kinds', async () => {
    const r = routes();
    expect(await routeDeepLink({ kind: 'billing-return', status: 'success' }, r)).toBe('ignored');
    expect(r.askToInstall).not.toHaveBeenCalled();
  });
});

describe('update notices', () => {
  it('compares tool package fingerprints', () => {
    expect(toolUpdateAvailable({ fingerprint: 'a' }, 'b')).toBe(true);
    expect(toolUpdateAvailable({ fingerprint: 'a' }, 'a')).toBe(false);
    expect(toolUpdateAvailable(null, 'b')).toBe(false);
    expect(toolUpdateAvailable({ fingerprint: 'a' }, undefined)).toBe(false);
  });

  it('compares Mood revisions and never nags about unknown ones', () => {
    expect(moodUpdateAvailable({ revision: 'r1' }, 'r2')).toBe(true);
    expect(moodUpdateAvailable({ revision: 'r1' }, 'r1')).toBe(false);
    expect(moodUpdateAvailable({}, 'r2')).toBe(false);
    expect(moodUpdateAvailable({ revision: 'r1' }, undefined)).toBe(false);
  });

  it('lists only items whose publication moved on, skipping failures', async () => {
    const tool: InstalledTool = {
      id: 'installed-t1',
      cruxId: 'local',
      publishedCruxId: 't1',
      author: 'ana',
      slug: 'sketch',
      fingerprint: 'old',
      installedAt: '2026-10-01',
    };
    const notices = await checkForUpdates({
      tools: () => ({ [tool.id]: tool, file: { id: 'file', cruxId: 'x', installedAt: '' } }),
      moods: () => [
        { id: 'm1', name: 'Dusk' },
        { id: 'm2', name: 'Dawn' },
      ],
      sources: () => ({
        m1: { publishedCruxId: 'p1', author: 'bo', slug: 'dusk', revision: 'r1' },
        m2: { publishedCruxId: 'p2', author: 'bo', slug: 'dawn', revision: 'r1' },
      }),
      getCrux: async (_user, slug) => {
        if (slug === 'sketch')
          return { id: 't1', slug, meta: { toolPackage: { fingerprint: 'new' } } };
        if (slug === 'dusk') return { id: 'p1', slug, meta: { mood: { revision: 'r2' } } };
        throw new Error('offline');
      },
    });
    expect(notices.map((n) => [n.kind, n.id])).toEqual([
      ['tool', 'installed-t1'],
      ['mood', 'm1'],
    ]);
    expect(notices[0]!.listing.author_username).toBe('ana');
  });
});

describe('the live catalog in Add Crux and Explore', () => {
  it('only offers Explore for a tool the catalog has', () => {
    const catalog = catalogFromExplore([
      { id: '1', kind: 'tool', meta: { template: 'p5-app' } },
      { id: '2', kind: 'mood', meta: { template: 'nope' } },
    ]);
    expect(toolAvailability(catalog, 'p5-app')).toBe('in-catalog');
    expect(toolAvailability(catalog, 'blender')).toBe('coming-soon');
    expect(toolAvailability({ state: 'loading' }, 'x')).toBe('checking');
    expect(toolAvailability({ state: 'offline' }, 'x')).toBe('offline');

    expect(uninstalledToolCopy('p5', 'in-catalog').offerExplore).toBe(true);
    const soon = uninstalledToolCopy('Blender', 'coming-soon');
    expect(soon.offerExplore).toBe(false);
    expect(soon.message).toMatch(/coming soon/);
    expect(soon.message).not.toMatch(/Explore/);
    expect(uninstalledToolCopy('Blender', 'offline').offerExplore).toBe(false);
  });

  it('says honestly that there are no community Tools yet', () => {
    expect(emptyCatalogCopy('tools').title).toBe('No community Tools yet');
    expect(emptyCatalogCopy('tools').body).toMatch(/Tools you make and share appear here/);
    expect(emptyCatalogCopy('moods').title).toBe('No community Moods yet');
  });
});

describe('tool trust details', () => {
  it('reads the API summary and falls back to the listing author', () => {
    const summary = toolSummaryOf({
      author_username: 'ana',
      toolSummary: {
        name: 'Sketch',
        version: '1.2.0',
        upstreamUrl: 'https://p5js.org/',
        license: 'LGPL-2.1',
        sizeBytes: 3 * 1024 * 1024,
        permissions: ['document', 'file-drops', 7],
        sandboxed: true,
      },
    });
    expect(summary).toMatchObject({ publisher: 'ana', permissions: ['document', 'file-drops'] });
    const rows = trustRows(summary!);
    expect(rows.map((r) => r.label)).toEqual([
      'Publisher',
      'Version',
      'Size',
      'Built on',
      'Licence',
      'Can use',
    ]);
    expect(rows.find((r) => r.label === 'Built on')).toMatchObject({
      value: 'p5js.org',
      href: 'https://p5js.org/',
    });
    expect(rows.find((r) => r.label === 'Size')?.value).toBe('3 MB');
  });

  it('refuses malformed summaries and non-https upstream links', () => {
    expect(toolSummaryOf({})).toBeNull();
    expect(toolSummaryOf({ toolSummary: { name: 'X' } })).toBeNull();
    const plain = toolSummaryOf({
      toolSummary: { name: 'X', publisher: 'p', upstreamUrl: 'javascript:alert(1)' },
    });
    expect(plain?.upstreamUrl).toBeUndefined();
    expect(trustRows(plain!).at(-1)?.value).toBe('Nothing beyond its own editor');
  });

  it('formats sizes', () => {
    expect(formatToolSize(null)).toBe('');
    expect(formatToolSize(10)).toBe('1 KB');
    expect(formatToolSize(2.5 * 1024 ** 3)).toBe('2.5 GB');
  });
});
