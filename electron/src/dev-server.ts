const { spawn } = require('child_process');
const { pnpmEntry, pnpmEnv } = require('./pnpm');
const http = require('http');
const net = require('net');

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
  /** Output of the last process per folder that exited without becoming ready. */
  private lastOutput = new Map<string, string>();

  constructor(
    private resolveKnownFolder: (folder: string) => string,
    private onStatus?: (folder: string, status: DevStatus, url: string | null) => void,
  ) {}

  status(folder: string): { status: DevStatus | 'idle'; url: string | null } {
    const dev = this.running.get(this.resolveKnownFolder(folder));
    return dev ? { status: dev.status, url: dev.url } : { status: 'idle', url: null };
  }

  /** Start (or reuse) the project's dev server. Resolves when it answers HTTP. */
  async start(folder: string, timeoutMs = 120_000): Promise<string> {
    const cwd = this.resolveKnownFolder(folder);
    const existing = this.running.get(cwd);
    if (existing && (existing.status === 'ready' || existing.status === 'starting')) {
      if (existing.status === 'ready') return existing.url;
      return this.waitReady(cwd, timeoutMs);
    }

    const port = await freePort();
    const url = `http://127.0.0.1:${port}`;

    const proc = spawn(
      process.execPath,
      [pnpmEntry(), 'exec', 'astro', 'dev', '--port', String(port), '--host', '127.0.0.1'],
      {
        cwd,
        env: pnpmEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true, // own process group — kill(-pid) reaps children
      },
    );

    const dev: RunningDev = { proc, port, url, status: 'starting', log: '' };
    this.running.set(cwd, dev);
    this.onStatus?.(cwd, 'starting', null);

    const capture = (chunk: Buffer) => {
      dev.log += chunk.toString();
      if (dev.log.length > 256 * 1024) dev.log = dev.log.slice(-128 * 1024);
    };
    proc.stdout.on('data', capture);
    proc.stderr.on('data', capture);

    proc.on('close', (code: number | null) => {
      const current = this.running.get(cwd);
      if (current === dev) {
        dev.status = dev.status === 'stopped' ? 'stopped' : 'crashed';
        if (dev.status === 'crashed') this.onStatus?.(cwd, 'crashed', null);
        this.running.delete(cwd);
        // Keep what the process said so the failure can be explained after the fact.
        this.lastOutput.set(cwd, `exit ${code ?? 'signal'}\n${dev.log}`);
      }
    });

    return this.waitReady(cwd, timeoutMs);
  }

  private async waitReady(cwd: string, timeoutMs: number): Promise<string> {
    const started = Date.now();
    for (;;) {
      const dev = this.running.get(cwd);
      if (!dev) {
        const said = (this.lastOutput.get(cwd) ?? '').slice(-2000);
        throw new Error(`dev server exited before becoming ready\n${said}`);
      }
      if (dev.status === 'ready') return dev.url;
      if (await probe(dev.url + '/')) {
        dev.status = 'ready';
        this.onStatus?.(cwd, 'ready', dev.url);
        return dev.url;
      }
      if (Date.now() - started > timeoutMs) {
        await this.stop(cwd);
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

  async stop(folder: string): Promise<void> {
    const cwd = this.resolveKnownFolder(folder);
    const dev = this.running.get(cwd);
    if (!dev) return;
    dev.status = 'stopped';
    this.running.delete(cwd);
    this.onStatus?.(cwd, 'stopped', null);
    try {
      process.kill(-dev.proc.pid, 'SIGTERM'); // whole process group
    } catch {
      try {
        dev.proc.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    }
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.running.keys()].map((cwd) => this.stop(cwd)));
  }
}
