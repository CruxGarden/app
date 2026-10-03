import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { clearTokens, storeTokens } from '@/api/session';
import { SettingsKey } from '@/lib/constants';
import { localApiFixture } from '@/test/local-api-fixture';
import { allWorkspaces, closeWorkspace, openWorkspace } from '@/stores/workspaceRegistry';
import { starterManifest } from '@/templates/tool-starter';
import { getServices, initServices } from './index';
import { packTool } from './crux-tools/package';
import { installToolFile } from './crux-tools/files';
import { forgetInstalledTool, recordInstalledTool } from './crux-tools/installed';
import { applyTemplateToCrux } from './crux-create';
import { createTask, prepareTaskReview, recoverTaskSetup } from './tasks';
import { findWorkingCopy, listWorkingCopies, workingCopyDocument } from './working-copies';
import { nativeAppType } from './embedded-app';
import { notebookSession } from './notebook';
import { publicationPlan } from './publication-plan';
import { publishPipeline } from './publish';
import { flushSettings, setSetting } from './settings';

const native = localApiFixture({ project: true });
let server: Server | undefined;
beforeEach(async () => {
  await initServices();
  setSetting(SettingsKey.InstalledTools, '{}');
  await flushSettings();
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
  await clearTokens();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await clearTokens();
  if (server) {
    const current = server;
    server = undefined;
    await new Promise<void>((resolve, reject) => {
      current.close((error) => (error ? reject(error) : resolve()));
      current.closeAllConnections();
    });
  }
});

async function communityProject() {
  const manifest = {
    ...starterManifest,
    id: 'unknown-task-publication',
    app: 'unknown-task-publication',
    share: true,
    document: {
      path: 'data/project.json',
      seed: { version: 1, app: 'unknown-task-publication', text: 'Original document' },
    },
    publication: { type: 'static' as const, root: 'public/', include: ['data/project.json'] },
  };
  const files = [
    ['index.html', 'PRIVATE_EDITOR_SOURCE'],
    ['garden/client.js', 'PRIVATE_EDITOR_BRIDGE'],
    ['private.txt', 'PRIVATE_WORK_SENTINEL'],
    ['public/index.html', '<h1>Public edition</h1>'],
    ['data/project.json', JSON.stringify(manifest.document.seed)],
  ].map(([path, content]) => ({ path: path!, blob: new Blob([content!]), mimeType: 'text/plain' }));
  const installed = await installToolFile(await packTool(manifest, files));
  const main = await getServices().crux.create({ title: 'Unknown tool result', type: 'workspace' });
  await applyTemplateToCrux(main, installed.id, 'webapp');
  const snapshot = structuredClone((await getServices().crux.findById(main.id)).meta!.toolManifest);
  return { main, installed, manifest, snapshot };
}

async function restart() {
  for (const workspace of allWorkspaces())
    await closeWorkspace(workspace.id, { stop: true, documents: 'discard' });
  await flushSettings();
  await native().restart();
  await initServices();
}

it('retains an unfamiliar tool snapshot in Tasks and review copies after parent changes, uninstall and restart', async () => {
  const { main, installed, manifest, snapshot } = await communityProject();
  const task = await createTask(main.id, 'Tool Task');
  const review = await prepareTaskReview(task.id);
  for (const id of [task.id, review.candidateId])
    expect((await workingCopyDocument(id))?.meta?.toolManifest).toEqual(snapshot);

  // Neither a newer installation nor later parent metadata retargets retained copies.
  recordInstalledTool({ ...installed, manifest: { ...manifest, app: 'changed-installation' } });
  await getServices().crux.update(main.id, {
    meta: { toolManifest: { ...manifest, app: 'changed-parent' } },
  });
  forgetInstalledTool(installed.id);
  await restart();
  for (const id of [task.id, review.candidateId]) {
    const workspace = await openWorkspace(id);
    const copy = workspace.data.getState().crux!;
    expect(copy.meta?.toolManifest).toEqual(snapshot);
    expect(nativeAppType(copy)).toBe(manifest.app);
    const plan = publicationPlan(copy, workspace.data.getState().artifacts);
    expect(plan.kind).toBe('static');
    if (plan.kind !== 'static') throw new Error('Expected the retained static publication');
    expect(plan.files.map((file) => file.path).sort()).toEqual(['data/project.json', 'index.html']);
    const bridge = notebookSession(workspace.data);
    const document = (await bridge({ op: 'read', path: 'project.json' })) as {
      content: string;
      fingerprint: string;
    };
    expect(JSON.parse(document.content).text).toBe('Original document');
    await bridge({
      op: 'write',
      path: 'project.json',
      expected: document.fingerprint,
      content: JSON.stringify({ ...manifest.document.seed, text: `Saved by ${id}` }),
    });
    const folder = (await findWorkingCopy(id))!.projectFolder!;
    expect(JSON.parse(await readFile(join(folder, 'data/project.json'), 'utf8')).text).toBe(
      `Saved by ${id}`,
    );
    expect(await readFile(join(folder, 'private.txt'), 'utf8')).toBe('PRIVATE_WORK_SENTINEL');
  }
  const mainFile = (await getServices().artifact.findByResource('crux', main.id)).find(
    (file) => file.meta?.path === 'data/project.json',
  )!;
  expect(JSON.parse(await getServices().artifact.readContent(mainFile)).text).toBe(
    'Original document',
  );

  // Both actual entry points retain the Main-only publication rule, before remote access.
  const requests: string[] = [];
  server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    response.setHeader('Content-Type', 'application/json');
    response.end('{}');
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing API listener');
  setSetting(SettingsKey.ApiUrl, `http://127.0.0.1:${address.port}`);
  await storeTokens('fixture-task-account', 'fixture-task-refresh');
  const data = (await openWorkspace(task.id)).data;
  await expect(publishPipeline(data.getState().crux!, data.getState().artifacts)).rejects.toThrow(
    'Publish from Main after merging this task.',
  );
  expect(await data.getState().publishCrux()).toBe(false);
  expect(data.getState().publishFailure?.message).toBe(
    'Publish from Main after merging this task.',
  );
  expect(requests).toEqual([]);
});

it('keeps the same unfamiliar tool snapshot through failed native Task setup, restart and retry', async () => {
  const { main, installed, manifest, snapshot } = await communityProject();
  vi.spyOn(native().client, 'prepareWorkingCopyFolder').mockRejectedValueOnce(
    new Error('Folder setup refused'),
  );
  await expect(createTask(main.id, 'Recoverable tool Task')).rejects.toThrow(
    'Folder setup refused',
  );
  const [failed] = await listWorkingCopies(main.id);
  expect(failed?.phase).toBe('failed');
  expect(failed?.meta.toolManifest).toEqual(snapshot);
  vi.restoreAllMocks();
  await getServices().crux.update(main.id, {
    meta: { toolManifest: { ...manifest, app: 'later-parent' } },
  });
  forgetInstalledTool(installed.id);
  await restart();
  await recoverTaskSetup(failed!.id);
  const copy = (await findWorkingCopy(failed!.id))!;
  expect(copy.phase).toBe('ready');
  expect(copy.meta.toolManifest).toEqual(snapshot);
  const workspace = await openWorkspace(copy.id);
  expect(nativeAppType(workspace.data.getState().crux)).toBe(manifest.app);
  const document = (await notebookSession(workspace.data)({
    op: 'read',
    path: 'project.json',
  })) as { content: string };
  expect(JSON.parse(document.content).text).toBe('Original document');
  expect(await readFile(join(copy.projectFolder!, 'private.txt'), 'utf8')).toBe(
    'PRIVATE_WORK_SENTINEL',
  );
});
