/**
 * Update notices for installed Tools and Moods (customer review, "Expected at
 * v1"): on start and every few hours the app compares what it installed with
 * what the creator has published since. It only tells — Settings shows a
 * quiet count and "Install update" per item. Nothing updates by itself.
 */
import { useEffect, useState } from 'react';
import { getSetting, setSetting } from '@/services/settings';
import type { InstalledTool } from '@/services/crux-tools/installed';

export const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;
/** Where installed Moods came from (a Mood package does not carry its source listing). */
export const MOOD_SOURCES_KEY = 'cruxgarden:installedMoodSources';
const CHANGED = 'crux:update-notices-changed';

export interface MoodSource {
  publishedCruxId: string;
  author: string;
  slug: string;
  /** `meta.mood.revision` of the publication that was installed. */
  revision?: string;
}

/** A newer published package than the installed one. */
export function toolUpdateAvailable(
  installed: Pick<InstalledTool, 'fingerprint'> | null | undefined,
  publishedFingerprint: string | null | undefined,
): boolean {
  return (
    !!installed &&
    !!installed.fingerprint &&
    !!publishedFingerprint &&
    installed.fingerprint !== publishedFingerprint
  );
}

/** A Mood publication changed since it was installed. Unknown revisions never nag. */
export function moodUpdateAvailable(
  source: Pick<MoodSource, 'revision'> | null | undefined,
  publishedRevision: unknown,
): boolean {
  return (
    !!source?.revision &&
    typeof publishedRevision === 'string' &&
    !!publishedRevision &&
    publishedRevision !== source.revision
  );
}

export function moodSources(): Record<string, MoodSource> {
  try {
    const parsed = JSON.parse(getSetting(MOOD_SOURCES_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Remember where an installed Mood came from, keyed by its package id. */
export function recordMoodSource(moodId: string, source: MoodSource): void {
  try {
    setSetting(MOOD_SOURCES_KEY, JSON.stringify({ ...moodSources(), [moodId]: source }));
  } catch {
    /* Without settings there is simply no update notice for it. */
  }
}

export interface UpdateNotice {
  kind: 'tool' | 'mood';
  /** Installed tool id, or the Mood package id. */
  id: string;
  name: string;
  /** The publication as the public API lists it now — enough to install the update. */
  listing: {
    id: string;
    slug: string;
    title?: string;
    author_username: string;
    meta?: Record<string, unknown> | null;
  };
}

export interface UpdateCheckDeps {
  tools: () => Record<string, InstalledTool>;
  moods: () => { id: string; name: string }[];
  sources: () => Record<string, MoodSource>;
  getCrux: (
    username: string,
    slug: string,
  ) => Promise<{ id: string; slug: string; title?: string; meta?: Record<string, unknown> }>;
}

/** Compare every installed Tool and Mood that came from a publication. Failures skip the item. */
export async function checkForUpdates(deps: UpdateCheckDeps): Promise<UpdateNotice[]> {
  const notices: UpdateNotice[] = [];
  for (const tool of Object.values(deps.tools())) {
    if (!tool.author || !tool.slug || !tool.publishedCruxId) continue;
    const listing = await deps.getCrux(tool.author, tool.slug).catch(() => null);
    if (!listing || listing.id !== tool.publishedCruxId) continue;
    const reference = listing.meta?.toolPackage as { fingerprint?: string } | undefined;
    if (toolUpdateAvailable(tool, reference?.fingerprint))
      notices.push({
        kind: 'tool',
        id: tool.id,
        name: tool.manifest?.name ?? listing.title ?? tool.slug,
        listing: { ...listing, author_username: tool.author },
      });
  }
  const sources = deps.sources();
  for (const mood of deps.moods()) {
    const source = sources[mood.id];
    if (!source) continue;
    const listing = await deps.getCrux(source.author, source.slug).catch(() => null);
    if (!listing || listing.id !== source.publishedCruxId) continue;
    const revision = (listing.meta?.mood as { revision?: unknown } | undefined)?.revision;
    if (moodUpdateAvailable(source, revision))
      notices.push({
        kind: 'mood',
        id: mood.id,
        name: mood.name,
        listing: { ...listing, author_username: source.author },
      });
  }
  return notices;
}

// ── The app-wide check ───────────────────────────────────────────────────────

let current: UpdateNotice[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let running: Promise<void> | null = null;

function announce() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGED));
}

async function defaultDeps(): Promise<UpdateCheckDeps> {
  const [{ publicApi }, { installedTools }, { getInstalledMoods }] = await Promise.all([
    import('@/api'),
    import('@/services/crux-tools/installed'),
    import('@/lib/moods/packages'),
  ]);
  return {
    tools: installedTools,
    moods: () => getInstalledMoods().map((pkg) => ({ id: pkg.id, name: pkg.name })),
    sources: moodSources,
    getCrux: (username, slug) =>
      publicApi.getCruxBySlug(username, slug) as Promise<{
        id: string;
        slug: string;
        title?: string;
        meta?: Record<string, unknown>;
      }>,
  };
}

/** Check now (deduplicated while one runs). */
export function refreshUpdateNotices(deps?: UpdateCheckDeps): Promise<void> {
  running ??= (async () => {
    try {
      current = await checkForUpdates(deps ?? (await defaultDeps()));
      announce();
    } catch {
      /* offline: keep what we knew */
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Start checking on app start and every few hours; returns a stop function. */
export function startUpdateChecks(): () => void {
  void refreshUpdateNotices();
  timer ??= setInterval(() => void refreshUpdateNotices(), CHECK_EVERY_MS);
  return () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
}

/** Forget one notice once its update is installed. */
export function dismissUpdateNotice(kind: UpdateNotice['kind'], id: string) {
  current = current.filter((notice) => !(notice.kind === kind && notice.id === id));
  announce();
}

export function useUpdateNotices(): UpdateNotice[] {
  const [notices, setNotices] = useState(current);
  useEffect(() => {
    const update = () => setNotices(current);
    update();
    window.addEventListener(CHANGED, update);
    return () => window.removeEventListener(CHANGED, update);
  }, []);
  return notices;
}

/** Install the newer publication, exactly as Explore's Install does. */
export async function installUpdate(notice: UpdateNotice): Promise<void> {
  const [{ publicApi }, { putBlob }] = await Promise.all([
    import('@/api'),
    import('@/services/blobs'),
  ]);
  if (notice.kind === 'tool') {
    const { installToolFromPublished } = await import('@/services/crux-tools/installed');
    await installToolFromPublished(notice.listing, {
      apiDownload: publicApi.downloadArtifact,
      putBlob,
    });
  } else {
    const [{ installMoodFromPublished }, { publishBaseUrlFor, hasRemotePublishOrigin }] =
      await Promise.all([import('@/lib/moods/publish-mood'), import('@/lib/public-url')]);
    const pkg = await installMoodFromPublished(notice.listing, {
      publishBaseUrl: publishBaseUrlFor,
      fetchBlob: async (url) => {
        if (!hasRemotePublishOrigin()) return null;
        const response = await fetch(url);
        if (!response.ok || (response.headers.get('content-type') || '').startsWith('text/html'))
          return null;
        return response.blob();
      },
      apiArtifacts: publicApi.getArtifacts,
      apiDownload: publicApi.downloadArtifact,
      putBlob,
    });
    if (!pkg) throw new Error('The update could not be downloaded.');
  }
  dismissUpdateNotice(notice.kind, notice.id);
}
