/**
 * Pure decision logic for the Workshop's preview pane.
 *
 * `previewFor()` reproduces EditorContent's render chain (form → source →
 * preview arms → binary views) as a discriminated union, so the "what should
 * this pane show" question is testable without React or the DOM.
 *
 * `mountedIframeSrc()` answers the orthogonal question of whether the
 * always-on preview iframe should be mounted at all — for HTML files and
 * running Site Cruxes it stays mounted off-screen even in source mode so
 * thumbnail auto-capture keeps working.
 *
 * No window access here: platform facts (is the preview served by the desktop
 * static/dev server?) arrive as the `desktopServed` input, which callers feed
 * from `can(Capability.PreviewServer)`.
 */

import { basename } from '@/lib/artifact-path';
import { getExtension, isPreviewable } from '@/lib/monacoLanguages';
import { isImageMime, isVideoMime } from '@/lib/mime';

// ── Path predicates ──

export function isHtmlPath(path: string): boolean {
  const ext = getExtension(path);
  return ext === 'html' || ext === 'htm';
}

export function isConfigJsonPath(path: string): boolean {
  return /^config\.json$/i.test(basename(path));
}

/** The crux thumbnail file — excluded from auto-capture to avoid feedback loops. */
export function isPreviewJpgPath(path: string): boolean {
  return path.toLowerCase() === 'preview.jpg';
}

// ── Decision input / output ──

export interface SitePreviewInput {
  /** Whether the open crux is a Site Crux runnable on this platform. */
  isSite: boolean;
  /** Dev-server URL for the current file's route (null until ready). */
  url: string | null;
  phase: string;
  detail: string;
}

export interface PreviewInput {
  /** Canonical artifact path (pathOf). */
  path: string;
  viewMode: 'source' | 'preview' | 'form';
  mimeType: string;
  /** Crux meta carries a formSchema (template cruxes). */
  hasFormSchema: boolean;
  /** Text content is loaded (content !== null). */
  hasContent: boolean;
  /** Binary blob URL is available (blobUrl !== null). */
  hasBlob: boolean;
  site: SitePreviewInput;
  /** Static preview URL for plain HTML cruxes (null while pending/disabled). */
  previewUrl: string | null;
  /** Preview is served by the desktop preview/dev server — pass can(Capability.PreviewServer). */
  desktopServed: boolean;
}

export type PreviewTarget =
  | { kind: 'form' }
  | { kind: 'source' }
  | { kind: 'iframe'; url: string; localBase: string | null }
  | { kind: 'site-status'; phase: string; detail: string }
  | { kind: 'loading' }
  | { kind: 'svg' }
  | { kind: 'markdown' }
  | { kind: 'empty' }
  | { kind: 'image' }
  | { kind: 'video' }
  | { kind: 'blob' }
  | { kind: 'unavailable' };

function iframeTarget(url: string, desktopServed: boolean): PreviewTarget {
  // localBase drives the Copy/Open URL bar: the served base URL without the
  // cache-busting ?v= query. Only meaningful when the URL is a real local
  // server address (desktop), not a service-worker path (web).
  const localBase = desktopServed ? (url.split('?')[0] ?? url) : null;
  return { kind: 'iframe', url, localBase };
}

/**
 * Decide what the Workshop pane shows for a file. Mirrors the original
 * EditorContent branch order exactly:
 *
 * 1. form   — config.json with a form schema, in form mode
 * 2. source — Monaco, any text file in source mode
 * 3. preview arms (text content + previewable extension):
 *    site crux → iframe (dev server up) or site-status panel;
 *    html      → iframe (preview URL ready) or loading;
 *    svg / md|mdx → dedicated renderers;
 *    other previewables (e.g. .astro off-desktop) → empty
 * 4. binary views — image, video, generic blob download, or unavailable
 */
export function previewFor(input: PreviewInput): PreviewTarget {
  const { path, viewMode, mimeType, site } = input;
  const ext = getExtension(path);

  // Form mode: schema-driven editor for config.json
  if (viewMode === 'form' && isConfigJsonPath(path) && input.hasFormSchema && input.hasContent) {
    return { kind: 'form' };
  }

  // Source mode: Monaco (text content only; binaries fall through)
  if (viewMode === 'source' && input.hasContent) {
    return { kind: 'source' };
  }

  // Preview mode arms
  if (viewMode === 'preview' && input.hasContent && isPreviewable(path)) {
    if (site.isSite) {
      if (site.url) return iframeTarget(site.url, input.desktopServed);
      return { kind: 'site-status', phase: site.phase, detail: site.detail };
    }
    if (isHtmlPath(path)) {
      if (input.previewUrl) return iframeTarget(input.previewUrl, input.desktopServed);
      return { kind: 'loading' };
    }
    if (ext === 'svg') return { kind: 'svg' };
    if (ext === 'md' || ext === 'mdx') return { kind: 'markdown' };
    // Previewable extension with no renderer on this platform (e.g. .astro on web)
    return { kind: 'empty' };
  }

  // Binary views
  if (input.hasBlob && isImageMime(mimeType)) return { kind: 'image' };
  if (input.hasBlob && isVideoMime(mimeType)) return { kind: 'video' };
  if (input.hasBlob) return { kind: 'blob' };
  return { kind: 'unavailable' };
}

/**
 * The src of the always-mounted preview iframe, or null when it shouldn't
 * exist. Mounted for plain HTML files (any view mode — off-screen in source
 * mode for auto-capture) and for Site Cruxes once the dev server is up.
 */
export function mountedIframeSrc(
  input: Pick<PreviewInput, 'path' | 'site' | 'previewUrl'>,
): string | null {
  const { site } = input;
  const effective = site.isSite ? site.url : input.previewUrl;
  const mounted = (isHtmlPath(input.path) && !site.isSite) || (site.isSite && !!site.url);
  return mounted && effective ? effective : null;
}
