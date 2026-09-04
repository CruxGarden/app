import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A real local HTTP stand-in for api.crux.garden. Launch the app with
 * CRUX_API_URL pointing at `url` (see launchApp({ env })).
 *
 * Covers the connected-account publish flow: request code → login → profile
 * → author sync → crux upsert → publish → tags. State is per instance: the
 * first publish takes the create path (GET /cruxes/:id → 404), later ones
 * the update path. `state.failPublish` makes publish 500 so the UI's failure
 * surfacing can be exercised.
 *
 * A real server rather than page.route: Playwright's fulfilled non-2xx
 * responses reach the Electron renderer as status 0, which is not how the
 * network behaves — and that exact case is one the publish path must handle.
 */
export interface PublishedFile {
  path: string;
  mime: string;
  bytes: Buffer;
}

export interface MockApi {
  url: string;
  state: {
    failPublish: boolean;
    publishedVersion: number;
    /** The most recently created crux (publish.spec's single-crux view) */
    crux: Record<string, unknown> | null;
    /** Every crux by id */
    cruxes: Record<string, Record<string, unknown>>;
    /** Files received by POST /cruxes/:id/publish, by crux id */
    published: Record<string, PublishedFile[]>;
    /** Sync store: garden backup + synced crux archives, and transfer this period */
    sync: {
      garden: { bytes: number; syncedAt: string } | null;
      cruxes: Record<string, { bytes: number; title: string; slug: string; updatedAt: string }>;
      up: number;
      down: number;
    };
    domains: Array<
      Record<string, unknown> & {
        id: string;
        cruxId: string;
        hostname: string;
        status: string;
        error: string | null;
        verifies: number;
      }
    >;
  };
  /** Every request seen (`METHOD /path -> status`), for debugging. */
  log: string[];
  close: () => Promise<void>;
}

const AUTHOR = {
  id: 'author-api-1',
  username: 'tester',
  displayName: 'Tester',
  accountId: 'acct-1',
  homeId: 'home-1',
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-01-01T00:00:00.000Z',
};

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/** Minimal multipart/form-data parser: fields + files, enough for the publish request. */
function parseMultipart(
  body: Buffer,
  contentType: string,
): {
  fields: Record<string, string>;
  files: { name: string; filename: string; mime: string; bytes: Buffer }[];
} {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType);
  const boundary = m?.[1] ?? m?.[2];
  const out = {
    fields: {} as Record<string, string>,
    files: [] as { name: string; filename: string; mime: string; bytes: Buffer }[],
  };
  if (!boundary) return out;
  const delim = Buffer.from(`--${boundary}`);
  let pos = body.indexOf(delim);
  while (pos !== -1) {
    pos += delim.length;
    if (body.slice(pos, pos + 2).toString() === '--') break;
    const headEnd = body.indexOf('\r\n\r\n', pos);
    if (headEnd === -1) break;
    const head = body.slice(pos, headEnd).toString();
    const next = body.indexOf(delim, headEnd);
    const content = body.slice(headEnd + 4, next === -1 ? body.length : next - 2); // strip trailing CRLF
    const name = /name="([^"]+)"/.exec(head)?.[1] ?? '';
    const filename = /filename="([^"]*)"/.exec(head)?.[1];
    const mime =
      /Content-Type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim() ?? 'application/octet-stream';
    if (filename !== undefined) out.files.push({ name, filename, mime, bytes: content });
    else out.fields[name] = content.toString();
    pos = next;
  }
  return out;
}

export async function startMockApi(): Promise<MockApi> {
  const state: MockApi['state'] = {
    failPublish: false,
    publishedVersion: 0,
    crux: null,
    cruxes: {},
    published: {},
    sync: { garden: null, cruxes: {}, up: 0, down: 0 },
    domains: [],
  };
  const log: string[] = [];

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const method = req.method ?? 'GET';
    const parsedUrl = new URL(req.url ?? '/', 'http://x');
    const path = parsedUrl.pathname;
    const send = (status: number, body: unknown) => {
      log.push(`${method} ${path} -> ${status}`);
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': '*',
      });
      res.end(body === null ? '' : JSON.stringify(body));
    };
    const sendRaw = (status: number, mime: string, bytes: Buffer) => {
      log.push(`${method} ${path} -> ${status}`);
      res.writeHead(status, {
        'Content-Type': mime,
        'Content-Length': bytes.length,
        'Access-Control-Allow-Origin': '*',
      });
      res.end(bytes);
    };
    if (method === 'OPTIONS') return send(204, null);
    const rawBuf = await readBody(req);
    const raw = rawBuf.toString();
    const bodyJson = (): Record<string, unknown> => {
      try {
        return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      } catch {
        return {}; // multipart (publish) — parsed separately
      }
    };
    const publicCrux = (c: Record<string, unknown>) => ({
      ...c,
      author_username: AUTHOR.username,
      author_display_name: AUTHOR.displayName,
      author_meta: {},
      tags: ((c.meta as Record<string, unknown> | undefined)?.tags as string[] | undefined) ?? [],
    });

    // ── Explore (public) ──
    if (path === '/explore/tags') return send(200, { data: [] });
    if (path === '/explore' && method === 'GET') {
      const kind = parsedUrl.searchParams.get('kind');
      const q = parsedUrl.searchParams.get('q')?.toLowerCase();
      const items = Object.values(state.cruxes)
        .filter((c) => c.visibility === 'public' && c.discoverable !== false)
        .filter((c) => !kind || c.kind === kind)
        .filter(
          (c) =>
            !q ||
            String(c.title ?? '')
              .toLowerCase()
              .includes(q),
        )
        .map(publicCrux);
      res.setHeader('Pagination', JSON.stringify({ currentPage: 1, lastPage: 1 }));
      return send(200, items);
    }
    // ── Public author routes: crux by slug, its artifacts, downloads ──
    const pub = path.match(
      /^\/authors\/([^/]+)\/cruxes\/([^/]+)(\/artifacts(?:\/([^/]+)\/download)?)?$/,
    );
    if (pub && method === 'GET') {
      const crux = Object.values(state.cruxes).find((c) => c.slug === pub[2]);
      if (!crux) return send(404, { statusCode: 404, message: 'Crux not found' });
      const files = state.published[crux.id as string] ?? [];
      if (!pub[3]) return send(200, crux);
      if (!pub[4])
        return send(
          200,
          files.map((f, i) => ({
            id: `art-${i}`,
            filename: f.path.split('/').pop(),
            mimeType: f.mime,
            meta: { path: f.path },
          })),
        );
      const idx = parseInt(pub[4].replace('art-', ''), 10);
      const f = files[idx];
      if (!f) return send(404, { statusCode: 404, message: 'No file' });
      return sendRaw(200, f.mime, f.bytes);
    }

    if (path === '/auth/code' && method === 'POST') return send(200, { message: 'sent' });
    if (path === '/auth/login' && method === 'POST')
      return send(200, { accessToken: 'test-access', refreshToken: 'test-refresh' });
    if (path === '/auth/profile' && method === 'GET')
      return send(200, {
        id: 'acct-1',
        email: 'tester@example.com',
        role: 'author',
        homeId: 'home-1',
        created: AUTHOR.created,
        updated: AUTHOR.updated,
        author: AUTHOR,
      });
    if (path === '/auth/logout') return send(200, {});
    if (path === '/authors/check-username') return send(200, { available: true });
    if (path.startsWith('/authors/') && method === 'PATCH')
      return send(200, { ...AUTHOR, ...bodyJson() });
    if (path.startsWith('/authors/') && path.endsWith('/avatar')) return send(200, AUTHOR);

    if (path === '/cruxes' && method === 'POST') {
      const body = bodyJson();
      state.crux = {
        ...body,
        id: (body.id as string) || `crux-${Object.keys(state.cruxes).length + 1}`,
        authorId: AUTHOR.id,
        visibility: 'private',
        created: AUTHOR.created,
        updated: AUTHOR.updated,
      };
      state.cruxes[state.crux.id as string] = state.crux;
      return send(201, state.crux);
    }
    // ── usage (ADR 0011): storage from published file sizes; bandwidth is a fixed sample
    const usageFor = (id: string) => {
      const files = state.published[id] ?? [];
      const storageBytes = files.reduce((n, f) => n + (f.bytes?.length ?? 0), 0);
      const title =
        (state.cruxes[id]?.title as string | undefined) ??
        (state.crux?.title as string | undefined);
      return {
        cruxId: id,
        title,
        storageBytes,
        files: files.length,
        bandwidthBytes: storageBytes ? 40960 : 0,
        requests: storageBytes ? 12 : 0,
      };
    };
    // ── sync: garden backup + crux archives (multipart PUT), metered into usage
    if (path === '/sync/garden/status' && method === 'GET') {
      return state.sync.garden
        ? send(200, { syncedAt: state.sync.garden.syncedAt, size: state.sync.garden.bytes })
        : send(404, { statusCode: 404, message: 'No garden backup found' });
    }
    if (path === '/sync/garden' && method === 'PUT') {
      const { files } = parseMultipart(rawBuf, req.headers['content-type'] ?? '');
      const bytes = files[0]?.bytes.length ?? 0;
      if (!bytes) return send(400, { statusCode: 400, message: 'No file uploaded' });
      state.sync.garden = { bytes, syncedAt: new Date().toISOString() };
      state.sync.up += bytes;
      return send(200, { syncedAt: state.sync.garden.syncedAt, size: bytes });
    }
    if (path === '/sync/garden' && method === 'DELETE') {
      state.sync.garden = null;
      return send(204, null);
    }
    if (path === '/sync/crux' && method === 'GET') {
      return send(
        200,
        Object.entries(state.sync.cruxes).map(([cruxId, c]) => ({
          cruxId,
          slug: c.slug,
          title: c.title,
          updatedAt: c.updatedAt,
          size: c.bytes,
        })),
      );
    }
    const sm = path.match(/^\/sync\/crux\/([^/]+)$/);
    if (sm) {
      const id = sm[1]!;
      if (method === 'PUT') {
        const { files, fields } = parseMultipart(rawBuf, req.headers['content-type'] ?? '');
        const bytes = files[0]?.bytes.length ?? 0;
        if (!bytes) return send(400, { statusCode: 400, message: 'No file uploaded' });
        const entry = {
          bytes,
          title: fields.title || 'Untitled',
          slug: fields.slug || id,
          updatedAt: new Date().toISOString(),
        };
        state.sync.cruxes[id] = entry;
        state.sync.up += bytes;
        return send(200, { cruxId: id, ...entry, size: bytes });
      }
      if (method === 'DELETE') {
        delete state.sync.cruxes[id];
        return send(204, null);
      }
    }
    if (path === '/usage/periods' && method === 'GET') {
      return send(200, [
        {
          period: { start: '2026-08-01', end: '2026-09-01' },
          planId: 'free',
          storageBytes: 12345,
          publishStorageBytes: 12345,
          syncStorageBytes: 0,
          bandwidthBytes: 2048,
          publishBandwidthBytes: 2048,
          syncTransferBytes: 0,
          requests: 3,
          storageLimit: 1073741824,
          bandwidthLimit: 1073741824,
          overStorage: false,
          overBandwidth: false,
          reconciliationStatus: 'ok',
          finalizedAt: '2026-09-03T00:00:00.000Z',
        },
      ]);
    }
    if (path === '/usage/me' && method === 'GET') {
      const cruxes = Object.keys(state.published).map(usageFor);
      const syncCruxes = Object.entries(state.sync.cruxes);
      const gardenBytes = state.sync.garden?.bytes ?? 0;
      const cruxBytes = syncCruxes.reduce((n, [, c]) => n + c.bytes, 0);
      const publish = {
        storageBytes: cruxes.reduce((n, c) => n + c.storageBytes, 0),
        bandwidthBytes: cruxes.reduce((n, c) => n + c.bandwidthBytes, 0),
        requests: cruxes.reduce((n, c) => n + c.requests, 0),
      };
      const sync = {
        storageBytes: gardenBytes + cruxBytes,
        gardenBytes,
        gardenSyncedAt: state.sync.garden?.syncedAt ?? null,
        cruxBytes,
        cruxCount: syncCruxes.length,
        transferBytes: state.sync.up + state.sync.down,
        uploadBytes: state.sync.up,
        downloadBytes: state.sync.down,
        uploads: state.sync.up ? 1 : 0,
        downloads: state.sync.down ? 1 : 0,
        objects: [
          ...(state.sync.garden
            ? [
                {
                  kind: 'garden',
                  id: 'garden',
                  title: 'Garden backup',
                  bytes: gardenBytes,
                  updated: state.sync.garden.syncedAt,
                },
              ]
            : []),
          ...syncCruxes.map(([id, c]) => ({
            kind: 'crux',
            id,
            title: c.title,
            bytes: c.bytes,
            updated: c.updatedAt,
          })),
        ],
      };
      const budget = (limit: number, used: number) => ({
        limit,
        used,
        softLimit: Math.round(limit * 1.1),
        over: used > limit,
        overSoft: used > limit * 1.1,
      });
      return send(200, {
        publish,
        sync,
        settlement: { finalizesAt: '2026-10-03T00:00:00.000Z', isFinal: false, graceHours: 48 },
        budgets: {
          storage: budget(1073741824, publish.storageBytes + sync.storageBytes),
          bandwidth: budget(1073741824, publish.bandwidthBytes + sync.transferBytes),
        },
        reconciliation: {
          day: '2026-09-02',
          status: 'ok',
          meteredBytes: 40960,
          edgeBytes: 40960,
          gapPct: 0,
          checkedAt: '2026-09-03T00:15:00.000Z',
        },
        period: { start: '2026-09-01', end: '2026-10-01' },
        plan: {
          id: 'free',
          name: 'Free',
          storageBytes: 1073741824,
          bandwidthBytesPerPeriod: 1073741824,
        },
        storageBytes: publish.storageBytes + sync.storageBytes,
        bandwidthBytes: publish.bandwidthBytes + sync.transferBytes,
        requests: publish.requests,
        cruxes,
        bandwidthAsOf: null,
      });
    }
    // ── custom domains: verify advances one step per call
    const dm = path.match(/^\/domains\/([^/]+)(\/verify)?$/);
    if (dm) {
      const d = state.domains.find((x) => x.id === dm[1]);
      if (!d) return send(404, { statusCode: 404, message: 'Domain not found' });
      if (dm[2] && method === 'POST') {
        d.verifies += 1;
        if (d.verifies === 1) d.error = 'Waiting for the TXT record';
        else if (d.verifies === 2) {
          d.status = 'issuing';
          d.error = null;
        } else d.status = 'active';
        return send(200, d);
      }
      if (method === 'DELETE') {
        state.domains = state.domains.filter((x) => x.id !== d.id);
        return send(204, null);
      }
    }
    const m = path.match(/^\/cruxes\/([^/]+)(\/.*)?$/);
    if (m) {
      const id = m[1]!;
      const sub = m[2] ?? '';
      const current = state.cruxes[id] ?? (state.crux?.id === id ? state.crux : null);
      if (sub === '' && method === 'GET')
        return current
          ? send(200, current)
          : send(404, { statusCode: 404, message: 'Crux not found' });
      if (sub === '' && method === 'PATCH') {
        const updated = { ...(current ?? { id }), ...bodyJson() };
        state.cruxes[id] = updated;
        if (!state.crux || state.crux.id === id) state.crux = updated;
        return send(200, updated);
      }
      if (sub === '/publish' && method === 'POST') {
        if (state.failPublish) return send(500, { statusCode: 500, message: 'Simulated outage' });
        const parts = parseMultipart(rawBuf, req.headers['content-type'] ?? '');
        const metas = (() => {
          try {
            return JSON.parse(parts.fields.meta ?? '[]') as { path: string }[];
          } catch {
            return [];
          }
        })();
        state.published[id] = parts.files.map((f, i) => ({
          path: metas[i]?.path ?? f.filename,
          mime: f.mime,
          bytes: f.bytes,
        }));
        state.publishedVersion++;
        const meta = {
          ...(((current ?? {}).meta as Record<string, unknown>) ?? {}),
          publishedAt: new Date().toISOString(),
          publishedVersion: state.publishedVersion,
        };
        const updated = { ...(current ?? { id }), meta, visibility: 'public' };
        state.cruxes[id] = updated;
        if (!state.crux || state.crux.id === id) state.crux = updated;
        return send(200, updated);
      }
      if (sub === '/usage' && method === 'GET') return send(200, usageFor(id));
      if (sub === '/domains' && method === 'GET')
        return send(
          200,
          state.domains.filter((d) => d.cruxId === id),
        );
      if (sub === '/domains' && method === 'POST') {
        const hostname = String(bodyJson().hostname ?? '').toLowerCase();
        if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(hostname))
          return send(400, { statusCode: 400, message: 'Enter a domain like blog.example.com' });
        if (state.domains.some((d) => d.hostname === hostname))
          return send(409, {
            statusCode: 409,
            message: 'That domain is already connected to a crux',
          });
        const d = {
          id: `dom-${state.domains.length + 1}`,
          cruxId: id,
          hostname,
          status: 'pending_dns',
          error: null as string | null,
          records: [
            { type: 'CNAME', name: hostname, value: 'publish.crux.garden' },
            { type: 'TXT', name: `_crux-verify.${hostname}`, value: 'crux-verify=abc123' },
          ],
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          verifies: 0,
        };
        state.domains.push(d);
        return send(201, d);
      }
      if (sub === '/tags' && method === 'PUT') return send(200, []);
      if (sub === '/unpublish' && method === 'POST') {
        delete state.cruxes[id];
        delete state.published[id];
        if (state.crux?.id === id) state.crux = null;
        return send(200, {});
      }
    }
    return send(404, { statusCode: 404, message: `mock: unhandled ${method} ${path}` });
  });

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    state,
    log,
    close: () => new Promise((r) => server.close(() => r())),
  };
}
