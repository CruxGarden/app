/**
 * `crux-garden://` deep links (ADR 0085) — the whole accepted grammar.
 *
 * Pure and dependency-free on purpose: Electron main parses every incoming
 * link with it, and the renderer and the public website import it (through
 * `app/src/services/deep-links.ts`) to build links and re-check payloads,
 * without pulling any Electron code into a web bundle.
 *
 * Accepted, and nothing else:
 *   crux-garden://billing/return?status=success|cancel[&session_id=cs_…]
 *   crux-garden://install/tool/<uuid>
 *   crux-garden://install/mood/<uuid>
 *   crux-garden://open/crux/<uuid>
 * Each may carry exactly one trailing slash before the query.
 *
 * A link only ever names an intent and an id. It never carries a URL, a
 * path, or anything that is acted on without the person confirming it.
 */

export const DEEP_LINK_SCHEME = 'crux-garden';
export const DEEP_LINK_PREFIX = `${DEEP_LINK_SCHEME}://`;
export const DEEP_LINK_MAX_LENGTH = 512;

export type DeepLink =
  | { kind: 'billing-return'; status: 'success' | 'cancel'; sessionId?: string }
  | { kind: 'install'; type: 'tool' | 'mood'; cruxId: string }
  | { kind: 'open-crux'; cruxId: string };

export type DeepLinkKind = DeepLink['kind'];

export type DeepLinkParse = { ok: true; link: DeepLink } | { ok: false; reason: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SESSION_ID = /^cs_[A-Za-z0-9_]+$/;
const SESSION_ID_MAX = 255;
/** Unreserved characters plus the four delimiters the grammar uses. No `%`,
 * `#`, `@`, `:`, `\`, whitespace or control characters can reach a route. */
const BODY = /^[A-Za-z0-9\-._~/?=&]*$/;

const refuse = (reason: string): DeepLinkParse => ({ ok: false, reason });

function crux(id: string): string | null {
  const lower = id.toLowerCase();
  return UUID.test(lower) ? lower : null;
}

function parseQuery(query: string): Map<string, string> | string {
  const fields = new Map<string, string>();
  for (const pair of query.split('&')) {
    const parts = pair.split('=');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return 'malformed query';
    if (fields.has(parts[0])) return 'repeated query field';
    fields.set(parts[0], parts[1]);
  }
  return fields;
}

/** Parse one candidate link. Anything outside the grammar is refused with a
 * short reason that never echoes the input. */
export function parseDeepLink(raw: unknown): DeepLinkParse {
  if (typeof raw !== 'string') return refuse('not a string');
  if (raw.length === 0 || raw.length > DEEP_LINK_MAX_LENGTH) return refuse('length');
  if (raw.slice(0, DEEP_LINK_PREFIX.length).toLowerCase() !== DEEP_LINK_PREFIX)
    return refuse('scheme');
  const body = raw.slice(DEEP_LINK_PREFIX.length);
  if (!BODY.test(body)) return refuse('characters');
  const [route = '', query, extra] = body.split('?');
  if (extra !== undefined) return refuse('malformed query');
  // Windows and some browsers append one trailing slash; tolerate exactly one.
  const segments = (route.endsWith('/') ? route.slice(0, -1) : route).split('/');
  if (segments.some((segment) => segment === '')) return refuse('path');

  if (segments.length === 2 && segments[0] === 'billing' && segments[1] === 'return') {
    if (query === undefined) return refuse('missing status');
    const fields = parseQuery(query);
    if (typeof fields === 'string') return refuse(fields);
    for (const key of fields.keys())
      if (key !== 'status' && key !== 'session_id') return refuse('unknown query field');
    const status = fields.get('status');
    if (status !== 'success' && status !== 'cancel') return refuse('status');
    const sessionId = fields.get('session_id');
    if (sessionId === undefined) return { ok: true, link: { kind: 'billing-return', status } };
    if (sessionId.length > SESSION_ID_MAX || !SESSION_ID.test(sessionId))
      return refuse('session id');
    return { ok: true, link: { kind: 'billing-return', status, sessionId } };
  }

  if (query !== undefined) return refuse('unexpected query');

  if (
    segments.length === 3 &&
    segments[0] === 'install' &&
    (segments[1] === 'tool' || segments[1] === 'mood')
  ) {
    const cruxId = crux(segments[2] ?? '');
    if (!cruxId) return refuse('crux id');
    return { ok: true, link: { kind: 'install', type: segments[1], cruxId } };
  }

  if (segments.length === 3 && segments[0] === 'open' && segments[1] === 'crux') {
    const cruxId = crux(segments[2] ?? '');
    if (!cruxId) return refuse('crux id');
    return { ok: true, link: { kind: 'open-crux', cruxId } };
  }

  return refuse('route');
}

/** Build the link for an intent ("Open in Crux Garden", a checkout return
 * URL). Throws for anything the parser would refuse. */
export function deepLinkUrl(link: DeepLink): string {
  let url: string;
  switch (link?.kind) {
    case 'billing-return':
      url =
        `${DEEP_LINK_PREFIX}billing/return?status=${link.status}` +
        (link.sessionId === undefined ? '' : `&session_id=${link.sessionId}`);
      break;
    case 'install':
      url = `${DEEP_LINK_PREFIX}install/${link.type}/${link.cruxId}`;
      break;
    case 'open-crux':
      url = `${DEEP_LINK_PREFIX}open/crux/${link.cruxId}`;
      break;
    default:
      throw new Error('Unknown deep link');
  }
  const parsed = parseDeepLink(url);
  if (!parsed.ok) throw new Error(`Invalid deep link (${parsed.reason})`);
  return url;
}

/** True only for a payload exactly as the parser produces it (no extra keys). */
export function isDeepLink(value: unknown): value is DeepLink {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  let url: string;
  try {
    url = deepLinkUrl(value as DeepLink);
  } catch {
    return false;
  }
  const parsed = parseDeepLink(url);
  if (!parsed.ok) return false;
  const expected = parsed.link as Record<string, unknown>;
  const actual = value as Record<string, unknown>;
  const keys = Object.keys(actual);
  return (
    keys.length === Object.keys(expected).length &&
    keys.every((key) => actual[key] === expected[key])
  );
}

/** Command-line arguments that look like links (Windows/Linux deliver them
 * this way, on first launch and to the primary instance). Still unparsed. */
export function deepLinkArguments(argv: readonly string[]): string[] {
  return argv.filter(
    (arg) =>
      typeof arg === 'string' &&
      arg.slice(0, DEEP_LINK_SCHEME.length + 1).toLowerCase() === `${DEEP_LINK_SCHEME}:`,
  );
}
