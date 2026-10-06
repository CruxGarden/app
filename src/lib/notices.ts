/**
 * Open-source notices (EF09). The build collects every bundled package's
 * licence text into one file, `THIRD-PARTY-NOTICES.txt` at the app's root
 * (vite-plugin-notices.ts). It is large, so it is fetched only when someone
 * opens the notices view, and split here into one entry per package.
 */
export const NOTICES_PATH = '/THIRD-PARTY-NOTICES.txt';
const HEADER = 'Third-party renderer and worker notices.';
const RULE = '\n\n' + '='.repeat(72) + '\n\n';

export interface NoticeEntry {
  /** `name@version`, or a title for the leading texts. */
  name: string;
  /** As the package declares it; null for the shared licence texts. */
  license: string | null;
  text: string;
}

export interface Notices {
  /** The file's own opening lines. */
  preamble: string;
  entries: NoticeEntry[];
}

/** Null when the text is not the notices file (a dev server answers every path with the app). */
export function parseNotices(text: string): Notices | null {
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized.startsWith(HEADER)) return null;
  const [first = '', ...sections] = normalized.split(RULE);
  // The opening lines, then the shared licence text the plugin puts first.
  const gap = first.indexOf('\n\n');
  const preamble = (gap < 0 ? first : first.slice(0, gap)).trim();
  const shared = gap < 0 ? '' : first.slice(gap).trim();
  const entries: NoticeEntry[] = [];
  if (shared)
    entries.push({
      name: (shared.split('\n').find((line) => line.trim()) ?? 'Licence text').trim(),
      license: null,
      text: shared,
    });
  for (const section of sections) {
    const [name = '', declared = '', ...rest] = section.split('\n');
    const match = /^Declared license: (.*)$/.exec(declared);
    let license: string | null = null;
    if (match) {
      try {
        const value: unknown = JSON.parse(match[1]!);
        license = typeof value === 'string' ? value : JSON.stringify(value);
      } catch {
        license = match[1]!;
      }
    }
    entries.push({
      name: name.trim() || 'Unnamed component',
      license,
      text: (match ? rest : [declared, ...rest]).join('\n').trim(),
    });
  }
  return { preamble, entries };
}

let cached: Promise<Notices | null> | null = null;
/** Fetched once per session, on first use. Null when this build carries no notices file. */
export function loadNotices(fetcher: typeof fetch = fetch): Promise<Notices | null> {
  cached ??= fetcher(NOTICES_PATH)
    .then((response) => (response.ok ? response.text() : ''))
    .then(parseNotices)
    .catch(() => {
      cached = null; // a failed read may be retried
      return null;
    });
  return cached;
}
/** Tests only. */
export function resetNoticesCache() {
  cached = null;
}
