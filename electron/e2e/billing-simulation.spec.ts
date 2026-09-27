import { fork, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';

const apiRoot = process.env.CRUX_TEST_API_ROOT ?? resolve(__dirname, '../../../api');
test.skip(
  !existsSync(join(apiRoot, 'test/support/billing-simulation-host.ts')),
  'Cross-repository integration requires the matching API checkout (CRUX_TEST_API_ROOT).',
);

/**
 * The API's own Node, as `nvm use` in `api/` would pick it: its native
 * better-sqlite3 binding is built for the version in `api/.nvmrc`, and the
 * Electron suite runs on a newer Node (a different NODE_MODULE_VERSION). The
 * exact version when installed, else the newest installed with the same
 * major; the current process as the last resort.
 */
function apiNode(): string {
  const wanted = existsSync(join(apiRoot, '.nvmrc'))
    ? readFileSync(join(apiRoot, '.nvmrc'), 'utf8').trim().replace(/^v/, '')
    : '';
  if (!wanted || wanted === process.versions.node) return process.execPath;
  const nvmDir = process.env.NVM_DIR ?? join(homedir(), '.nvm');
  const versions = join(nvmDir, 'versions/node');
  if (!existsSync(versions)) return process.execPath;
  const binary = (version: string) => join(versions, version, 'bin/node');
  if (existsSync(binary(`v${wanted}`))) return binary(`v${wanted}`);
  const major = wanted.split('.')[0]!;
  const newest = readdirSync(versions)
    .filter((v) => v.startsWith(`v${major}.`))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .at(-1);
  return newest && existsSync(binary(newest)) ? binary(newest) : process.execPath;
}

async function startBilling(filename: string, fallback: string, port = '0') {
  const child = fork(
    join(apiRoot, 'test/support/billing-simulation-host.ts'),
    [filename, fallback, port],
    {
      cwd: apiRoot,
      execPath: apiNode(),
      execArgv: ['-r', join(apiRoot, 'node_modules/ts-node/register/transpile-only')],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  );
  let output = '';
  child.stdout?.on('data', (chunk) => {
    output = (output + chunk).slice(-4000);
  });
  child.stderr?.on('data', (chunk) => {
    output = (output + chunk).slice(-4000);
  });
  try {
    const url = await new Promise<string>((resolveUrl, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Billing fixture timed out: ${output}`)),
        20000,
      );
      child.once('message', (message: { url: string }) => {
        clearTimeout(timer);
        resolveUrl(message.url);
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Billing fixture exited ${code}: ${output}`));
      });
    });
    return { child, url };
  } catch (error) {
    child.kill('SIGTERM');
    throw error;
  }
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolveExit, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Billing fixture did not stop'));
    }, 10000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolveExit();
    });
    child.kill('SIGTERM');
  });
}

test('persistent simulation: checkout, failure, API + desktop restart, recovery, plan change and cancellation', async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'crux-e2e-billing-'));
  const mock = await startMockApi();
  let billing = await startBilling(join(fixtureDir, 'billing.db'), mock.url);
  const env = { CRUX_API_URL: billing.url, CRUX_AI_MOCK: '1' };
  let desktop = await launchApp({ env });
  try {
    let page = desktop.page;
    await page.getByRole('button', { name: /enter/i }).click();
    await page.getByText('Plant a new garden').click();
    await page.getByRole('button', { name: 'Welcome' }).click();
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('button', { name: /^Settings/ }).click();
    await page.getByPlaceholder('email@example.com').fill('tester@example.com');
    await page.getByRole('button', { name: 'Send Code' }).click();
    await page.getByPlaceholder('Enter code').fill('123456');
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    let plan = page.getByTestId('plan-settings');
    await expect(plan.getByTestId('billing-simulation')).toContainText('no payments');
    await plan.getByRole('button', { name: 'Choose Gardener', exact: true }).click();
    await expect(plan.getByTestId('plan-status')).toContainText('Gardener');
    await plan.getByRole('button', { name: 'Payment fails', exact: true }).click();
    await expect(plan.getByTestId('plan-status')).toContainText('payment failed');
    await expect(plan.getByRole('button', { name: 'Manage billing' })).toHaveCount(0);
    await desktop.app.close();
    const port = new URL(billing.url).port;
    await stop(billing.child);
    billing = await startBilling(join(fixtureDir, 'billing.db'), mock.url, port);
    desktop = await launchApp({ env, dir: desktop.dir });
    page = desktop.page;
    await page.getByRole('button', { name: /^Enter$/ }).click();
    await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('button', { name: /^Settings/ }).click();
    plan = page.getByTestId('plan-settings');
    await expect(plan.getByTestId('plan-status')).toContainText('payment failed');
    await plan.getByRole('button', { name: 'Payment succeeds', exact: true }).click();
    await expect(plan.getByTestId('billing-simulation')).toContainText('Status: active');
    await plan.getByRole('button', { name: 'Yearly', exact: true }).click();
    await plan.getByRole('button', { name: 'Choose Gardener Plus', exact: true }).click();
    await expect(plan.getByTestId('plan-status')).toContainText('Gardener Plus');
    await plan.getByRole('button', { name: 'Cancel at period end', exact: true }).click();
    await expect(plan.getByTestId('plan-status')).toContainText('ends');
    await plan.getByRole('button', { name: 'Next renewal', exact: true }).click();
    await expect(plan.getByTestId('plan-status')).toContainText('Free');
    await expect(plan.getByTestId('billing-simulation')).toContainText('Status: canceled');
    // The subscription came from the actual API, not the fallback mock's state.
    expect(mock.state.billing.checkouts).toBe(0);
    await expect(plan.getByText(/Could not/)).toHaveCount(0);
  } finally {
    await desktop.app.close().catch(() => {});
    await stop(billing.child);
    await mock.close();
  }
});
