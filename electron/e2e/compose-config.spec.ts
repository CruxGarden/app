import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, symlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const { prepareComposeProject, composeProcess } =
  require('../dist/compose-project') as typeof import('../src/compose-project');
const { composeRunner, composeConfig, writeOverride } =
  require('../dist/containers') as typeof import('../src/containers');

// A real Compose parser, without a daemon or starting any containers. CI enables
// this explicitly; ordinary desktop contributors need not install Docker.
test('the actual Compose parser preserves admitted settings, snapshots and port replacements', async () => {
  test.skip(
    process.env.CRUX_COMPOSE_TEST !== '1',
    'Set CRUX_COMPOSE_TEST=1 with Docker Compose or Podman installed.',
  );
  const runner = await composeRunner();
  expect(runner, 'A Compose CLI is required for this integration gate').not.toBeNull();
  const scratch = mkdtempSync(join(tmpdir(), 'crux-compose-canonical-'));
  const folder = join(scratch, 'project');
  mkdirSync(folder);
  const write = (text: string) => writeFileSync(join(folder, 'compose.yaml'), text);
  try {
    write(`services:
  app:
    image: busybox:1.36
    command: ['echo', '$$HOME', '\${MESSAGE:-hello}']
    environment:
      VALUE: \${MESSAGE:-hello}
      PATH: \${PATH:-unset}
      DOCKER_HOST: \${DOCKER_HOST:-unset}
      COMPOSE_FILE: \${COMPOSE_FILE:-unset}
      ABSENT: \${HOME:-no-host-home}
      LOCAL: \${LOCAL}
    ports: ['127.0.0.1:18181:8080']
    volumes: ['data:/data']
  optional:
    image: busybox:1.36
    profiles: [extras]
volumes:
  data:
`);
    writeFileSync(join(folder, '.env'), 'LOCAL=literal-value\nPATH=project-path\n');
    const variables = {
      MESSAGE: 'literal $DOLLAR ${UNEXPANDED}',
      PATH: '/outside-canary',
      DOCKER_HOST: 'unix:///outside-canary',
      COMPOSE_FILE: '../outside-canary',
    };
    const project = await prepareComposeProject(
      runner!.program,
      folder,
      'crux-test',
      ['extras'],
      variables,
    );
    const directory = project.directory;
    try {
      const environment = project.model.services.app.environment as Record<string, string>;
      expect(environment.ABSENT).toBe('no-host-home');
      expect(environment.LOCAL).toBe('literal-value');
      for (const key of ['PATH', 'DOCKER_HOST', 'COMPOSE_FILE'] as const)
        expect(environment[key]).toBe(variables[key]);
      expect(environment.VALUE).toBe(variables.MESSAGE);
      expect(project.args).toContain('extras');
      write('services: {changed: {image: busybox, privileged: true}}');
      const again = await composeProcess(
        runner!.program,
        [...project.args, 'config', '--format', 'json'],
        { cwd: project.directory, env: project.env },
      );
      expect(again.code, again.stderr).toBe(0);
      const decoded = JSON.parse(again.stdout, (_key, value: unknown) =>
        typeof value === 'string' ? value.replaceAll('$$', '$') : value,
      );
      expect(isDeepStrictEqual(decoded, project.model)).toBe(true);
    } finally {
      project.dispose();
    }
    const { existsSync } = await import('node:fs');
    expect(existsSync(directory)).toBe(false);
    write(`services:
  app:
    image: busybox:1.36
    ports: ['127.0.0.1:18181:8080', '127.0.0.1:18190:9090/udp']
`);
    await writeOverride(folder, [{ service: 'app', ports: { '8080': '18182' } }]);
    await writeOverride(folder, [
      { service: 'app', environment: { VALUE: 'literal $KEEP ${THIS}' } },
    ]);
    await writeOverride(folder, [{ service: 'app', ports: { '9090': '18191' } }]);
    const override = await prepareComposeProject(runner!.program, folder, 'crux-test');
    try {
      expect(override.model.services.app.ports).toEqual([
        expect.objectContaining({ published: '18182', host_ip: '127.0.0.1', target: 8080 }),
        expect.objectContaining({
          published: '18191',
          host_ip: '127.0.0.1',
          target: 9090,
          protocol: 'udp',
        }),
      ]);
      expect(override.model.services.app.environment).toEqual({ VALUE: 'literal $KEEP ${THIS}' });
    } finally {
      override.dispose();
    }
    rmSync(join(folder, 'compose.override.yaml'));
    write(readFileSync(join(__dirname, '../../stack-crux/compose.yaml'), 'utf8'));
    await expect(prepareComposeProject(runner!.program, folder, 'crux-test')).rejects.toThrow(
      /JWT_SECRET/,
    );
    const nursery = await prepareComposeProject(runner!.program, folder, 'crux-test', [], {
      JWT_SECRET: 'owned-test-secret-with-at-least-32-characters',
    });
    try {
      for (const service of Object.values(nursery.model.services)) {
        for (const port of (service.ports ?? []) as { host_ip: string }[])
          expect(port.host_ip).toBe('127.0.0.1');
      }
      expect(nursery.model.services.api.environment).toMatchObject({
        NODE_ENV: 'development',
        CORS_ORIGIN: 'http://localhost:8080',
        JWT_SECRET: 'owned-test-secret-with-at-least-32-characters',
      });
      expect(nursery.model.services.migrations.environment).toMatchObject({ NURSERY_MODE: 'true' });
    } finally {
      nursery.dispose();
    }

    const nurserySecrets = { JWT_SECRET: 'owned-test-secret-with-at-least-32-characters' };
    const preview = await composeConfig(folder, [], nurserySecrets);
    expect(preview.error).toBeUndefined();
    expect(preview.services.find((service) => service.name === 'api')?.environment.JWT_SECRET).toBe(
      '[secret]',
    );
    expect(JSON.stringify(preview)).not.toContain(nurserySecrets.JWT_SECRET);
    await writeOverride(
      folder,
      [{ service: 'postgres', ports: { '5432': '25432' } }],
      'compose.override.yaml',
      nurserySecrets,
    );
    expect(readFileSync(join(folder, 'compose.override.yaml'), 'utf8')).not.toContain(
      nurserySecrets.JWT_SECRET,
    );
    const changed = await composeConfig(folder, [], nurserySecrets);
    expect(changed.error).toBeUndefined();
    expect(changed.services.find((service) => service.name === 'postgres')?.ports[0].host).toBe(
      '25432',
    );
    rmSync(join(folder, 'compose.override.yaml'));
    write('services: {app: {image: busybox, environment: {LITERAL_$NAME: literal}}}');
    await expect(prepareComposeProject(runner!.program, folder, 'crux-test')).rejects.toThrow(
      /mapping keys/,
    );
    const privatePath = 'private\nmetadata-canary';
    write(
      'services: {app: {image: busybox, volumes: [{type: volume, source: data, target: "/${PRIVATE_PATH}"}]}}\nvolumes: {data: {}}',
    );
    const privateMetadata = await composeConfig(folder, [], { PRIVATE_PATH: privatePath });
    expect(privateMetadata.error).toMatch(/secret.*public service metadata/);
    expect(privateMetadata.services).toEqual([]);
    write('services: {app: {image: busybox, volumes: ["${MOUNT}:/data"]}}');
    await expect(
      prepareComposeProject(runner!.program, folder, 'crux-test', [], { MOUNT: '/outside-canary' }),
    ).rejects.toThrow(/outside the Crux/);
    // Canonical JSON escapes dollar signs. Containment checks need the actual
    // decoded path, otherwise a dollar-named symlink is checked under the wrong name.
    const outside = join(scratch, 'outside');
    mkdirSync(outside);
    symlinkSync(outside, join(folder, 'cash$money'));
    await expect(
      prepareComposeProject(runner!.program, folder, 'crux-test', [], { MOUNT: './cash$money' }),
    ).rejects.toThrow(/outside the Crux/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
