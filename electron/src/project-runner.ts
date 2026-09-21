/**
 * Running a project that lives outside the Crux.
 *
 * A Stack Crux runs the services around your code; this runs the code itself —
 * the shell-app, the API, whatever you have checked out. The code stays where
 * it is, in its own repository, and the Crux is how it runs here: which
 * script, on which port, with which environment, and what it said.
 *
 * **A folder becomes runnable only by being chosen in the OS dialog.** That is
 * the whole approval story, and it is deliberately not something a file can
 * grant: a Crux that arrives from someone else, naming a path in a document,
 * cannot start anything until the person points at a folder themselves. The
 * approvals live in the app's own data, never in the Crux, so they do not
 * travel with it.
 *
 * Scripts run through the bundled pnpm on Electron's own Node, so a machine
 * without Node, npm or pnpm on its PATH still works. `pnpm run` executes what
 * `package.json` says whichever package manager installed it.
 */
import * as fs from 'fs';
import * as path from 'path';
import { spawn, execFile, type ChildProcess } from 'child_process';

const { app } = require('electron');
const { pnpmEntry, pnpmEnv } = require('./pnpm');

export type ProjectStatus = 'idle' | 'starting' | 'running' | 'stopped' | 'crashed';

export interface ProjectInfo {
  folder: string;
  /** The `name` in package.json, when there is one. */
  name?: string;
  /** Script names it offers, in the order package.json lists them. */
  scripts: string[];
  /** What installed it, read from the lockfile — it is run with pnpm either way. */
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' | 'unknown';
  /** Whether dependencies are present; running without them usually fails. */
  installed: boolean;
}

export interface ProjectState {
  status: ProjectStatus;
  script?: string;
  port?: number;
  pid?: number;
  /** The last lines it wrote, newest last. */
  log: string;
  startedAt?: number;
  /** Why it is not running, when it stopped badly. */
  exit?: number;
}

interface Running {
  proc: ChildProcess;
  state: ProjectState;
}

const running = new Map<string, Running>();

/** Folders the person has chosen. Kept in the app's data, never in a Crux. */
function approvalsFile(): string {
  return path.join(app.getPath('userData'), 'approved-folders.json');
}

function approvals(): string[] {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(approvalsFile(), 'utf8'));
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Record that the person chose this folder. Only the OS dialog calls this. */
export function approveFolder(folder: string): void {
  const at = path.resolve(folder);
  const all = new Set(approvals());
  all.add(at);
  fs.mkdirSync(path.dirname(approvalsFile()), { recursive: true });
  fs.writeFileSync(approvalsFile(), JSON.stringify([...all], null, 2));
}

export function folderApproved(folder: string): boolean {
  const at = path.resolve(folder);
  return approvals().some((approved) => at === approved || at.startsWith(approved + path.sep));
}

export function forgetFolder(folder: string): void {
  const at = path.resolve(folder);
  fs.writeFileSync(
    approvalsFile(),
    JSON.stringify(
      approvals().filter((approved) => approved !== at),
      null,
      2,
    ),
  );
}

/** What a folder offers: its scripts, and whether it is ready to run. */
export function readProject(folder: string): ProjectInfo | null {
  const at = path.resolve(folder);
  const manifest = path.join(at, 'package.json');
  if (!fs.existsSync(manifest)) return null;
  let parsed: { name?: string; scripts?: Record<string, string> };
  try {
    parsed = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  } catch {
    return { folder: at, scripts: [], packageManager: 'unknown', installed: false };
  }
  const lock = (file: string) => fs.existsSync(path.join(at, file));
  return {
    folder: at,
    name: typeof parsed.name === 'string' ? parsed.name : undefined,
    scripts: Object.keys(parsed.scripts ?? {}),
    packageManager: lock('pnpm-lock.yaml')
      ? 'pnpm'
      : lock('yarn.lock')
        ? 'yarn'
        : lock('bun.lockb')
          ? 'bun'
          : lock('package-lock.json')
            ? 'npm'
            : 'unknown',
    installed: fs.existsSync(path.join(at, 'node_modules')),
  };
}

export function projectState(cruxId: string): ProjectState {
  return running.get(cruxId)?.state ?? { status: 'idle', log: '' };
}

export interface StartProjectOptions {
  cruxId: string;
  folder: string;
  script: string;
  /** Arguments after the script name, as a list — never a command line. */
  args?: string[];
  /** Offered to the project as PORT; most servers read it, some want a flag. */
  port?: number;
  /** Environment for the run: a Stack's connections, the Crux's secrets. */
  env?: Record<string, string>;
}

/**
 * Start a script. One run per Crux: starting again replaces what was there,
 * because two copies of a dev server fighting over a port helps nobody.
 */
export async function startProject(opts: StartProjectOptions): Promise<ProjectState> {
  const folder = path.resolve(opts.folder);
  if (!folderApproved(folder))
    throw new Error(
      'Choose this folder in Crux Garden before running it — a Crux cannot point itself at a folder you have not picked.',
    );
  if (!fs.existsSync(path.join(folder, 'package.json')))
    throw new Error('There is no package.json in that folder.');
  const info = readProject(folder);
  if (!info?.scripts.includes(opts.script))
    throw new Error(`That folder has no "${opts.script}" script.`);
  for (const arg of opts.args ?? [])
    if (typeof arg !== 'string' || arg.includes('\0')) throw new Error('Bad argument.');
  for (const name of Object.keys(opts.env ?? {}))
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) throw new Error(`Not a setting name: ${name}`);

  await stopProject(opts.cruxId);

  const args = [pnpmEntry(), 'run', opts.script, ...(opts.args ?? [])];
  const state: ProjectState = {
    status: 'starting',
    script: opts.script,
    port: opts.port,
    log: '',
    startedAt: Date.now(),
  };
  const proc = spawn(process.execPath, args, {
    cwd: folder,
    // Its own process group, so stopping takes the children too. Windows has
    // no groups and `detached` there opens a console window, so taskkill /T
    // does that job instead (see stopProject).
    detached: process.platform !== 'win32',
    env: pnpmEnv({
      ...(opts.port ? { PORT: String(opts.port) } : {}),
      ...(opts.env ?? {}),
    }),
  });
  state.pid = proc.pid;

  const keep = (chunk: Buffer) => {
    state.log += String(chunk);
    if (state.log.length > 200_000) state.log = state.log.slice(-100_000);
    if (state.status === 'starting') state.status = 'running';
  };
  proc.stdout?.on('data', keep);
  proc.stderr?.on('data', keep);
  proc.on('close', (code) => {
    state.exit = code ?? -1;
    state.status = state.status === 'stopped' ? 'stopped' : code === 0 ? 'stopped' : 'crashed';
    state.pid = undefined;
  });
  proc.on('error', (error) => {
    state.log += `\n${String(error)}`;
    state.status = 'crashed';
  });

  running.set(opts.cruxId, { proc, state });
  return state;
}

/** Stop a run, and the children it started. */
export async function stopProject(cruxId: string): Promise<void> {
  const found = running.get(cruxId);
  if (!found) return;
  found.state.status = 'stopped';
  const pid = found.proc.pid;
  running.delete(cruxId);
  if (!pid) return;
  // `npm run dev` is a parent: the server is its child, so the whole tree has
  // to go or the port stays held. Windows has no process groups, so the only
  // way to reach the children is taskkill /T.
  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => {});
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      found.proc.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
  // Give it a moment, then insist.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    /* it went quietly */
  }
}

/** Everything this app started, stopped — for shutdown. */
export async function stopAllProjects(): Promise<void> {
  await Promise.all([...running.keys()].map((cruxId) => stopProject(cruxId)));
}
