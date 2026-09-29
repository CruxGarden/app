import { test, expect } from '@playwright/test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { runCompose, composeRunner, projectName } =
  require('../dist/containers') as typeof import('../src/containers');
const { composeProcess, composeProcessEnvironment } =
  require('../dist/compose-project') as typeof import('../src/compose-project');

test('existing containers require matching configuration and remain stoppable without source', async () => {
  test.skip(
    process.env.CRUX_COMPOSE_LIFECYCLE_TEST !== '1',
    'Requires an available container engine.',
  );
  const runner = await composeRunner();
  expect(runner).not.toBeNull();
  const folder = mkdtempSync(join(tmpdir(), 'crux-compose-lifecycle-'));
  const cruxId = randomUUID();
  const name = projectName(cruxId);
  const source =
    'services: {app: {image: "ubuntu:24.04", command: ["sh", "-c", "echo crux-owned-canary; sleep 180"]}}\nnetworks: {default: {internal: true}}\n';
  const write = (text: string) => writeFileSync(join(folder, 'compose.yaml'), text);
  const run = (verb: import('../src/containers').ComposeVerb, extra = {}) =>
    runCompose({ cruxId, folder, verb, timeoutMs: 30_000, ...extra }, () => {});
  let oneOff: Promise<unknown> | undefined;
  try {
    write(source);
    expect((await run('up')).code).toBe(0);
    expect((await run('exec', { service: 'app', command: ['echo', 'admitted'] })).output).toContain(
      'admitted',
    );
    oneOff = run('run', {
      service: 'app',
      command: ['sh', '-c', 'echo owned-one-off; sleep 25'],
    }).catch((error) => error);
    await expect
      .poll(async () => (await run('ps')).output)
      .toContain('com.docker.compose.oneoff=True');
    expect(
      (await run('exec', { service: 'app', command: ['echo', 'while-one-off-runs'] })).output,
    ).toContain('while-one-off-runs');
    write(source.replace('sleep 180', 'sleep 179'));
    await expect(
      run('exec', { service: 'app', command: ['echo', 'must-not-run'] }),
    ).rejects.toThrow(/different configuration/);
    await expect(run('start')).rejects.toThrow(/different configuration/);
    write('services: {app: {privileged: true, image: ubuntu}}');
    expect((await run('logs')).output).toContain('crux-owned-canary');
    expect((await run('ps')).output).toContain('running');
    rmSync(join(folder, 'compose.yaml'));
    expect((await run('stop')).code).toBe(0);
    expect((await run('ps')).output).toContain('exited');
    expect((await run('down')).code).toBe(0);
    expect((await run('ps')).output.trim()).toBe('');
    const networks = await composeProcess(
      runner!.program,
      [
        'network',
        'ls',
        '--filter',
        `label=com.docker.compose.project=${name}`,
        '--format',
        '{{json .}}',
      ],
      { cwd: folder, env: composeProcessEnvironment() },
    );
    expect(networks.code).toBe(0);
    expect(networks.stdout.trim()).toBe('');
  } finally {
    // The test owns this entire random project. Keep cleanup independent of the
    // application implementation, and never select another project's resources.
    write(source);
    writeFileSync(join(folder, 'empty.env'), '');
    const cleanup = await composeProcess(
      runner!.program,
      [
        'compose',
        '--env-file',
        join(folder, 'empty.env'),
        '--project-name',
        name,
        '-f',
        join(folder, 'compose.yaml'),
        'down',
        '--remove-orphans',
      ],
      { cwd: folder, env: composeProcessEnvironment() },
    );
    expect(cleanup.code, cleanup.stderr).toBe(0);
    await oneOff;
    rmSync(folder, { recursive: true, force: true });
  }
});

test('existing named resources are checked before Up can reuse them', async () => {
  test.skip(
    process.env.CRUX_COMPOSE_LIFECYCLE_TEST !== '1',
    'Requires an available container engine.',
  );
  const runner = await composeRunner();
  expect(runner).not.toBeNull();
  const folder = mkdtempSync(join(tmpdir(), 'crux-compose-resources-'));
  const cruxId = randomUUID();
  const project = projectName(cruxId);
  const volume = `${project}_data`;
  const network = `${project}_default`;
  const engine = (args: string[]) =>
    composeProcess(runner!.program, args, { cwd: folder, env: composeProcessEnvironment() });
  let madeVolume = false;
  let madeNetwork = false;
  const source =
    'services: {app: {image: "ubuntu:24.04", command: ["sleep", "180"], volumes: ["data:/data"]}}\nvolumes: {data: {}}\nnetworks: {default: {internal: true}}\n';
  writeFileSync(join(folder, 'compose.yaml'), source);
  writeFileSync(join(folder, 'empty.env'), '');
  try {
    // These options allocate memory if mounted; they do not reference any host
    // files. The test never intends to mount it: only metadata is created.
    const created = await engine([
      'volume',
      'create',
      '--label',
      `com.docker.compose.project=${project}`,
      '--label',
      'com.docker.compose.volume=data',
      '--opt',
      'type=tmpfs',
      '--opt',
      'device=tmpfs',
      '--opt',
      'o=size=1m',
      volume,
    ]);
    expect(created.code, created.stderr).toBe(0);
    madeVolume = true;
    await expect(runCompose({ cruxId, folder, verb: 'up' }, () => {})).rejects.toThrow(
      /Existing volume data/,
    );
    expect((await engine(['volume', 'rm', volume])).code).toBe(0);
    madeVolume = false;
    const createdNetwork = await engine([
      'network',
      'create',
      '--internal',
      '--label',
      `com.docker.compose.project=${project}`,
      '--label',
      'com.docker.compose.network=default',
      '--opt',
      'com.docker.network.bridge.enable_icc=false',
      network,
    ]);
    expect(createdNetwork.code, createdNetwork.stderr).toBe(0);
    madeNetwork = true;
    await expect(runCompose({ cruxId, folder, verb: 'up' }, () => {})).rejects.toThrow(
      /Existing network default/,
    );
    expect(
      (
        await engine([
          'ps',
          '--all',
          '--filter',
          `label=com.docker.compose.project=${project}`,
          '--format',
          '{{.ID}}',
        ])
      ).stdout.trim(),
    ).toBe('');
  } finally {
    const cleanup = await engine([
      'compose',
      '--project-name',
      project,
      '--env-file',
      join(folder, 'empty.env'),
      '-f',
      join(folder, 'compose.yaml'),
      'down',
      '--remove-orphans',
    ]);
    expect(cleanup.code, cleanup.stderr).toBe(0);
    if (madeVolume) expect((await engine(['volume', 'rm', volume])).code).toBe(0);
    // Down may already have removed the network. List only this random fixture.
    if (
      madeNetwork &&
      (
        await engine(['network', 'ls', '--filter', `name=${network}`, '--format', '{{.Name}}'])
      ).stdout.trim()
    )
      expect((await engine(['network', 'rm', network])).code).toBe(0);
    rmSync(folder, { recursive: true, force: true });
  }
});
