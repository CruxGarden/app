import { expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { SettingsKey } from '@/lib/constants';
vi.mock('@/stores/authStore', () => ({
  useAuthStore: { getState: () => ({ account: { id: 'fixture-account' } }) },
}));

let client: typeof import('./client').default;
let auth: typeof import('./session');
let settings: typeof import('@/services/settings');
let encrypted: Map<string, string>;
let servers: Server[];
let failRead: boolean;
let failWrite: boolean;
let failDelete: boolean;
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
async function listen(handler: (req: IncomingMessage, res: ServerResponse) => void) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture listener');
  return `http://127.0.0.1:${address.port}`;
}
function json(res: ServerResponse, body: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
beforeEach(async () => {
  vi.resetModules();
  encrypted = new Map();
  servers = [];
  failRead = failWrite = failDelete = false;
  vi.stubGlobal('window', {
    electronAPI: {
      secrets: {
        get: async (key: string) => {
          if (failRead) throw new Error('fixture locked vault');
          return encrypted.get(key) ?? null;
        },
        set: async (key: string, value: string) => {
          if (failWrite) throw new Error('fixture full disk');
          encrypted.set(key, value);
        },
        delete: async (key: string) => {
          if (failDelete) throw new Error('fixture refused removal');
          encrypted.delete(key);
        },
      },
    },
  });
  settings = await import('@/services/settings');
  settings.clearAllSettings();
  auth = await import('./session');
  client = (await import('./client')).default;
});
afterEach(async () => {
  failRead = failWrite = failDelete = false;
  await auth.clearTokens();
  await settings.flushSettings();
  settings.clearAllSettings();
  vi.unstubAllGlobals();
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeAllConnections();
        }),
    ),
  );
});

it('persists a paired native credential and never sends it to another API, even after switching back', async () => {
  const headers: Array<string | undefined> = [];
  const a = await listen((req, res) => {
    headers.push(req.headers.authorization);
    json(res, {});
  });
  const b = await listen((req, res) => {
    headers.push(req.headers.authorization);
    json(res, {});
  });
  settings.setSetting(SettingsKey.ApiUrl, a);
  await auth.storeTokens('fixture-access-A', 'fixture-refresh-A');
  expect(localStorage.getItem(SettingsKey.AccessToken)).toBeNull();
  expect(localStorage.getItem(SettingsKey.RefreshToken)).toBeNull();
  expect(encrypted.size).toBe(1);
  const original = auth.captureAuth();
  await client.get('/who');
  settings.setSetting(SettingsKey.ApiUrl, b);
  await client.get('/who');
  expect(headers).toEqual(['Bearer fixture-access-A', undefined]);
  settings.setSetting(SettingsKey.ApiUrl, a);
  await expect(client.get('/who', { authContext: original })).rejects.toThrow('connection changed');
  expect(headers).toHaveLength(2);
});

it('deduplicates concurrent 401s and retries each against the same API with the acknowledged rotated pair', async () => {
  let rotations = 0;
  const refreshed = deferred();
  const origin = await listen((req, res) => {
    if (req.url === '/auth/token') {
      rotations++;
      void refreshed.promise.then(() => json(res, { accessToken: 'fresh', refreshToken: 'next' }));
    } else if (req.headers.authorization === 'Bearer fresh') json(res, { ok: true });
    else json(res, {}, 401);
  });
  settings.setSetting(SettingsKey.ApiUrl, origin);
  await auth.storeTokens('old', 'refresh');
  const requests = Array.from({ length: 5 }, () => client.get('/private'));
  await vi.waitFor(() => expect(rotations).toBe(1));
  refreshed.resolve();
  expect((await Promise.all(requests)).every((r) => r.data.ok)).toBe(true);
  expect(rotations).toBe(1);
  expect(await auth.getStoredTokens()).toEqual({ accessToken: 'fresh', refreshToken: 'next' });
});

it.each(['sign out', 'new login', 'API switch'] as const)(
  'a delayed refresh cannot undo %s',
  async (action) => {
    const started = deferred();
    const finish = deferred();
    const origin = await listen((req, res) => {
      if (req.url === '/auth/token') {
        started.resolve();
        void finish.promise.then(() =>
          json(res, { accessToken: 'stale', refreshToken: 'stale-refresh' }),
        );
      } else json(res, {}, 401);
    });
    settings.setSetting(SettingsKey.ApiUrl, origin);
    await auth.storeTokens('old', 'old-refresh');
    const request = expect(client.get('/private')).rejects.toThrow('connection changed');
    await started.promise;
    if (action === 'sign out') await auth.clearTokens();
    if (action === 'new login') await auth.storeTokens('new-login', 'new-refresh');
    if (action === 'API switch') settings.setSetting(SettingsKey.ApiUrl, origin + '/another-api');
    finish.resolve();
    await request;
    expect((await auth.getStoredTokens()).accessToken).toBe(
      action === 'new login' ? 'new-login' : null,
    );
    expect([...encrypted.values()].join()).not.toContain('stale');
  },
);

it('preserves acknowledged credentials after write/delete failures and retries a locked read', async () => {
  failRead = true;
  await expect(auth.getStoredTokens()).rejects.toThrow('locked vault');
  failRead = false;
  expect((await auth.getStoredTokens()).accessToken).toBeNull();
  await auth.storeTokens('saved', 'saved-refresh');
  const stored = [...encrypted.values()];
  failWrite = true;
  await expect(auth.storeTokens('lost', 'lost-refresh')).rejects.toThrow('full disk');
  expect([...encrypted.values()]).toEqual(stored);
  expect((await auth.getStoredTokens()).accessToken).toBe('saved');
  failDelete = true;
  await expect(auth.clearTokens()).rejects.toThrow('refused removal');
  expect([...encrypted.values()]).toEqual(stored);
  expect((await auth.getStoredTokens()).accessToken).toBe('saved');
  failWrite = failDelete = false;
  await auth.storeTokens('retry', 'retry-refresh');
  expect((await auth.getStoredTokens()).accessToken).toBe('retry');
});

it('does not forward credentials or refresh bodies through redirects or caller-supplied absolute URLs', async () => {
  let received = 0;
  const other = await listen((_req, res) => {
    received++;
    json(res, {});
  });
  const origin = await listen((_req, res) => {
    res.writeHead(307, { Location: other + '/steal' });
    res.end();
  });
  settings.setSetting(SettingsKey.ApiUrl, origin);
  await auth.storeTokens('private', 'refresh-private');
  await expect(
    client.post('/auth/token', { refreshToken: 'refresh-private' }, { skipAuthentication: true }),
  ).rejects.toThrow();
  await expect(client.get(other + '/steal')).rejects.toThrow('relative path');
  await expect(client.get('//127.0.0.1/steal')).rejects.toThrow('relative path');
  expect(received).toBe(0);
});

it('public browser sessions stay in memory and never adopt unbound plaintext tokens', async () => {
  vi.stubGlobal('window', {});
  localStorage.setItem(SettingsKey.AccessToken, 'unbound');
  localStorage.setItem(SettingsKey.RefreshToken, 'unbound-refresh');
  expect((await auth.getStoredTokens()).accessToken).toBeNull();
  expect(localStorage.getItem(SettingsKey.AccessToken)).toBe('unbound');
  await auth.storeTokens('browser', 'browser-refresh');
  expect((await auth.getStoredTokens()).accessToken).toBe('browser');
  expect(encrypted.size).toBe(0);
  expect(localStorage.getItem(SettingsKey.AccessToken)).toBeNull();
  expect(localStorage.getItem(SettingsKey.AuthSession)).toBeNull();
});

it('restores the encrypted pair after restart, refuses damaged data, and retries after repair', async () => {
  const origin = await listen((_req, res) => json(res, {}));
  settings.setSetting(SettingsKey.ApiUrl, origin);
  await auth.storeTokens('retained', 'retained-refresh');
  const stored = encrypted.get(SettingsKey.AuthSession)!;
  vi.resetModules();
  auth = await import('./session');
  expect((await auth.getStoredTokens()).accessToken).toBe('retained');
  vi.resetModules();
  auth = await import('./session');
  encrypted.set(SettingsKey.AuthSession, '{fixture-private-damaged');
  const failure = await auth.getStoredTokens().catch((error: Error) => error);
  expect(failure).toBeInstanceOf(Error);
  expect(String(failure)).not.toContain('fixture-private-damaged');
  expect(encrypted.get(SettingsKey.AuthSession)).toBe('{fixture-private-damaged');
  encrypted.set(SettingsKey.AuthSession, stored);
  expect((await auth.getStoredTokens()).accessToken).toBe('retained');
});

it('retains credentials on transient refresh failure and strips credentials from transport errors', async () => {
  let unavailable = true;
  const origin = await listen((req, res) => {
    if (req.url === '/auth/token') {
      if (unavailable) json(res, {}, 503);
      else json(res, { accessToken: 'recovered', refreshToken: 'recovered-refresh' });
    } else if (req.headers.authorization === 'Bearer recovered') json(res, {});
    else json(res, {}, 401);
  });
  settings.setSetting(SettingsKey.ApiUrl, origin);
  await auth.storeTokens('fixture-private-access', 'fixture-private-refresh');
  const error = await client.get('/private').catch((error: Error) => error);
  expect(error).toMatchObject({ response: { status: 503 } });
  expect(error).not.toHaveProperty('config');
  expect(error).not.toHaveProperty('request');
  expect(JSON.stringify(error)).not.toContain('fixture-private');
  expect((await auth.getStoredTokens()).accessToken).toBe('fixture-private-access');
  unavailable = false;
  await client.get('/private');
  expect((await auth.getStoredTokens()).accessToken).toBe('recovered');
});

it('forgets only an explicitly rejected refresh session', async () => {
  const origin = await listen((_req, res) => json(res, {}, 401));
  settings.setSetting(SettingsKey.ApiUrl, origin);
  await auth.storeTokens('expired', 'rejected');
  await expect(client.get('/private')).rejects.toThrow();
  expect((await auth.getStoredTokens()).accessToken).toBeNull();
  expect(encrypted.size).toBe(0);
});

it('included inference cannot retry against a newly selected API', async () => {
  let received = 0;
  const other = await listen((_req, res) => {
    received++;
    json(res, {});
  });
  const origin = await listen((_req, res) => {
    settings.setSetting(SettingsKey.ApiUrl, other);
    json(res, {}, 401);
  });
  settings.setSetting(SettingsKey.ApiUrl, origin);
  await auth.storeTokens('inference-private', 'inference-refresh');
  const { includedFetch } = await import('./inference');
  await expect(includedFetch('https://ignored.invalid', { body: '{}' })).rejects.toThrow(
    'connection changed',
  );
  expect(received).toBe(0);
});
