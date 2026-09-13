/**
 * The guestbook block (V1-GAPS-PLAN.md §2.8): visitors leave a note on a
 * published site; the notes live in the Crux's own Crux Store under the public
 * key `guestbook`. This service puts the block into a site Crux: the script as
 * an Artifact, and the snippet into the site's home page when there is one.
 *
 * The block itself is `src/lib/guestbook/guestbook.js`, written verbatim.
 */
import GUESTBOOK_SCRIPT from '@/lib/guestbook/guestbook.js?raw';
import { pathOf } from '@/lib/artifact-path';
import { getServices } from './index';

/** The Crux Store key the block keeps its entries under (public mode). */
export const GUESTBOOK_KEY = 'guestbook';

export interface GuestbookPlacement {
  /** Where the script goes: `public/guestbook.js` for an Astro site, `guestbook.js` otherwise. */
  scriptPath: string;
  /** The page the snippet goes into, or null when the site has no recognisable home page. */
  pagePath: string | null;
  /** True for an Astro site (`src/pages/index.astro`). */
  astro: boolean;
}

const STATIC_SNIPPET =
  '<section data-guestbook></section>\n<script src="guestbook.js" defer></script>';
const ASTRO_SNIPPET =
  '<section data-guestbook></section>\n<script is:inline src="/guestbook.js" defer></script>';

/** The snippet a page needs, for the placement. */
export function guestbookSnippet(placement: GuestbookPlacement): string {
  return placement.astro ? ASTRO_SNIPPET : STATIC_SNIPPET;
}

/** Where the block goes in a site with these files. */
export function guestbookPlacement(paths: string[]): GuestbookPlacement {
  const has = (p: string) => paths.includes(p);
  if (has('src/pages/index.astro'))
    return { scriptPath: 'public/guestbook.js', pagePath: 'src/pages/index.astro', astro: true };
  if (has('index.html'))
    return { scriptPath: 'guestbook.js', pagePath: 'index.html', astro: false };
  return { scriptPath: 'guestbook.js', pagePath: null, astro: false };
}

/** True when the page already carries the block. */
export function pageHasGuestbook(page: string): boolean {
  return /data-guestbook/.test(page);
}

/** The page with the snippet in it: before `</body>` when there is one, else at the end. */
export function withGuestbook(page: string, snippet: string): string {
  if (pageHasGuestbook(page)) return page;
  const close = page.search(/<\/body>/i);
  if (close >= 0) return `${page.slice(0, close)}${snippet}\n${page.slice(close)}`;
  return `${page.replace(/\s*$/, '')}\n${snippet}\n`;
}

/** True when the Crux carries the block script. */
export function hasGuestbook(paths: string[]): boolean {
  return paths.includes(guestbookPlacement(paths).scriptPath);
}

export interface AddGuestbookResult {
  scriptPath: string;
  pagePath: string | null;
  /** Whether the snippet was put into the page on this call. */
  inserted: boolean;
  /** Whether the page already carried the block. */
  present: boolean;
  snippet: string;
}

/**
 * Put the block into the Crux: write the script, and the snippet into the
 * home page when there is one that does not carry it yet.
 */
export async function addGuestbook(cruxId: string): Promise<AddGuestbookResult> {
  const { artifact } = getServices();
  const artifacts = await artifact.findByResource('crux', cruxId);
  const paths = artifacts.map((a) => pathOf(a));
  const placement = guestbookPlacement(paths);
  const snippet = guestbookSnippet(placement);
  await artifact.create({
    resourceId: cruxId,
    resourceType: 'crux',
    content: GUESTBOOK_SCRIPT,
    mimeType: 'text/javascript',
    meta: { path: placement.scriptPath },
  });
  let inserted = false;
  let present = false;
  if (placement.pagePath) {
    const page = artifacts.find((a) => pathOf(a) === placement.pagePath)!;
    const text = await (await artifact.downloadBlob(page.id)).text();
    present = pageHasGuestbook(text);
    if (!present) {
      await artifact.create({
        resourceId: cruxId,
        resourceType: 'crux',
        content: withGuestbook(text, snippet),
        mimeType: placement.astro ? 'text/plain' : 'text/html',
        meta: { path: placement.pagePath },
      });
      inserted = true;
    }
  }
  return {
    scriptPath: placement.scriptPath,
    pagePath: placement.pagePath,
    inserted,
    present,
    snippet,
  };
}

/** The tool result, in words. */
export function describeAddGuestbook(r: AddGuestbookResult): string {
  const where = r.pagePath
    ? r.inserted
      ? `The block is in ${r.pagePath}, before </body>.`
      : `${r.pagePath} already carried the block.`
    : `No home page was found (index.html or src/pages/index.astro); put this where the book should appear:\n${r.snippet}`;
  return `Guestbook added: ${r.scriptPath} written. ${where} Entries land in the Crux Store under the public key "${GUESTBOOK_KEY}" (the Store pane lists them); visitors sign in by email on the shared site before signing.`;
}
