import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const version = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')).version;
const credentials = {
  MAC_CERT_P12: 'test-certificate',
  MAC_CERT_PASSWORD: 'test-password',
  APPLE_ID: 'test-id',
  APPLE_APP_SPECIFIC_PASSWORD: 'test-notary-password',
  APPLE_TEAM_ID: 'test-team',
};
const run = (env: NodeJS.ProcessEnv) =>
  spawnSync(process.execPath, [resolve(__dirname, '../scripts/release-policy.mjs')], {
    env,
    encoding: 'utf8',
  });
const tag = { GITHUB_EVENT_NAME: 'push', GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: `v${version}` };

test('a release tag requires every signing and notarization input before producing publish output', () => {
  for (const key of Object.keys(credentials)) {
    const result = run({ ...tag, ...credentials, [key]: '  ' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(key);
    expect(result.stdout).not.toContain('publish=always');
    expect(result.stderr).not.toContain('test-password');
  }
  const accepted = run({ ...tag, ...credentials });
  expect(accepted.status).toBe(0);
  expect(accepted.stdout).toContain('publish=always');
});

test('manual dispatch never publishes, including when a release tag and credentials are selected', () => {
  for (const inputs of [{}, credentials]) {
    const result = run({ ...tag, ...inputs, GITHUB_EVENT_NAME: 'workflow_dispatch' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('publish=never');
  }
});

test('branch pushes do not publish and mismatched release tags fail', () => {
  expect(run({ ...tag, GITHUB_REF_TYPE: 'branch' }).stdout).toContain('publish=never');
  const result = run({ ...tag, ...credentials, GITHUB_REF_NAME: 'v0.0.0-wrong' });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('must match');
});
