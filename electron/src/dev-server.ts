import { claimPreviewPort, releasePreviewPort, previewPortClaimed } from './preview-ports';
const { spawn, execFile } = require('child_process');
const { pnpmEntry, pnpmEnv } = require('./pnpm');
const http = require('http');
const net = require('net');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

/**
 * Site-crux dev servers — one per Project Folder, on an ephemeral port
 * (per-crux origin isolation, same as the static preview server).
 *
 * Astro-only, deliberately: this runs `pnpm exec astro dev --port …` rather
 * than the project's own `dev` script, because the port is load-bearing and
 * `pnpm run dev -- --port` does not reach the tool — pnpm forwards a literal
 * `--`, Astro ignores the flags, and the server quietly binds its default
 * port instead, colliding with every other open crux. Supporting a second
 * framework means teaching this function that framework's port flag.
 *
 * Readiness is detected by polling the port — robust across log formats.
 * Processes are spawned detached (their own process group) so kill(-pid)
 * takes down any children; everything dies with the app.
 */

export type DevStatus = 'starting' | 'ready' | 'crashed' | 'stopped';

interface RunningDev {
  proc: any;
  port: number;
  url: string;
  status: DevStatus;
  log: string;
  owner: object;
  readyFile: string;
  token: string;
  temp: string;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** True when nothing on 127.0.0.1 holds `port` right now. */
function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

/** What a caller may ask of start(): a port they would like, a patience limit. */
export interface DevStartOptions {
  /** Preferred port (1024–65535). Taken when free; otherwise an ephemeral one, and `portFallback` says so. */
  port?: number;
  timeoutMs?: number;
}

/**
 * Pick the port a dev server should listen on: the preferred one when it is
 * legal and free, else an ephemeral one. Pure given the two probes, so the
 * rule is testable without sockets.
 */
export async function pickPort(
  preferred: number | undefined,
  isFree: (port: number) => Promise<boolean> = portFree,
  ephemeral: () => Promise<number> = freePort,
): Promise<{ port: number; fallback: boolean }> {
  const legal =
    typeof preferred === 'number' &&
    Number.isInteger(preferred) &&
    preferred >= 1024 &&
    preferred <= 65535;
  if (legal && (await isFree(preferred as number)))
    return { port: preferred as number, fallback: false };
  return { port: await ephemeral(), fallback: legal };
}

function probe(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 1000 }, (res: any) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

export class DevServerManager {
  private running = new Map<string, RunningDev>();
  private starting = new Map<string, Promise<string>>();
  private starts = new Map<string, AbortController>();
  private stopping = new Map<string, Promise<void>>();
  /** Output of the last process per folder that exited without becoming ready. */
  private lastOutput = new Map<string, string>();

  constructor(
    private resolveKnownFolder: (folder: string) => string,
    private onStatus?: (folder: string, status: DevStatus, url: string | null) => void,
    private launchProcess?: (cwd: string, port: number, readyFile: string, token: string) => any,
  ) {}

  status(folder: string): { status: DevStatus | 'idle'; url: string | null } {
    const dev = this.running.get(this.resolveKnownFolder(folder));
    return dev ? { status: dev.status, url: dev.url } : { status: 'idle', url: null };
  }

  /** Start (or reuse) the project's dev server. Resolves when it answers HTTP. */
  start(folder: string, opts: DevStartOptions | number = {}): Promise<string> {
    const cwd = this.resolveKnownFolder(folder);
    const pending = this.starting.get(cwd);
    if (pending) return pending;
    const previousStop = this.stopping.get(cwd);
    const controller = new AbortController();
    this.starts.set(cwd, controller);
    const run = Promise.resolve().then(async () => {
      await previousStop;
      return this.startOwned(cwd, opts, controller.signal);
    });
    this.starting.set(cwd, run);
    void run
      .finally(() => {
        if (this.starting.get(cwd) === run) this.starting.delete(cwd);
        if (this.starts.get(cwd) === controller) this.starts.delete(cwd);
      })
      .catch(() => {});
    return run;
  }

  private async startOwned(
    folder: string,
    opts: DevStartOptions | number = {},
    signal?: AbortSignal,
  ): Promise<string> {
    signal?.throwIfAborted();
    const options: DevStartOptions = typeof opts === 'number' ? { timeoutMs: opts } : opts;
    const timeoutMs = options.timeoutMs ?? 120_000;
    const cwd = this.resolveKnownFolder(folder);
    const existing = this.running.get(cwd);
    if (existing && (existing.status === 'ready' || existing.status === 'starting')) {
      if (existing.status === 'ready') return existing.url;
      return this.waitReady(cwd, timeoutMs, signal);
    }

    const owner = {};
    let selected: { port: number; fallback: boolean } | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = await pickPort(
        options.port,
        async (p) => !previewPortClaimed(p) && (await portFree(p)),
      );
      if (claimPreviewPort(candidate.port, owner)) {
        selected = candidate;
        break;
      }
    }
    if (!selected) throw new Error('Could not allocate a distinct preview port. Try again.');
    if (signal?.aborted) {
      releasePreviewPort(selected.port, owner);
      signal.throwIfAborted();
    }
    const { port, fallback } = selected;
    if (fallback) this.lastOutput.set(cwd, `port ${options.port} is in use; using ${port}`);
    const url = `http://127.0.0.1:${port}`;

    let temp: string;
    try {
      temp = fs.mkdtempSync(path.join(os.tmpdir(), 'crux-preview-'));
    } catch (error) {
      releasePreviewPort(port, owner);
      throw error;
    }
    const readyFile = path.join(temp, 'ready.json');
    const token = randomUUID();
    const hook = path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'dev-listener.js');
    let proc: any;
    try {
      const env = {
        ...(this.launchProcess ? process.env : pnpmEnv()),
        CRUX_PREVIEW_READY_FILE: readyFile,
        CRUX_PREVIEW_READY_TOKEN: token,
        // Garden owns this process; prevent Astro 7 from spawning an unowned agent daemon.
        ASTRO_DEV_BACKGROUND: '1',
      };
      env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ''} --require ${JSON.stringify(hook)}`;
      proc = this.launchProcess
        ? this.launchProcess(cwd, port, readyFile, token)
        : spawn(
            process.execPath,
            [pnpmEntry(), 'exec', 'astro', 'dev', '--port', String(port), '--host', '127.0.0.1'],
            { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true },
          );
    } catch (error) {
      releasePreviewPort(port, owner);
      fs.rmSync(temp, { recursive: true, force: true });
      throw error;
    }

    const dev: RunningDev = {
      proc,
      port,
      url,
      status: 'starting',
      log: '',
      owner,
      temp,
      readyFile,
      token,
    };
    this.running.set(cwd, dev);
    this.onStatus?.(cwd, 'starting', null);

    const capture = (chunk: Buffer) => {
      dev.log += chunk.toString();
      if (dev.log.length > 256 * 1024) dev.log = dev.log.slice(-128 * 1024);
    };
    proc.stdout.on('data', capture);
    proc.stderr.on('data', capture);

    proc.on('error', (error: Error) => {
      dev.log += error.message;
    });
    proc.on('close', (code: number | null) => {
      releasePreviewPort(dev.port, owner);
      releasePreviewPort(port, owner);
      fs.rmSync(temp, { recursive: true, force: true });
      const current = this.running.get(cwd);
      if (current === dev) {
        dev.status = dev.status === 'stopped' ? 'stopped' : 'crashed';
        if (dev.status === 'crashed') this.onStatus?.(cwd, 'crashed', null);
        this.running.delete(cwd);
        // Keep what the process said so the failure can be explained after the fact.
        this.lastOutput.set(cwd, `exit ${code ?? 'signal'}\n${dev.log}`);
      }
    });

    return this.waitReady(cwd, timeoutMs, signal);
  }

  private async waitReady(cwd: string, timeoutMs: number, signal?: AbortSignal): Promise<string> {
    const started = Date.now();
    for (;;) {
      if (signal?.aborted) {
        await this.stopOwned(cwd);
        signal.throwIfAborted();
      }
      const dev = this.running.get(cwd);
      if (!dev) {
        const said = (this.lastOutput.get(cwd) ?? '').slice(-2000);
        throw new Error(`dev server exited before becoming ready\n${said}`);
      }
      if (dev.status === 'ready') return dev.url;
      let proof: { token?: string; port?: number; pid?: number } | null = null;
      try {
        proof = JSON.parse(fs.readFileSync(dev.readyFile, 'utf8'));
      } catch {
        /* child has not bound yet */
      }
      if (proof?.token === dev.token && Number.isInteger(proof.port) && proof.port! > 0) {
        const actual = proof.port!;
        if (!claimPreviewPort(actual, dev.owner)) {
          await this.stopOwned(cwd);
          throw new Error('The dev server selected another Crux’s preview port. Restart to retry.');
        }
        if (actual !== dev.port) {
          releasePreviewPort(dev.port, dev.owner);
          dev.port = actual;
          dev.url = `http://127.0.0.1:${actual}`;
        }
      }
      if (
        proof?.token === dev.token &&
        (await probe(dev.url + '/')) &&
        this.running.get(cwd) === dev &&
        dev.status === 'starting'
      ) {
        dev.status = 'ready';
        this.onStatus?.(cwd, 'ready', dev.url);
        return dev.url;
      }
      if (Date.now() - started > timeoutMs) {
        await this.stopOwned(cwd);
        throw new Error(
          `dev server did not become ready in ${timeoutMs / 1000}s\n${dev.log.slice(-2000)}`,
        );
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  lastLog(folder: string): string {
    const cwd = this.resolveKnownFolder(folder);
    return this.running.get(cwd)?.log ?? this.lastOutput.get(cwd) ?? '';
  }

  stop(folder: string): Promise<void> {
    const cwd = this.resolveKnownFolder(folder);
    const pending = this.stopping.get(cwd);
    if (pending) return pending;
    const start = this.starting.get(cwd);
    this.starts.get(cwd)?.abort();
    const stop = Promise.resolve().then(async () => {
      await start?.catch(() => {});
      await this.stopOwned(cwd);
    });
    this.stopping.set(cwd, stop);
    void stop
      .finally(() => {
        if (this.stopping.get(cwd) === stop) this.stopping.delete(cwd);
      })
      .catch(() => {});
    return stop;
  }
  private async stopOwned(cwd: string): Promise<void> {
    const dev = this.running.get(cwd);
    if (!dev) return;
    dev.status = 'stopped';
    this.onStatus?.(cwd, 'stopped', null);
    const gone = new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      const finish = () => {
        clearTimeout(timer);
        resolve();
      };
      dev.proc.once('close', finish);
      timer = setTimeout(() => {
        killTree(dev.proc, 'SIGKILL');
        timer = setTimeout(
          () => reject(new Error('Preview process did not stop; its port is still reserved.')),
          3000,
        );
      }, 3000);
    });
    killTree(dev.proc, 'SIGTERM');
    await gone;
    if (this.running.get(cwd) === dev) this.running.delete(cwd);
  }

  /**
   * Stop and start again — the user's "Restart" (a wedged HMR, a changed
   * config, a new preferred port). Waits for the old process group to exit so
   * the port it held is free for the new one.
   */
  async restart(folder: string, opts: DevStartOptions = {}): Promise<string> {
    await this.stop(folder);
    return this.start(folder, opts);
  }

  async stopAll(): Promise<void> {
    await Promise.all(
      [...new Set([...this.running.keys(), ...this.starting.keys()])].map((cwd) => this.stop(cwd)),
    );
  }
}

function killTree(proc: any, signal: 'SIGTERM' | 'SIGKILL') {
  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(proc.pid), '/T', '/F'], () => {});
  } else {
    try {
      process.kill(-proc.pid, signal);
    } catch {
      proc.kill(signal);
    }
  }
}
