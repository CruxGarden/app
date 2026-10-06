import { fork, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const privateApiRoot = process.env.CRUX_TEST_API_ROOT ?? resolve(__dirname, '../../../api');
export const hasPrivateApi = existsSync(join(privateApiRoot, 'test/support/published-app-host.ts'));
if (process.env.CRUX_PRIVATE_ACCEPTANCE === '1' && !hasPrivateApi)
  throw new Error('Private-app acceptance requires the matching full API checkout.');
function apiNode() {
  if (process.env.CRUX_TEST_API_NODE) return process.env.CRUX_TEST_API_NODE;
  const wanted = readFileSync(join(privateApiRoot, '.nvmrc'), 'utf8').trim().replace(/^v/, '');
  const versions = join(process.env.NVM_DIR ?? join(homedir(), '.nvm'), 'versions/node');
  if (!existsSync(versions)) return process.execPath;
  const version = readdirSync(versions)
    .filter((v) => v.startsWith('v' + wanted.split('.')[0] + '.'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .at(-1);
  return version ? join(versions, version, 'bin/node') : process.execPath;
}
export interface PrivateApi {
  url: string;
  crux: string;
  otherCrux: string;
  origin: string;
  ownerToken: string;
  author: string;
  stop: () => Promise<void>;
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  await new Promise<void>((done, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Published-app fixture failed to stop'));
    }, 15000);
    child.once('exit', () => {
      clearTimeout(timer);
      done();
    });
    child.kill('SIGTERM');
  });
}
export async function startPrivateApi(folder: string): Promise<PrivateApi> {
  const child = fork(join(privateApiRoot, 'test/support/published-app-host.ts'), [folder], {
    cwd: privateApiRoot,
    execPath: apiNode(),
    execArgv: [
      '--no-node-snapshot',
      '-r',
      join(privateApiRoot, 'node_modules/ts-node/register/transpile-only'),
    ],
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      NODE_ENV: 'test',
      NURSERY_MODE: 'false',
      JWT_SECRET: 'isolated-private-request-test-only-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let output = '';
  const keep = (chunk: Buffer) => {
    output = (output + chunk.toString()).slice(-4000);
  };
  child.stdout?.on('data', keep);
  child.stderr?.on('data', keep);
  try {
    const ready = await new Promise<Omit<PrivateApi, 'stop'>>((done, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Published-app fixture timed out: ' + output)),
        90000,
      );
      child.once('message', (message) => {
        clearTimeout(timer);
        done(message as Omit<PrivateApi, 'stop'>);
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Published-app fixture exited ${code}: ${output}`));
      });
    });
    return { ...ready, stop: () => stop(child) };
  } catch (error) {
    await stop(child);
    throw error;
  }
}
