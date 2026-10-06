import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { clearTokens, storeTokens } from '@/api/session';
import { SettingsKey } from '@/lib/constants';
import { createCruxStore } from '@/stores/cruxStore';
import { localApiFixture } from '@/test/local-api-fixture';
import { getServices, initServices } from './index';
import { backupCrux, backupGarden, backupOf } from './backup';
import { setSetting } from './settings';

const native = localApiFixture();
const servers: Server[] = [];
beforeEach(async () => {
  await initServices();
  await clearTokens();
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

async function backupApi() {
  const requests: { path: string; authorization?: string; bytes: Buffer }[] = [];
  const server = createServer((request, response) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      requests.push({
        path: request.url!,
        authorization: request.headers.authorization,
        bytes: Buffer.concat(chunks),
      });
      response.setHeader('Content-Type', 'application/json');
      response.end(
        JSON.stringify({
          updatedAt: '2026-10-02T12:00:00Z',
          syncedAt: '2026-10-02T12:00:00Z',
          size: Buffer.concat(chunks).length,
        }),
      );
    })().catch(() => {
      response.statusCode = 500;
      response.end();
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing backup listener');
  return { url: `http://127.0.0.1:${address.port}`, requests };
}

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it.each(['account', 'API address'] as const)(
  'keeps a private Crux local when the %s changes during archive export, then permits an explicit retry',
  async (change) => {
    const services = getServices();
    const crux = await services.crux.create({ title: 'Private backup source' });
    await services.artifact.create({
      resourceId: crux.id,
      content: 'Private source retained',
      meta: { path: 'private.txt' },
    });
    const data = createCruxStore();
    data.setState({ crux });
    const original = await backupApi();
    const other = change === 'API address' ? await backupApi() : original;
    setSetting(SettingsKey.ApiUrl, original.url);
    await storeTokens('fixture-account-A', 'fixture-refresh-A');
    const entered = gate();
    const resume = gate();
    const archive = native().client.privateArchive!;
    const originalExport = archive.export.bind(archive);
    vi.spyOn(archive, 'export').mockImplementationOnce(async (selection) => {
      entered.resolve();
      await resume.promise;
      return originalExport(selection);
    });
    const pending = backupCrux(data).then(
      () => null,
      (error: unknown) => error,
    );
    await entered.promise;
    if (change === 'API address') setSetting(SettingsKey.ApiUrl, other.url);
    await storeTokens('fixture-account-B', 'fixture-refresh-B');
    resume.resolve();
    const error = await pending;
    expect(other.requests.map(({ path, authorization }) => ({ path, authorization }))).toEqual([]);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('account connection changed');
    expect((await services.crux.findById(crux.id)).meta?.backup).toBeUndefined();
    await native().restart();
    const files = await services.artifact.findByResource('crux', crux.id);
    expect(await services.artifact.readContent(files[0]!)).toBe('Private source retained');
    await backupCrux(data);
    expect(other.requests).toHaveLength(1);
    expect(other.requests[0]!.authorization).toBe('Bearer fixture-account-B');
    expect(other.requests[0]!.bytes.length).toBeGreaterThan(0);
    expect(backupOf(await services.crux.findById(crux.id))?.at).toBe('2026-10-02T12:00:00Z');
  },
);

it.each(['account', 'API address'] as const)(
  'keeps the entire Garden local when the %s changes during export and allows a fresh retry',
  async (change) => {
    const services = getServices();
    const crux = await services.crux.create({ title: 'Private Garden source' });
    await services.artifact.create({
      resourceId: crux.id,
      content: 'Garden private bytes',
      meta: { path: 'private.txt' },
    });
    const original = await backupApi();
    const other = change === 'API address' ? await backupApi() : original;
    setSetting(SettingsKey.ApiUrl, original.url);
    await storeTokens('fixture-account-A', 'fixture-refresh-A');
    const entered = gate();
    const resume = gate();
    const db = native().client;
    const originalExport = db.export.bind(db);
    vi.spyOn(db, 'export').mockImplementationOnce(async () => {
      entered.resolve();
      await resume.promise;
      return originalExport();
    });
    const pending = backupGarden().then(
      () => null,
      (error: unknown) => error,
    );
    await entered.promise;
    if (change === 'API address') setSetting(SettingsKey.ApiUrl, other.url);
    await storeTokens('fixture-account-B', 'fixture-refresh-B');
    resume.resolve();
    const error = await pending;
    expect(original.requests).toEqual([]);
    expect(other.requests).toEqual([]);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('account connection changed');
    await native().restart();
    const files = await services.artifact.findByResource('crux', crux.id);
    expect(await services.artifact.readContent(files[0]!)).toBe('Garden private bytes');
    await backupGarden();
    expect(other.requests).toHaveLength(1);
    expect(other.requests[0]!).toMatchObject({
      path: '/sync/garden',
      authorization: 'Bearer fixture-account-B',
    });
    expect(other.requests[0]!.bytes.toString()).toContain('garden.zip');
  },
);
