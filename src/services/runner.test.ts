import { describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  listening: false,
  writes: new Map<string, string>(),
  startedEnv: {} as Record<string, string>,
}));
vi.mock('./workspace-stack', () => ({
  discoverWorkspace: async () => ({
    services: [
      {
        name: 'database',
        from: 'stack',
        stackCruxId: 'stack',
        image: 'postgres:16',
        ports: [{ host: 55432, container: 5432 }],
        dependsOn: [],
        profiles: [],
        task: false,
      },
      {
        name: 'api',
        from: 'source',
        projectCruxId: 'source',
        script: 'dev',
        ports: [{ host: 3000, container: 3000 }],
        dependsOn: ['database'],
        profiles: [],
        task: false,
      },
    ],
  }),
  closureFor: () => ['database', 'api'],
}));
vi.mock('./containers', () => ({
  LOCAL_ENV: '.crux/local.env',
  LOCAL_COMPOSE: '.crux/local.compose.yaml',
  portsInUse: async () => (fixture.listening ? [55432] : []),
  readLocalFile: async (_id: string, file: string) => fixture.writes.get(file) ?? '',
  writeLocalFile: async (_id: string, file: string, content: string) => {
    fixture.writes.set(file, content);
  },
  compose: async () => {
    fixture.listening = true;
    return { code: 0, output: '' };
  },
}));
vi.mock('./project-runner', () => ({
  startProject: async (
    _id: string,
    _folder: string,
    _script: string,
    options: { env: Record<string, string> },
  ) => {
    fixture.startedEnv = options.env;
    return { status: 'running', port: 3000 };
  },
}));
vi.mock('@/services', () => ({
  getServices: () => ({
    artifact: {
      findByResource: async () => [{ type: 'artifact', meta: { path: 'link.json' } }],
      downloadBlob: async () => new Blob([JSON.stringify({ folder: '/owned-test-source' })]),
    },
  }),
}));

import { startWorkspace } from './runner';

describe('starting a workspace', () => {
  it('gives source code the database port that was actually started', async () => {
    fixture.listening = false;
    fixture.writes.clear();
    const result = await startWorkspace('runner', ['api']);
    expect(result.ok).toBe(true);
    expect(fixture.startedEnv.DATABASE_PORT).toBe('55432');
    expect(fixture.startedEnv.DATABASE_HOST).toBe('127.0.0.1');
    expect(fixture.writes.get('.crux/local.compose.yaml')).toContain('127.0.0.1:55432:5432');
  });
});
