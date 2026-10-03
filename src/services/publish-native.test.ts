import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { Crux } from '@/api/types';
import { clearTokens, storeTokens } from '@/api/session';
import { SettingsKey } from '@/lib/constants';
import { localApiFixture } from '@/test/local-api-fixture';
import { getServices, initServices } from './index';
import { publishPipeline } from './publish';
import { setSetting } from './settings';
import { createCruxStore, selectHasUnpublishedChanges } from '@/stores/cruxStore';
import { starterManifest } from '@/templates/tool-starter';
import { packTool } from './crux-tools/package';
import { installToolFile } from './crux-tools/files';
import { forgetInstalledTool } from './crux-tools/installed';
import { applyTemplateToCrux } from './crux-create';
import * as secrets from './function-secrets';
import * as functions from './crux-functions';
import * as cues from './cues';

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
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeAllConnections();
        }),
    ),
  );
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function publicationApi(crux: Crux) {
  const requests: { method: string; path: string; authorization?: string; bytes: Buffer }[] = [];
  const server = createServer((request, response) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      requests.push({
        method: request.method!,
        path: request.url!,
        authorization: request.headers.authorization,
        bytes: Buffer.concat(chunks),
      });
      response.setHeader('Content-Type', 'application/json');
      if (request.method === 'GET') {
        response.statusCode = 404;
        response.end(JSON.stringify({ message: 'Not found' }));
      } else if (request.url?.endsWith('/tags')) response.end('[]');
      else
        response.end(
          JSON.stringify({
            ...crux,
            visibility: 'public',
            meta: { publishedAt: '2026-10-02T12:00:00Z', publishedVersion: 1 },
          }),
        );
    })().catch(() => {
      response.statusCode = 500;
      response.end(JSON.stringify({ message: 'Fixture request failed' }));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing API fixture listener');
  return { url: `http://127.0.0.1:${address.port}`, requests };
}

async function communityProject() {
  native().installProjectBridge();
  const credentials = new Map<string, string>();
  window.electronAPI!.secrets = {
    available: async () => true,
    get: async (key) => credentials.get(key) ?? null,
    set: async (key, value) => {
      credentials.set(key, value);
    },
    delete: async (key) => {
      credentials.delete(key);
    },
  };
  const manifest = {
    ...starterManifest,
    id: 'unknown-publication-fixture',
    app: 'unknown-publication-fixture',
    share: true,
    document: {
      path: 'data/project.json',
      seed: { version: 1, app: 'unknown-publication-fixture', text: '' },
    },
    publication: {
      type: 'static' as const,
      root: 'public/',
      include: ['data/project.json', 'data/assets/'],
    },
  };
  const image = new Uint8Array([137, 80, 78, 71, 0, 23, 255]);
  const files = [
    ['index.html', 'PRIVATE_EDITOR_SOURCE'],
    ['garden/client.js', 'PRIVATE_EDITOR_BRIDGE'],
    ['private.txt', 'PRIVATE_WORK_SENTINEL'],
    ['publicity/not-public.txt', 'PRIVATE_PREFIX_SENTINEL'],
    ['public/index.html', '<h1 id="output"></h1><script src="visitor.js"></script>'],
    [
      'public/visitor.js',
      'fetch("data/project.json").then(r=>r.json()).then(d=>document.querySelector("#output").textContent=d.text);',
    ],
    ['data/project.json', JSON.stringify(manifest.document.seed)],
  ].map(([path, content]) => ({ path: path!, blob: new Blob([content!]), mimeType: 'text/plain' }));
  files.push({ path: 'data/assets/picture.png', blob: new Blob([image]), mimeType: 'image/png' });
  const installed = await installToolFile(await packTool(manifest, files));
  const services = getServices();
  const draft = await services.crux.create({ title: 'My public result', type: 'workspace' });
  await applyTemplateToCrux(draft, installed.id, 'webapp');
  await services.artifact.create({
    resourceId: draft.id,
    content: JSON.stringify({ ...manifest.document.seed, text: 'Recipient public edit' }),
    meta: { path: 'data/project.json' },
  });
  const crux = await services.crux.update(draft.id, {
    meta: { messages: [{ role: 'user', content: 'PRIVATE_COLLABORATION_SENTINEL' }] },
  });
  forgetInstalledTool(installed.id);
  const selected = await services.artifact.findByResource('crux', crux.id);
  return { services, crux, selected, image };
}

it('publishes an installed unknown tool’s edited public result while keeping editor and private files local', async () => {
  const { services, crux, selected, image } = await communityProject();
  const api = await publicationApi(crux);
  setSetting(SettingsKey.ApiUrl, api.url);
  await storeTokens('fixture-account', 'fixture-refresh');
  const phases: string[] = [];
  const updated = await publishPipeline(crux, selected, {
    onProgress: (phase) => phases.push(phase),
  });

  expect(phases).not.toContain('build');
  const uploads = api.requests.filter((request) => request.path.endsWith('/publish'));
  expect(uploads).toHaveLength(1);
  const bytes = uploads[0]!.bytes;
  expect(
    [...bytes.toString().matchAll(/"path":"([^"]+)"/g)].map((match) => match[1]).sort(),
  ).toEqual(['data/assets/picture.png', 'data/project.json', 'index.html', 'visitor.js']);
  expect(bytes.toString()).toContain('Recipient public edit');
  expect(bytes.includes(Buffer.from(image))).toBe(true);
  expect(Buffer.concat(api.requests.map((request) => request.bytes)).toString()).not.toContain(
    'PRIVATE_',
  );
  expect(
    await services.artifact.readContent(
      selected.find((file) => file.meta?.path === 'private.txt')!,
    ),
  ).toBe('PRIVATE_WORK_SENTINEL');

  const data = createCruxStore();
  data.setState({ crux: updated, artifacts: selected });
  expect(selectHasUnpublishedChanges(data.getState())).toBe(false);
  await services.artifact.create({
    resourceId: crux.id,
    content: 'Later private edit',
    meta: { path: 'private.txt' },
  });
  data.setState({ artifacts: await services.artifact.findByResource('crux', crux.id) });
  expect(selectHasUnpublishedChanges(data.getState())).toBe(false);
  await services.artifact.create({
    resourceId: crux.id,
    content: 'Updated visitor',
    meta: { path: 'public/index.html' },
  });
  data.setState({ artifacts: await services.artifact.findByResource('crux', crux.id) });
  expect(selectHasUnpublishedChanges(data.getState())).toBe(true);
});

it('refuses a missing declared entry before remote mutation, then publishes only its repaired public selection', async () => {
  const { services, crux, selected } = await communityProject();
  await services.artifact.delete(selected.find((file) => file.meta?.path === 'public/index.html')!);
  const api = await publicationApi(crux);
  setSetting(SettingsKey.ApiUrl, api.url);
  await storeTokens('fixture-account', 'fixture-refresh');
  const files = await services.artifact.findByResource('crux', crux.id);
  const head = await native().client.fileContent!.head(crux.id);
  await expect(publishPipeline(crux, files)).rejects.toThrow('public/index.html');
  expect(api.requests).toEqual([]);
  expect(await native().client.fileContent!.head(crux.id)).toEqual(head);
  expect((await services.crux.findById(crux.id)).meta?.publishedAt).toBeUndefined();
  await services.artifact.create({
    resourceId: crux.id,
    content: '<h1>Repaired visitor</h1>',
    meta: { path: 'public/index.html' },
  });
  await publishPipeline(crux, await services.artifact.findByResource('crux', crux.id));
  expect(api.requests.filter((request) => request.path.endsWith('/publish'))).toHaveLength(1);
});

it.each(['public', 'private'] as const)(
  'keeps the declared selection when a %s file changes during public byte preparation',
  async (scope) => {
    const { services, crux, selected } = await communityProject();
    const api = await publicationApi(crux);
    setSetting(SettingsKey.ApiUrl, api.url);
    await storeTokens('fixture-account', 'fixture-refresh');
    const content = native().client.fileContent!;
    const read = content.read.bind(content);
    const entered = deferred();
    const resume = deferred();
    vi.spyOn(content, 'read').mockImplementationOnce(async (reference) => {
      entered.resolve();
      await resume.promise;
      return read(reference);
    });
    const pending = publishPipeline(crux, selected).then(
      () => null,
      (error: unknown) => error,
    );
    await entered.promise;
    const path = scope === 'public' ? 'public/index.html' : 'private.txt';
    await services.artifact.create({
      resourceId: crux.id,
      content: 'Later local work',
      meta: { path },
    });
    resume.resolve();
    const outcome = await pending;
    if (scope === 'public') {
      expect(outcome).toBeInstanceOf(Error);
      expect(api.requests).toEqual([]);
      expect((await services.crux.findById(crux.id)).meta?.publishedAt).toBeUndefined();
      await publishPipeline(crux, await services.artifact.findByResource('crux', crux.id));
    } else expect(outcome).toBeNull();
    const uploads = api.requests.filter((request) => request.path.endsWith('/publish'));
    expect(uploads).toHaveLength(1);
    expect(uploads[0]!.bytes.toString()).not.toContain('PRIVATE_');
    expect(uploads[0]!.bytes.toString().includes('Later local work')).toBe(scope === 'public');
    const retained = (await services.artifact.findByResource('crux', crux.id)).find(
      (file) => file.meta?.path === path,
    )!;
    expect(await services.artifact.readContent(retained)).toBe('Later local work');
  },
);

it('publishes a native Underrun project with its current source and binary assets without a build', async () => {
  const services = getServices();
  const crux = await services.crux.create({
    title: 'Remixed game',
    kind: 'webapp',
    meta: { template: 'underrun-app' },
  });
  const source = "terminal_write_line('GARDEN REMIX');";
  const image = new Uint8Array([137, 80, 78, 71, 0, 255, 27]);
  for (const [path, content] of [
    ['index.html', '<script src="source/main.js"></script>'],
    ['source/main.js', source],
    ['LICENSE.md', 'Fixture game license'],
  ] as const)
    await services.artifact.create({ resourceId: crux.id, content, meta: { path } });
  await services.artifact.upload({
    resourceId: crux.id,
    blob: new Blob([image], { type: 'image/png' }),
    mimeType: 'image/png',
    meta: { path: 'm/q2.png' },
  });
  const selected = await services.artifact.findByResource('crux', crux.id);
  const api = await publicationApi(crux);
  setSetting(SettingsKey.ApiUrl, api.url);
  await storeTokens('fixture-account-A', 'fixture-refresh-A');
  const phases: string[] = [];

  await publishPipeline(crux, selected, { onProgress: (phase) => phases.push(phase) });

  expect(phases).not.toContain('build');
  const uploads = api.requests.filter((request) => request.path.endsWith('/publish'));
  expect(uploads).toHaveLength(1);
  expect(uploads[0]!.bytes.toString()).toContain(source);
  expect(uploads[0]!.bytes.includes(Buffer.from(image))).toBe(true);
  for (const path of ['index.html', 'source/main.js', 'm/q2.png', 'LICENSE.md'])
    expect(uploads[0]!.bytes.toString()).toContain(`"path":"${path}"`);
  expect((await services.crux.findById(crux.id)).meta?.publishedVersion).toBe(1);
  const sourceFile = (await services.artifact.findByResource('crux', crux.id)).find(
    (file) => file.meta?.path === 'source/main.js',
  )!;
  expect(await services.artifact.readContent(sourceFile)).toBe(source);
});

it.each(['account', 'API address'] as const)(
  'refuses publication if the %s changes while selected source is being collected',
  async (change) => {
    const services = getServices();
    const crux = await services.crux.create({ title: 'Approved for the first account' });
    await services.artifact.create({
      resourceId: crux.id,
      content: '<h1>Only approved for the first account</h1>',
      meta: { path: 'index.html' },
    });
    const selected = await services.artifact.findByResource('crux', crux.id);
    const original = await publicationApi(crux);
    const other = change === 'API address' ? await publicationApi(crux) : original;
    setSetting(SettingsKey.ApiUrl, original.url);
    await storeTokens('fixture-account-A', 'fixture-refresh-A');
    const entered = deferred();
    const resume = deferred();
    const content = native().client.fileContent!;
    const read = content.read.bind(content);
    vi.spyOn(content, 'read').mockImplementationOnce(async (reference) => {
      entered.resolve();
      await resume.promise;
      return read(reference);
    });
    const publication = publishPipeline(crux, selected).then(
      (value) => ({ value, error: null }),
      (error: unknown) => ({ value: null, error }),
    );
    await entered.promise;
    if (change === 'API address') setSetting(SettingsKey.ApiUrl, other.url);
    await storeTokens('fixture-account-B', 'fixture-refresh-B');
    resume.resolve();
    const outcome = await publication;

    expect(
      other.requests.map(({ method, path, authorization }) => ({ method, path, authorization })),
    ).toEqual([]);
    expect(outcome.error).toBeInstanceOf(Error);
    expect((outcome.error as Error).message).toContain('account connection changed');
    expect((await services.crux.findById(crux.id)).meta?.publishedAt).toBeUndefined();
    expect(await services.artifact.readContent(selected[0]!)).toBe(
      '<h1>Only approved for the first account</h1>',
    );
    // A new, explicit action may publish the same saved work under the new connection.
    await publishPipeline(crux, selected);
    expect(other.requests.filter((request) => request.path.endsWith('/publish'))).toHaveLength(1);
  },
);

it('captures the publication account before workspace source preparation starts', async () => {
  const services = getServices();
  const crux = await services.crux.create({ title: 'Preparation ownership' });
  const store = createCruxStore();
  store.setState({ crux });
  const api = await publicationApi(crux);
  setSetting(SettingsKey.ApiUrl, api.url);
  await storeTokens('fixture-account-A', 'fixture-refresh-A');
  vi.spyOn(cues, 'playCue').mockImplementation(async () => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const save = store.getState().saveMeta;
  vi.spyOn(store.getState(), 'saveMeta').mockImplementationOnce(async () => {
    await save();
    await storeTokens('fixture-account-B', 'fixture-refresh-B');
  });

  expect(await store.getState().publishCrux()).toBe(false);
  expect(api.requests).toEqual([]);
  expect(store.getState().publishFailure?.message).toContain('account connection changed');
  expect(store.getState().crux?.id).toBe(crux.id);
  expect(store.getState().publishPhase).toBeNull();
});

it('keeps Function secret delivery on the publication account when it changes between secrets', async () => {
  const services = getServices();
  const crux = await services.crux.create({ title: 'Function account ownership' });
  await services.artifact.create({
    resourceId: crux.id,
    content: 'export default () => ({ status: 200 });',
    meta: { path: 'functions/hello.js' },
  });
  const artifacts = await services.artifact.findByResource('crux', crux.id);
  const store = createCruxStore();
  store.setState({ crux, artifacts });
  const api = await publicationApi(crux);
  setSetting(SettingsKey.ApiUrl, api.url);
  await storeTokens('fixture-account-A', 'fixture-refresh-A');
  vi.spyOn(cues, 'playCue').mockImplementation(async () => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(secrets, 'localSecrets').mockResolvedValue({
    FIRST: 'fixture-one',
    SECOND: 'fixture-two',
  });
  const put = functions.putRemoteSecret;
  vi.spyOn(functions, 'putRemoteSecret').mockImplementation(async (...args) => {
    await put(...args);
    await storeTokens('fixture-account-B', 'fixture-refresh-B');
  });

  expect(await store.getState().publishCrux()).toBe(false);
  expect(
    api.requests
      .filter((request) => request.path.includes('/secrets/'))
      .map((request) => request.path),
  ).toEqual([`/fn/${crux.id}/secrets/FIRST`]);
  expect(
    api.requests.every((request) => request.authorization === 'Bearer fixture-account-A'),
  ).toBe(true);
  expect(store.getState().crux?.meta?.publishedAt).toBeTruthy();
  expect(store.getState().publishFailure?.message).toContain('is published, but');
});
