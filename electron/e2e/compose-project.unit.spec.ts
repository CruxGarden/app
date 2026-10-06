import { test, expect } from '@playwright/test';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  symlinkSync,
  existsSync,
  linkSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { inspectCompose } = require('../dist/containers') as typeof import('../src/containers');

test('Compose inspection understands YAML structure before allowing a stack', () => {
  const folder = mkdtempSync(join(tmpdir(), 'crux-compose-policy-'));
  const fixtures = {
    flow: 'services: {app: {image: busybox, privileged: true}}',
    quoted: 'services:\n  app:\n    image: busybox\n    "privileged": true',
    alias:
      'x-options: &options {privileged: true}\nservices:\n  app:\n    <<: *options\n    image: busybox',
    bind: 'services: {app: {image: busybox, volumes: [{type: bind, source: /outside-canary, target: /data}]}}',
    include: 'include: /outside-canary/compose.yaml\nservices: {app: {image: busybox}}',
    env: 'services: {app: {image: busybox, env_file: /outside-canary/settings}}',
    build: 'services: {app: {build: ../outside-canary}}',
    capabilities: 'services: {app: {image: busybox, cap_add: [SYS_ADMIN]}}',
    provider: 'services: {app: {provider: {type: arbitrary-program}}}',
    volumeDriver:
      'services: {app: {image: busybox}}\nvolumes: {data: {driver_opts: {type: none, device: /outside-canary, o: bind}}}',
    external: 'services: {app: {image: busybox}}\nvolumes: {data: {external: true}}',
    duplicate: 'services: {app: {image: busybox, privileged: false, privileged: true}}',
  };
  try {
    for (const [label, yaml] of Object.entries(fixtures)) {
      writeFileSync(join(folder, 'compose.yaml'), yaml);
      expect.soft(inspectCompose(folder).refusals, label).not.toEqual([]);
    }
    expect
      .soft(inspectCompose(folder, 'missing.yaml').refusals, 'missing explicit file')
      .not.toEqual([]);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('Compose rejects option-shaped service names and preserves the existing project namespace', async () => {
  const { runCompose, projectName } =
    require('../dist/containers') as typeof import('../src/containers');
  const cruxId = '11111111-1111-4111-8111-111111111111';
  expect(projectName(cruxId)).toBe('crux-111111111111411181111111');
  expect(() => projectName('not-a-crux')).toThrow(/UUID/);
  await expect(
    runCompose(
      {
        cruxId,
        folder: '/unused',
        verb: 'exec',
        service: '--privileged',
        command: ['app', 'echo', 'canary'],
      },
      () => {},
    ),
  ).rejects.toThrow(/service name/);
});

test('managed overrides refuse dangling links and serialize values as YAML data', async () => {
  const { writeOverride, readOverride, writeLocal, LOCAL_ENV } =
    require('../dist/containers') as typeof import('../src/containers');
  const scratch = mkdtempSync(join(tmpdir(), 'crux-compose-overrides-'));
  const { mkdirSync } = require('node:fs') as typeof import('node:fs');
  const folder = join(scratch, 'project');
  mkdirSync(folder);
  const outside = join(scratch, 'outside.yaml');
  try {
    const result = await writeOverride(folder, [
      { service: 'app', environment: { VALUE: 'line\nprivileged: true' } },
    ]);
    expect(result.written).toBe(true);
    expect(inspectCompose(folder).refusals).toEqual([]);
    rmSync(join(folder, 'compose.override.yaml'));
    symlinkSync(outside, join(folder, 'compose.override.yaml'));
    await expect(writeOverride(folder, [])).rejects.toThrow();
    expect(() => readOverride(folder)).toThrow();
    mkdirSync(join(folder, '.crux'));
    symlinkSync(outside, join(folder, LOCAL_ENV));
    expect(() => writeLocal(folder, LOCAL_ENV, 'DATA=canary')).toThrow();
    expect(existsSync(outside)).toBe(false);
    rmSync(join(folder, LOCAL_ENV));
    writeFileSync(outside, 'outside canary');
    linkSync(outside, join(folder, LOCAL_ENV));
    expect(() => writeLocal(folder, LOCAL_ENV, 'replacement')).toThrow();
    expect(readFileSync(outside, 'utf8')).toBe('outside canary');
    rmSync(join(folder, 'compose.override.yaml'));
    writeFileSync(
      outside,
      '# Written by Crux Garden. Yours to edit — once you do, it keeps\nservices: {}\n',
    );
    linkSync(outside, join(folder, 'compose.override.yaml'));
    await expect(writeOverride(folder, [])).rejects.toThrow();
    expect(readFileSync(outside, 'utf8')).toContain('services: {}');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('Compose processes stop on time/output limits and a later command still works', async () => {
  const { composeProcess } =
    require('../dist/compose-project') as typeof import('../src/compose-project');
  const directory = mkdtempSync(join(tmpdir(), 'crux-compose-process-'));
  try {
    await expect(
      composeProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        cwd: directory,
        env: {},
        timeoutMs: 100,
      }),
    ).rejects.toThrow(/time\/output limits/);
    await expect(
      composeProcess(
        process.execPath,
        ['-e', "process.stdout.write('a'.repeat(3 * 1024 * 1024))"],
        { cwd: directory, env: {}, timeoutMs: 5000 },
      ),
    ).rejects.toThrow(/time\/output limits/);
    if (process.platform !== 'win32') {
      const marker = join(directory, 'descendant-canary');
      const child = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'escaped'), 500)`;
      const parent = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(child)}]); setInterval(() => {}, 1000)`;
      await expect(
        composeProcess(process.execPath, ['-e', parent], {
          cwd: directory,
          env: {},
          timeoutMs: 150,
        }),
      ).rejects.toThrow(/time\/output limits/);
      await new Promise((resolve) => setTimeout(resolve, 650));
      expect(existsSync(marker)).toBe(false);
    }
    const answer = await composeProcess(process.execPath, ['-e', "console.log('ok')"], {
      cwd: directory,
      env: {},
    });
    expect(answer).toEqual({ code: 0, stdout: 'ok\n', stderr: '' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
