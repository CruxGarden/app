import type { Artifact } from '@/api/types';

// ── Path utilities ──────────────────────────────────────

/**
 * Normalize a virtual file path: resolve `.`, `..`, strip leading `/` and `./`,
 * collapse double slashes. Returns a clean path like `images/logo.png`.
 */
export function normalizePath(path: string): string {
  const parts = path.split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      resolved.pop(); // go up (clamp at root — can't go above)
    } else {
      resolved.push(part);
    }
  }
  return resolved.join('/');
}

/**
 * Resolve a relative reference against a base directory.
 * e.g. resolveRelative('../style.css', 'pages') → 'style.css'
 *      resolveRelative('./logo.png', 'images') → 'images/logo.png'
 *      resolveRelative('style.css', '')         → 'style.css'
 */
export function resolveRelative(ref: string, baseDir: string): string {
  if (ref.startsWith('/')) return normalizePath(ref);
  const combined = baseDir ? `${baseDir}/${ref}` : ref;
  return normalizePath(combined);
}

/** Get the directory portion of a file path. */
export function dirname(filePath: string): string {
  const idx = filePath.lastIndexOf('/');
  return idx === -1 ? '' : filePath.slice(0, idx);
}

// ── Path map ────────────────────────────────────────────

/**
 * Build a map of normalized path → artifact ID.
 * Registers each artifact under its full normalized path and its filename.
 */
export function buildPathMap(artifacts: Artifact[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const a of artifacts) {
    const raw = a.meta?.path || a.filename || a.id;
    const norm = normalizePath(raw);
    map.set(norm, a.id);
    // Filename-only fallback (first one wins)
    const filename = norm.split('/').pop();
    if (filename && !map.has(filename)) map.set(filename, a.id);
  }
  return map;
}

/**
 * Look up a relative reference in the path map, trying (in order):
 * 1. Resolved against baseDir (handles ../foo, ./foo, foo)
 * 2. Normalized as-is (handles absolute-style /images/foo.png)
 * 3. Filename-only fallback
 */
export function resolveRef(
  ref: string,
  baseDir: string,
  pathMap: Map<string, string>,
): string | undefined {
  // 1. Resolve against the current file's directory
  const resolved = resolveRelative(ref, baseDir);
  if (pathMap.has(resolved)) return pathMap.get(resolved);

  // 2. Try normalized as-is (no base)
  const norm = normalizePath(ref);
  if (pathMap.has(norm)) return pathMap.get(norm);

  // 3. Filename-only fallback
  const filename = norm.split('/').pop() || '';
  if (filename && pathMap.has(filename)) return pathMap.get(filename);

  return undefined;
}

// ── HTML rewriting ──────────────────────────────────────

/** Regex matching src="..." and href="..." attributes. */
const ATTR_RE = /(src|href)=(["'])([^"']+)\2/gi;

/** Regex matching CSS url(...) — with or without quotes. */
const CSS_URL_RE = /url\(\s*(["']?)([^"')]+)\1\s*\)/gi;

function isAbsoluteUrl(value: string): boolean {
  return (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('data:') ||
    value.startsWith('#') ||
    value.startsWith('//')
  );
}

/** Try to resolve a relative value, falling back through baseDir → normalized → filename. */
function tryResolve(
  value: string,
  baseDir: string,
  resolver: (relativePath: string) => string | null,
): string | null {
  return resolver(resolveRelative(value, baseDir)) ?? resolver(normalizePath(value));
}

/** Rewrite src/href attributes in an HTML string. */
function rewriteAttrs(
  html: string,
  baseDir: string,
  resolver: (relativePath: string) => string | null,
): string {
  return html.replace(ATTR_RE, (_match, attr: string, quote: string, value: string) => {
    if (isAbsoluteUrl(value)) {
      return `${attr}=${quote}${value}${quote}`;
    }
    const resolved = tryResolve(value, baseDir, resolver);
    return resolved ? `${attr}=${quote}${resolved}${quote}` : `${attr}=${quote}${value}${quote}`;
  });
}

/** Rewrite CSS url() references in a string (inline styles, <style> blocks). */
function rewriteCssUrls(
  css: string,
  baseDir: string,
  resolver: (relativePath: string) => string | null,
): string {
  return css.replace(CSS_URL_RE, (_match, quote: string, value: string) => {
    if (isAbsoluteUrl(value)) {
      return `url(${quote}${value}${quote})`;
    }
    const resolved = tryResolve(value, baseDir, resolver);
    return resolved ? `url(${quote}${resolved}${quote})` : `url(${quote}${value}${quote})`;
  });
}

/**
 * Rewrite relative references in HTML: src/href attributes AND CSS url() values
 * (in <style> blocks, inline style attributes, etc.).
 *
 * @param html      — the raw HTML string
 * @param baseDir   — directory of the current HTML file (e.g. 'pages' for 'pages/index.html')
 * @param resolver  — receives the cleaned relative path and returns a URL or null
 */
export function rewriteHtmlUrls(
  html: string,
  baseDir: string,
  resolver: (relativePath: string) => string | null,
): string {
  let result = rewriteAttrs(html, baseDir, resolver);
  result = rewriteCssUrls(result, baseDir, resolver);
  return result;
}

/**
 * Extract all relative references from HTML (src/href attributes + CSS url() values),
 * normalized against a base dir (deduped).
 */
export function extractRelativeRefs(html: string, baseDir: string): string[] {
  const refs = new Set<string>();

  // src/href attributes
  let match: RegExpExecArray | null;
  const attrRe = new RegExp(ATTR_RE.source, 'gi');
  while ((match = attrRe.exec(html)) !== null) {
    const value = match[3]!;
    if (!isAbsoluteUrl(value)) {
      refs.add(resolveRelative(value, baseDir));
    }
  }

  // CSS url() values
  const cssRe = new RegExp(CSS_URL_RE.source, 'gi');
  while ((match = cssRe.exec(html)) !== null) {
    const value = match[2]!;
    if (!isAbsoluteUrl(value)) {
      refs.add(resolveRelative(value, baseDir));
    }
  }

  return Array.from(refs);
}
