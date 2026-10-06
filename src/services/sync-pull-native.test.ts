import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { captureAuth, clearTokens, storeTokens } from '@/api/session';
import { SettingsKey } from '@/lib/constants';
import { localApiFixture } from '@/test/local-api-fixture';
import { getServices, initServices } from './index';
import { exportCrux } from './crux-io';
import { pullCrux, useSyncPull } from './sync-pull';
import { setSetting } from './settings';
import { restoreSyncedCrux } from './recover';

const native = localApiFixture();
const servers: Server[] = [];
beforeEach(async () => {
  await initServices();
  await clearTokens();
  useSyncPull.setState({}, true);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await clearTokens();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        }),
    ),
  );
});

const write = (id: string, content: string) =>
  getServices().artifact.create({ resourceId: id, content, meta: { path: 'work.txt' } });
async function source(id: string) {
  const file = (await getServices().artifact.findByResource('crux', id)).find(
    (file) => file.meta?.path === 'work.txt',
  )!;
  return getServices().artifact.readContent(file);
}
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function prepare() {
  const crux = await getServices().crux.create({ title: 'Cloud and local work' });
  await write(crux.id, 'Cloud edition');
  const archive = await exportCrux({ cruxId: crux.id });
  await write(crux.id, 'New local work');
  const bytes = Buffer.from(await archive.blob.arrayBuffer());
  const requests: { path: string; authorization?: string }[] = [];
  const server = createServer((request, response) => {
    requests.push({ path: request.url!, authorization: request.headers.authorization });
    if (request.url === `/sync/crux/${crux.id}`) {
      response.setHeader('Content-Type', 'application/zip');
      response.end(bytes);
    } else if (request.url === '/sync/crux') {
      response.setHeader('Content-Type', 'application/json');
      response.end(
        JSON.stringify([
          { cruxId: crux.id, updatedAt: '2026-10-02T12:00:00Z', size: bytes.length },
        ]),
      );
    } else {
      response.statusCode = 404;
      response.end();
    }
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing sync listener');
  setSetting(SettingsKey.ApiUrl, `http://127.0.0.1:${address.port}`);
  await storeTokens('fixture-account-A', 'fixture-refresh-A');
  return { crux, requests };
}

it.each(['archive review', 'replacement admission'] as const)(
  'keeps local work when the account changes during %s and permits an explicit fresh pull',
  async (stage) => {
    const { crux, requests } = await prepare();
    const archive = native().client.privateArchive!;
    const entered = gate();
    const resume = gate();
    if (stage === 'archive review') {
      const inspect = archive.inspect.bind(archive);
      vi.spyOn(archive, 'inspect').mockImplementationOnce(async (bytes) => {
        entered.resolve();
        await resume.promise;
        return inspect(bytes);
      });
    } else {
      const replacement = archive.replacementToken.bind(archive);
      vi.spyOn(archive, 'replacementToken').mockImplementationOnce(async (selection) => {
        entered.resolve();
        await resume.promise;
        return replacement(selection);
      });
    }
    const operation = pullCrux(crux.id);
    await entered.promise;
    await storeTokens('fixture-account-B', 'fixture-refresh-B');
    resume.resolve();
    await operation;
    expect(await source(crux.id)).toBe('New local work');
    expect(useSyncPull.getState()[crux.id]?.error).toContain('account connection changed');
    expect(requests).toEqual([
      { path: `/sync/crux/${crux.id}`, authorization: 'Bearer fixture-account-A' },
    ]);
    expect((await getServices().crux.findById(crux.id)).meta?.backup).toBeUndefined();

    await pullCrux(crux.id);
    expect(useSyncPull.getState()[crux.id]).toMatchObject({ message: 'Pull complete', error: '' });
    expect(await source(crux.id)).toBe('Cloud edition');
    expect(
      requests.slice(1).every((request) => request.authorization === 'Bearer fixture-account-B'),
    ).toBe(true);
    expect((await getServices().crux.findById(crux.id)).meta?.backup).toMatchObject({
      at: '2026-10-02T12:00:00Z',
    });
  },
);

it('does not read another account’s inventory or apply its backup record after a completed import', async () => {
  const { crux, requests } = await prepare();
  const archive = native().client.privateArchive!;
  const importing = archive.import.bind(archive);
  vi.spyOn(archive, 'import').mockImplementationOnce(async (bytes, input) => {
    const result = await importing(bytes, input);
    await storeTokens('fixture-account-B', 'fixture-refresh-B');
    return result;
  });
  await pullCrux(crux.id);
  expect(await source(crux.id)).toBe('Cloud edition');
  expect(requests).toEqual([
    { path: `/sync/crux/${crux.id}`, authorization: 'Bearer fixture-account-A' },
  ]);
  expect((await getServices().crux.findById(crux.id)).meta?.backup).toBeUndefined();
  expect(useSyncPull.getState()[crux.id]?.error).toContain('account connection changed');
});

it('rejects a pull confirmed for an earlier connection before any download', async () => {
  const { crux, requests } = await prepare();
  const confirmedFor = captureAuth();
  await storeTokens('fixture-account-B', 'fixture-refresh-B');
  await pullCrux(crux.id, confirmedFor);
  expect(requests).toEqual([]);
  expect(await source(crux.id)).toBe('New local work');
  expect(useSyncPull.getState()[crux.id]?.error).toContain('account connection changed');
});

it('rejects direct backup recovery when the connection changes before native import admission', async () => {
  const { crux, requests } = await prepare();
  const archive = native().client.privateArchive!;
  const inspect = archive.inspect.bind(archive);
  vi.spyOn(archive, 'inspect').mockImplementationOnce(async (bytes) => {
    const result = await inspect(bytes);
    await storeTokens('fixture-account-B', 'fixture-refresh-B');
    return result;
  });
  await expect(restoreSyncedCrux({ id: crux.id, published: null })).rejects.toThrow(
    'account connection changed',
  );
  expect(await source(crux.id)).toBe('New local work');
  expect(requests).toEqual([
    { path: `/sync/crux/${crux.id}`, authorization: 'Bearer fixture-account-A' },
  ]);
});
