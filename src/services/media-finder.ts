/**
 * Find media (V1-GAPS-PLAN.md §2.7): openly licensed images, sounds and video a
 * person can use in a Crux, with the license and the author kept beside the
 * file. Two catalogues, no keys: Openverse (WordPress; images and audio,
 * indexing Wikimedia, Flickr, Freesound, Jamendo and more) and Wikimedia
 * Commons (video). Freesound direct waits on its commercial API terms.
 *
 * Every request goes through the main process (`media.fetch`): no page origin,
 * no CORS, https only, a size cap. With CRUX_MEDIA_API set (tests) the same
 * paths are asked of that base instead.
 */
import { Capability, can } from '@/lib/platform';
import { getServices } from './index';
import { hashContent } from './sqlite/helpers';

export type MediaKind = 'image' | 'audio' | 'video';
export interface MediaItem {
  provider: 'openverse' | 'wikimedia-commons';
  id: string;
  kind: MediaKind;
  title: string;
  creator: string;
  creatorUrl: string | null;
  license: string;
  licenseVersion: string | null;
  licenseUrl: string | null;
  attribution: string;
  /** The page a person can open to see the work in its catalogue. */
  sourceUrl: string;
  /** The file itself. */
  fileUrl: string;
  thumbnail: string | null;
  filetype: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
}
export interface MediaOrigin {
  version: 1;
  provider: MediaItem['provider'];
  id: string;
  kind: MediaKind;
  title: string;
  creator: string;
  creatorUrl: string | null;
  license: string;
  licenseVersion: string | null;
  licenseUrl: string | null;
  attribution: string;
  sourceUrl: string;
  fileUrl: string;
  path: string;
  fetched: string;
}
const OPENVERSE = 'https://api.openverse.org';
const COMMONS = 'https://commons.wikimedia.org';
const bridge = () => (can(Capability.ProjectFolder) ? window.electronAPI?.media ?? null : null);
const base = () => window.electronAPI?.test?.mediaApiBase ?? null;
const openverseUrl = (path: string) => (base() ? `${base()}/openverse${path}` : `${OPENVERSE}${path}`);
const commonsUrl = (path: string) => (base() ? `${base()}/commons${path}` : `${COMMONS}${path}`);

async function getJson(url: string): Promise<unknown> {
  const api = bridge();
  if (!api) throw new Error('Finding media needs the desktop app.');
  const result = await api.fetch(url, { maxBytes: 8_000_000 });
  if (!result.ok) throw new Error(`The catalogue answered ${result.status}.`);
  return JSON.parse(new TextDecoder().decode(result.bytes));
}
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Openverse's result rows as items (the same shape for images and audio). */
export function fromOpenverse(rows: unknown, kind: 'image' | 'audio'): MediaItem[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && typeof (r as Record<string, unknown>).url === 'string')
    .map((r) => ({
      provider: 'openverse' as const,
      id: str(r.id),
      kind,
      title: str(r.title, 'Untitled'),
      creator: str(r.creator, 'Unknown'),
      creatorUrl: str(r.creator_url) || null,
      license: str(r.license).toUpperCase(),
      licenseVersion: str(r.license_version) || null,
      licenseUrl: str(r.license_url) || null,
      attribution: str(r.attribution) || `"${str(r.title, 'Untitled')}" by ${str(r.creator, 'Unknown')} is licensed under ${str(r.license).toUpperCase()}.`,
      sourceUrl: str(r.foreign_landing_url) || str(r.url),
      fileUrl: str(r.url),
      thumbnail: str(r.thumbnail) || null,
      filetype: str(r.filetype) || null,
      duration: num(r.duration),
      width: num(r.width),
      height: num(r.height),
    }));
}
/** Wikimedia Commons query pages (generator=search + imageinfo/extmetadata) as items. */
export function fromCommons(pages: unknown): MediaItem[] {
  if (!pages || typeof pages !== 'object') return [];
  const strip = (html: string) => html.replace(/<[^>]+>/g, '').trim();
  return Object.values(pages as Record<string, Record<string, unknown>>)
    .map((page): MediaItem | null => {
      const info = Array.isArray(page.imageinfo) ? (page.imageinfo[0] as Record<string, unknown>) : null;
      if (!info || typeof info.url !== 'string') return null;
      const meta = (info.extmetadata ?? {}) as Record<string, { value?: unknown }>;
      const title = str(page.title).replace(/^File:/, '').replace(/\.[^.]+$/, '');
      const creator = strip(str(meta.Artist?.value, 'Unknown'));
      const license = str(meta.LicenseShortName?.value, str(meta.License?.value, 'See source'));
      return {
        provider: 'wikimedia-commons',
        id: String(page.pageid ?? page.title ?? ''),
        kind: 'video',
        title,
        creator,
        creatorUrl: null,
        license,
        licenseVersion: null,
        licenseUrl: str(meta.LicenseUrl?.value) || null,
        attribution: `"${title}" by ${creator}, Wikimedia Commons, ${license}.`,
        sourceUrl: str(info.descriptionurl) || `${COMMONS}/wiki/${encodeURIComponent(str(page.title))}`,
        fileUrl: str(info.url),
        thumbnail: str(info.thumburl) || null,
        filetype: str(info.mime).split('/')[1] || null,
        duration: num(info.duration),
        width: num(info.width),
        height: num(info.height),
      };
    })
    .filter((x): x is MediaItem => !!x);
}

export async function searchMedia(kind: MediaKind, query: string, page = 1): Promise<MediaItem[]> {
  const q = query.trim();
  if (!q) return [];
  if (kind === 'video') {
    const url = commonsUrl(
      `/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=20&gsroffset=${(page - 1) * 20}&gsrsearch=${encodeURIComponent(`filetype:video ${q}`)}&prop=imageinfo&iiprop=url|mime|size|extmetadata&iiurlwidth=320`,
    );
    const data = (await getJson(url)) as { query?: { pages?: unknown } };
    return fromCommons(data.query?.pages);
  }
  const url = openverseUrl(`/v1/${kind === 'image' ? 'images' : 'audio'}/?q=${encodeURIComponent(q)}&page_size=20&page=${page}`);
  const data = (await getJson(url)) as { results?: unknown };
  return fromOpenverse(data.results, kind);
}

const safe = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'media';
export const defaultFolder = (kind: MediaKind) => (kind === 'image' ? 'images' : kind === 'audio' ? 'audio' : 'media');
export const originPath = async (path: string) => `media-origins/${await hashContent(path)}.json`;

/** Bring an item into a Crux: the file at `folder/<name>` and its origin beside it. */
export async function addMedia(cruxId: string, item: MediaItem, folder: string = defaultFolder(item.kind)): Promise<{ path: string; origin: MediaOrigin }> {
  const api = bridge();
  if (!api) throw new Error('Using media needs the desktop app.');
  const dir = folder.replace(/^\/+|\/+$/g, '');
  if (!dir || dir.split('/').some((p) => !p || p === '.' || p === '..' || p.startsWith('.')) || !/^[\w /.-]+$/.test(dir))
    throw new Error('Choose a folder inside the Crux.');
  const result = await api.fetch(item.fileUrl, { maxBytes: item.kind === 'video' ? 512_000_000 : 64_000_000 });
  if (!result.ok || !result.bytes.byteLength) throw new Error(`The file could not be fetched (${result.status}).`);
  const mime = result.mimeType || `${item.kind}/${item.filetype ?? 'octet-stream'}`;
  const ext = (item.filetype || mime.split('/')[1] || 'bin').replace(/^jpeg$/, 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const path = `${dir}/${safe(item.title)}-${safe(item.id).slice(0, 12)}.${ext}`;
  const { artifact } = getServices();
  await artifact.upload({ resourceId: cruxId, blob: new Blob([result.bytes as BlobPart], { type: mime }), mimeType: mime, meta: { path } });
  const origin: MediaOrigin = {
    version: 1,
    provider: item.provider,
    id: item.id,
    kind: item.kind,
    title: item.title,
    creator: item.creator,
    creatorUrl: item.creatorUrl,
    license: item.license,
    licenseVersion: item.licenseVersion,
    licenseUrl: item.licenseUrl,
    attribution: item.attribution,
    sourceUrl: item.sourceUrl,
    fileUrl: item.fileUrl,
    path,
    fetched: new Date().toISOString(),
  };
  await artifact.create({ resourceId: cruxId, content: JSON.stringify(origin, null, 2), mimeType: 'application/json', meta: { path: await originPath(path) } });
  return { path, origin };
}
