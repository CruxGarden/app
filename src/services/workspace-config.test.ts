import { describe, it, expect } from 'vitest';
import {
  assignPorts,
  addressOf,
  connectionsFor,
  envText,
  parseEnv,
  localComposeFor,
} from './workspace-config';
import type { WorkspaceService } from './workspace';

/**
 * The Runner's configuration rules (ADR 0053). Two things decide whether a
 * workspace is pleasant: a port that stays where you left it, and an address
 * that is right from wherever you are asking.
 */
const svc = (name: string, extra: Partial<WorkspaceService> = {}): WorkspaceService => ({
  name,
  from: 'stack',
  ports: [],
  dependsOn: [],
  profiles: [],
  task: false,
  ...extra,
});

describe('giving every service a port this machine can use', () => {
  it('keeps the declared port when nothing else wants it', () => {
    const assigned = assignPorts([svc('postgres', { ports: [{ host: 5432, container: 5432 }] })], {
      taken: [],
    });
    expect(assigned).toEqual([{ service: 'postgres', declared: 5432, port: 5432 }]);
  });

  it('moves a port that is taken, and says why', () => {
    const [row] = assignPorts([svc('api', { ports: [{ host: 3000, container: 3000 }] })], {
      taken: [3000],
      from: 8000,
    });
    expect(row!.port).toBe(8000);
    expect(row!.declared).toBe(3000);
    expect(row!.moved).toMatch(/3000 is in use/);
  });

  it('never hands the same port to two services', () => {
    const assigned = assignPorts(
      [
        svc('one', { ports: [{ host: 9000 }] }),
        svc('two', { ports: [{ host: 9000 }] }),
        svc('three', { ports: [{ host: 9000 }] }),
      ],
      { taken: [], from: 9100 },
    );
    expect(new Set(assigned.map((a) => a.port)).size).toBe(3);
  });

  it('keeps what it chose last time, so a port does not move every morning', () => {
    const services = [svc('api', { ports: [{ host: 3000 }] })];
    // 3000 was taken on the first open, so 8000 was chosen and remembered.
    const first = assignPorts(services, { taken: [3000], from: 8000 });
    expect(first[0]!.port).toBe(8000);
    // Today 3000 is free again, and it still does not move.
    const second = assignPorts(services, { taken: [], remembered: { api: 8000 } });
    expect(second[0]!.port).toBe(8000);
    expect(second[0]!.moved).toMatch(/kept from last time/);
  });

  it('goes back to the declared port when the remembered one is taken', () => {
    // The most predictable place to land is where the file asked for.
    const [row] = assignPorts([svc('api', { ports: [{ host: 3000 }] })], {
      taken: [8000],
      remembered: { api: 8000 },
      from: 8100,
    });
    expect(row!.port).toBe(3000);
    expect(row!.moved).toBeUndefined();
  });

  it('finds a free port when neither the remembered nor the declared one is', () => {
    const [row] = assignPorts([svc('api', { ports: [{ host: 3000 }] })], {
      taken: [8000, 3000],
      remembered: { api: 8000 },
      from: 8100,
    });
    expect(row!.port).toBe(8100);
    expect(row!.moved).toMatch(/8000 is in use/);
  });

  it('skips a service that publishes nothing', () => {
    expect(assignPorts([svc('worker')], { taken: [] })).toEqual([]);
  });
});

describe('where a service is, from where you are asking', () => {
  const postgres = svc('postgres', { ports: [{ host: 55432, container: 5432 }] });
  const api = svc('api', { from: 'source', ports: [{ host: 3000 }] });

  it('is the service name inside Compose', () => {
    expect(addressOf(postgres, 55432, { consumer: 'container' })).toEqual({
      host: 'postgres',
      port: 5432,
    });
  });

  it('is localhost and the published port from this machine', () => {
    expect(addressOf(postgres, 55432, { consumer: 'host' })).toEqual({
      host: '127.0.0.1',
      port: 55432,
    });
  });

  it('is host.docker.internal when a container reaches something run from source', () => {
    expect(addressOf(api, 3000, { consumer: 'container' })).toEqual({
      host: 'host.docker.internal',
      port: 3000,
    });
  });

  it('is localhost when this machine reaches something run from source', () => {
    expect(addressOf(api, 3000, { consumer: 'host' })).toEqual({ host: '127.0.0.1', port: 3000 });
  });
});

describe('what a consumer needs in its environment', () => {
  const services = [
    svc('postgres', { image: 'postgres:16-alpine', ports: [{ host: 55432, container: 5432 }] }),
    svc('redis', { image: 'redis:7-alpine', ports: [{ host: 6379, container: 6379 }] }),
    svc('api', { image: 'ghcr.io/example/api:1', ports: [{ host: 3000, container: 3000 }] }),
  ];
  const ports = { postgres: 55432, redis: 6379, api: 3000 };

  it('gives this machine the addresses that work from this machine', () => {
    const env = connectionsFor(services, ports, { consumer: 'host' });
    expect(env.DATABASE_HOST).toBe('127.0.0.1');
    expect(env.DATABASE_PORT).toBe('55432');
    expect(env.REDIS_URL).toBe('redis://127.0.0.1:6379');
    expect(env.API_URL).toBe('http://127.0.0.1:3000');
  });

  it('gives a container the addresses that work inside Compose', () => {
    const env = connectionsFor(services, ports, { consumer: 'container' });
    expect(env.DATABASE_HOST).toBe('postgres');
    // Inside the network it is the container's own port, not the published one.
    expect(env.DATABASE_PORT).toBe('5432');
    expect(env.REDIS_URL).toBe('redis://redis:6379');
  });

  it('points a container at the host when the service moved to source', () => {
    const moved = services.map((s) => (s.name === 'api' ? { ...s, from: 'source' as const } : s));
    const env = connectionsFor(moved, ports, { consumer: 'container' });
    expect(env.API_URL).toBe('http://host.docker.internal:3000');
    // And the ones still in containers are unchanged.
    expect(env.REDIS_URL).toBe('redis://redis:6379');
  });
});

describe('the files this machine keeps to itself', () => {
  it('writes and reads back its own settings', () => {
    const text = envText({ B: '2', A: '1' }, ['Written by the Runner.']);
    expect(text).toMatch(/^# Written by the Runner\./);
    // Sorted, so a change to the file is a change to the configuration.
    expect(text.indexOf('A=1')).toBeLessThan(text.indexOf('B=2'));
    expect(parseEnv(text)).toEqual({ A: '1', B: '2' });
  });

  it('reads quoted values and ignores what is not a setting', () => {
    expect(parseEnv('# a comment\nexport NAME="value"\nnonsense\nOTHER=2\n')).toEqual({
      NAME: 'value',
      OTHER: '2',
    });
  });

  it('writes a local Compose file only when this machine differs', () => {
    const services = [svc('postgres', { ports: [{ host: 5432, container: 5432 }] })];
    // Nothing moved and nothing runs from source: nothing to write.
    expect(localComposeFor(services, { postgres: 5432 }, [])).toBe('');
    // A moved port is written as an override.
    const moved = localComposeFor(services, { postgres: 55432 }, []);
    expect(moved).toContain('"55432:5432"');
    expect(moved).toContain('# Written by the Runner');
  });

  it('gives containers a way to reach a service running on this machine', () => {
    const services = [svc('worker', { ports: [{ host: 9000, container: 9000 }] })];
    const text = localComposeFor(services, { worker: 9000 }, ['api']);
    // Linux has no host.docker.internal unless the file says so.
    expect(text).toContain('host.docker.internal:host-gateway');
  });
});
