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
export interface MockApi {
  url: string;
  state: { failPublish: boolean; publishedVersion: number; crux: Record<string, unknown> | null };
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

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });
}

export async function startMockApi(): Promise<MockApi> {
  const state: MockApi['state'] = { failPublish: false, publishedVersion: 0, crux: null };
  const log: string[] = [];

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const method = req.method ?? 'GET';
    const path = new URL(req.url ?? '/', 'http://x').pathname;
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
    if (method === 'OPTIONS') return send(204, null);
    const raw = await readBody(req);
    const bodyJson = (): Record<string, unknown> => {
      try {
        return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      } catch {
        return {}; // multipart (publish) — never parsed
      }
    };

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
    if (path.startsWith('/authors/') && method === 'PATCH') return send(200, { ...AUTHOR, ...bodyJson() });
    if (path.startsWith('/authors/') && path.endsWith('/avatar')) return send(200, AUTHOR);

    if (path === '/cruxes' && method === 'POST') {
      state.crux = {
        ...bodyJson(),
        authorId: AUTHOR.id,
        visibility: 'private',
        created: AUTHOR.created,
        updated: AUTHOR.updated,
      };
      return send(201, state.crux);
    }
    const m = path.match(/^\/cruxes\/([^/]+)(\/.*)?$/);
    if (m) {
      const sub = m[2] ?? '';
      if (sub === '' && method === 'GET')
        return state.crux
          ? send(200, state.crux)
          : send(404, { statusCode: 404, message: 'Crux not found' });
      if (sub === '' && method === 'PATCH') {
        state.crux = { ...(state.crux ?? {}), ...bodyJson() };
        return send(200, state.crux);
      }
      if (sub === '/publish' && method === 'POST') {
        if (state.failPublish) return send(500, { statusCode: 500, message: 'Simulated outage' });
        state.publishedVersion++;
        const meta = {
          ...((state.crux?.meta as Record<string, unknown>) ?? {}),
          publishedAt: new Date().toISOString(),
          publishedVersion: state.publishedVersion,
        };
        state.crux = { ...(state.crux ?? {}), meta, visibility: 'public' };
        return send(200, state.crux);
      }
      if (sub === '/tags' && method === 'PUT') return send(200, []);
      if (sub === '/unpublish' && method === 'POST') {
        state.crux = null;
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
