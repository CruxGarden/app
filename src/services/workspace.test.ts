import { describe, it, expect } from 'vitest';
import { mergeServices, closureFor, kindOf, type WorkspaceService } from './workspace';
import type { ComposeService } from './containers';

/**
 * Discovery for the Runner (ADR 0053). The two rules worth testing without a
 * garden are the ones the whole workspace rests on: a Project Crux takes over
 * the service it provides, and asking for one service gets its closure.
 */
const service = (name: string, extra: Partial<ComposeService> = {}): ComposeService => ({
  name,
  ports: [],
  dependsOn: [],
  healthcheck: false,
  envKeys: [],
  volumes: [],
  profiles: [],
  ...extra,
});

describe('what a Cruxspace can run', () => {
  it('lists a Compose service per row, with what the file said about it', () => {
    const rows = mergeServices(
      {
        cruxId: 'stack-1',
        services: [
          service('postgres', {
            image: 'postgres:16',
            about: 'The database.',
            ports: [{ host: 5432, container: 5432 }],
          }),
          service('api', { image: 'api:1', dependsOn: ['postgres'] }),
        ],
      },
      [],
    );
    expect(rows.map((r) => r.name)).toEqual(['api', 'postgres']);
    expect(rows.find((r) => r.name === 'postgres')?.about).toBe('The database.');
    expect(rows.every((r) => r.from === 'stack')).toBe(true);
    expect(rows.every((r) => r.stackCruxId === 'stack-1')).toBe(true);
  });

  it('marks a service told not to restart as a task, not a service', () => {
    const [row] = mergeServices(
      { cruxId: 's', services: [service('migrations', { restart: 'no' })] },
      [],
    );
    expect(row!.task).toBe(true);
  });

  it('lets a Project Crux take over the service it provides', () => {
    const rows = mergeServices(
      {
        cruxId: 'stack-1',
        services: [
          service('postgres'),
          service('api', { image: 'api:1', dependsOn: ['postgres'] }),
        ],
      },
      [
        {
          cruxId: 'project-1',
          record: { folder: '/checkouts/api', provides: 'api', script: 'dev' },
          runnable: true,
        },
      ],
    );
    const api = rows.find((r) => r.name === 'api')!;
    expect(api.from).toBe('source');
    expect(api.projectCruxId).toBe('project-1');
    expect(api.script).toBe('dev');
    // It is still one row, and it keeps what Compose knew about it.
    expect(rows.filter((r) => r.name === 'api')).toHaveLength(1);
    expect(api.dependsOn).toEqual(['postgres']);
    expect(api.stackCruxId).toBe('stack-1');
  });

  it('adds what only the project knows it needs', () => {
    const rows = mergeServices(
      { cruxId: 's', services: [service('api', { dependsOn: ['postgres'] }), service('postgres')] },
      [
        {
          cruxId: 'p',
          record: { folder: '/c/api', provides: 'api', needs: ['redis'] },
          runnable: true,
        },
      ],
    );
    expect(rows.find((r) => r.name === 'api')!.dependsOn.sort()).toEqual(['postgres', 'redis']);
  });

  it('falls back to the Stack when the project cannot run here, and says why', () => {
    const rows = mergeServices({ cruxId: 's', services: [service('api', { image: 'api:1' })] }, [
      {
        cruxId: 'p',
        record: { provides: 'api' },
        runnable: false,
        reason: 'no folder has been chosen for it on this machine',
      },
    ]);
    const api = rows.find((r) => r.name === 'api')!;
    expect(api.from).toBe('stack');
    expect(api.projectCruxId).toBe('p');
    expect(api.fellBack).toMatch(/no folder/);
  });

  it('keeps a project that provides something no Compose file mentions', () => {
    const rows = mergeServices(null, [
      {
        cruxId: 'p',
        record: { folder: '/c/shell', provides: 'shell-app', script: 'dev', port: 4200 },
        runnable: true,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.from).toBe('source');
    expect(rows[0]!.ports).toEqual([{ host: 4200 }]);
  });

  it('ignores a project that provides nothing — it is not a service yet', () => {
    const rows = mergeServices({ cruxId: 's', services: [service('db')] }, [
      { cruxId: 'p', record: { folder: '/c/thing', script: 'dev' }, runnable: true },
    ]);
    expect(rows.map((r) => r.name)).toEqual(['db']);
  });
});

describe('what must run for a service to work', () => {
  const services: WorkspaceService[] = [
    { name: 'postgres', from: 'stack', ports: [], dependsOn: [], profiles: [], task: false },
    { name: 'redis', from: 'stack', ports: [], dependsOn: [], profiles: [], task: false },
    {
      name: 'migrations',
      from: 'stack',
      ports: [],
      dependsOn: ['postgres'],
      profiles: [],
      task: true,
    },
    {
      name: 'api',
      from: 'stack',
      ports: [],
      dependsOn: ['migrations', 'redis'],
      profiles: [],
      task: false,
    },
    { name: 'reports', from: 'stack', ports: [], dependsOn: ['api'], profiles: [], task: false },
    { name: 'unrelated', from: 'stack', ports: [], dependsOn: [], profiles: [], task: false },
  ];

  it('pulls in everything the thing you asked for needs, and nothing else', () => {
    const closure = closureFor(services, ['reports']);
    expect(closure).toContain('reports');
    expect(closure).toContain('api');
    expect(closure).toContain('migrations');
    expect(closure).toContain('postgres');
    expect(closure).toContain('redis');
    expect(closure).not.toContain('unrelated');
  });

  it('puts what is depended on before what depends on it', () => {
    const closure = closureFor(services, ['api']);
    expect(closure.indexOf('postgres')).toBeLessThan(closure.indexOf('migrations'));
    expect(closure.indexOf('migrations')).toBeLessThan(closure.indexOf('api'));
  });

  it('survives a dependency no file describes', () => {
    const closure = closureFor(
      [{ name: 'api', from: 'stack', ports: [], dependsOn: ['ghost'], profiles: [], task: false }],
      ['api'],
    );
    expect(closure).toEqual(['api']);
  });

  it('answers for something it has never heard of', () => {
    expect(closureFor(services, ['nothing-like-this'])).toEqual([]);
  });
});

describe('telling the Cruxes apart', () => {
  it('reads the kind from the template the Crux was made with', () => {
    expect(kindOf({ meta: { template: 'stack-app' } }).kind).toBe('stack');
    expect(kindOf({ meta: { template: 'project-app' } }).kind).toBe('project');
    expect(kindOf({ meta: { template: 'runner-app' } }).kind).toBe('runner');
    expect(kindOf({ meta: { template: 'notes-app' } }).kind).toBe('other');
    expect(kindOf(null).kind).toBe('other');
  });
});
