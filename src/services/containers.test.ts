import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectCompose, projectName } from '../../electron/src/containers';

/**
 * The compose reader (Stack Crux). Two jobs, both tested here because the page
 * is built from the first and the machine's safety rests on the second:
 *
 *   · read a compose file well enough to describe it — services, what each one
 *     is, the ports it publishes, what it waits for;
 *   · refuse a file that reaches past the Crux, naming the reason.
 *
 * A stack is a file someone can hand you, so the refusals are the point.
 */
let folder: string;
const write = (text: string) => writeFileSync(join(folder, 'compose.yaml'), text);

beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), 'crux-compose-'));
});
afterAll(() => {
  rmSync(folder, { recursive: true, force: true });
});

describe('the compose reader', () => {
  it('describes each service from the file, the comment above it included', () => {
    write(`services:
  # The database.
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: garden
      POSTGRES_USER: garden
    ports:
      - "\${POSTGRES_PORT:-5432}:5432"
    volumes:
      - data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready"]

  # Brings the database up to date, then stops.
  migrations:
    image: ghcr.io/example/api:1.2.3
    restart: "no"
    depends_on:
      postgres:
        condition: service_healthy

  api:
    image: ghcr.io/example/api:1.2.3
    ports:
      - "127.0.0.1:8080:3000"
    depends_on:
      - migrations

volumes:
  data:
`);
    const reading = inspectCompose(folder);
    expect(reading.refusals).toEqual([]);
    expect(reading.services.map((s) => s.name)).toEqual(['postgres', 'migrations', 'api']);

    const [postgres, migrations, api] = reading.services;
    expect(postgres!.about).toBe('The database.');
    expect(postgres!.image).toBe('postgres:16-alpine');
    // The default in ${POSTGRES_PORT:-5432} is the port a person will see.
    expect(postgres!.ports).toEqual([{ host: 5432, container: 5432 }]);
    expect(postgres!.healthcheck).toBe(true);
    expect(postgres!.envKeys).toEqual(['POSTGRES_DB', 'POSTGRES_USER']);
    expect(postgres!.volumes).toEqual(['data:/var/lib/postgresql/data']);

    // A service meant to exit, and the long form of depends_on.
    expect(migrations!.restart).toBe('no');
    expect(migrations!.dependsOn).toEqual(['postgres']);
    expect(migrations!.ports).toEqual([]);

    // An address in front of the ports is not the port.
    expect(api!.ports).toEqual([{ host: 8080, container: 3000 }]);
    expect(api!.dependsOn).toEqual(['migrations']);
  });

  it('never reports the values of environment keys, only their names', () => {
    write(`services:
  api:
    image: example:1
    environment:
      JWT_SECRET: hunter2-do-not-leak
`);
    const reading = inspectCompose(folder);
    expect(reading.services[0]!.envKeys).toEqual(['JWT_SECRET']);
    expect(JSON.stringify(reading)).not.toContain('hunter2');
  });

  it.each([
    ['privileged: true', '    privileged: true', /privileged/i],
    ['host networking', '    network_mode: host', /network_mode/],
    ["the host's process list", '    pid: "host"', /pid/],
    [
      'the Docker socket',
      '    volumes:\n      - /var/run/docker.sock:/var/run/docker.sock',
      /socket/i,
    ],
    ['a mount of the whole disk', '    volumes:\n      - /:/host', /outside the Crux/],
    ['a mount of home', '    volumes:\n      - ~/Documents:/docs', /outside the Crux/],
    ['a mount above the Crux', '    volumes:\n      - ../../secrets:/secrets', /above the Crux/],
  ])('refuses %s', (_name, snippet, reason) => {
    write(`services:\n  bad:\n    image: example:1\n${snippet}\n`);
    const reading = inspectCompose(folder);
    expect(reading.refusals.length).toBeGreaterThan(0);
    expect(reading.refusals.join(' ')).toMatch(reason);
  });

  it('allows named volumes and paths inside the Crux', () => {
    write(`services:
  app:
    image: example:1
    volumes:
      - data:/var/lib/data
      - ./config:/etc/app
volumes:
  data:
`);
    expect(inspectCompose(folder).refusals).toEqual([]);
  });

  it('says plainly when there is no stack, rather than pretending there is one', () => {
    const empty = mkdtempSync(join(tmpdir(), 'crux-compose-empty-'));
    try {
      const reading = inspectCompose(empty);
      expect(reading.services).toEqual([]);
      expect(reading.refusals[0]).toMatch(/no compose\.yaml/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('names the project after the crux, so a stop can only reach its own containers', () => {
    const a = projectName('7f3c9a12-4b5d-4e6f-8a9b-0c1d2e3f4a5b');
    const b = projectName('91a2b3c4-5d6e-4f70-8192-a3b4c5d6e7f8');
    expect(a).not.toBe(b);
    expect(a.startsWith('crux-')).toBe(true);
    // Compose is particular about project names: lowercase and no punctuation.
    expect(a).toMatch(/^crux-[a-z0-9]+$/);
  });
});
