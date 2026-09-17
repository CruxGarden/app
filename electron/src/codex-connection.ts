import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

/** JSON-RPC over a private child stdin/stdout. No daemon or desktop-app session is reused. */
export class CodexConnection {
  private child: ChildProcessWithoutNullStreams;
  private serial = 0;
  private buffer = '';
  private pending = new Map<
    number,
    { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
  >();
  private closed = false;
  readonly exited: Promise<void>;
  onNotification: (method: string, params: any) => void = () => {};
  onRequest: (method: string, params: any) => Promise<unknown> = async () => {
    throw new Error('Unsupported client request.');
  };
  onClose: (error: Error) => void = () => {};

  constructor(
    binary: string,
    cwd: string,
    env: NodeJS.ProcessEnv,
    args = ['app-server', '--listen', 'stdio://'],
  ) {
    this.child = spawn(binary, args, {
      cwd,
      env,
      stdio: 'pipe',
      detached: process.platform !== 'win32',
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => this.read(chunk));
    // Native diagnostics may contain private account or tool data. Don't mirror them into Garden logs.
    this.child.stderr.resume();
    this.child.stdin.on('error', (error) => this.fail(error));
    this.child.on('error', (error) => this.fail(error));
    this.exited = new Promise((resolve) =>
      this.child.once('close', () => {
        this.fail(
          new Error('Codex disconnected. The turn was interrupted; saved files remain in Garden.'),
        );
        resolve();
      }),
    );
  }
  request(method: string, params: unknown, timeout = 120_000): Promise<any> {
    if (this.closed) return Promise.reject(new Error('Codex connection is closed.'));
    const id = ++this.serial;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex ${method} timed out.`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }
  notify(method: string, params: unknown = {}): void {
    this.send({ method, params });
  }
  private send(message: unknown): void {
    if (!this.closed) this.child.stdin.write(JSON.stringify(message) + '\n');
  }
  private read(chunk: string): void {
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer) > 32 * 1024 * 1024) {
      this.fail(new Error('Codex sent an oversized protocol message.'));
      void this.close();
      return;
    }
    let end: number;
    while ((end = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      if (!line.trim()) continue;
      let message: any;
      try {
        message = JSON.parse(line);
      } catch {
        this.fail(new Error('Codex sent an invalid protocol message.'));
        void this.close();
        return;
      }
      if (typeof message.method === 'string') {
        if (message.id !== undefined) {
          const id = message.id;
          void this.onRequest(message.method, message.params ?? {}).then(
            (result) => this.send({ id, result }),
            (error: unknown) =>
              this.send({
                id,
                error: {
                  code: -32603,
                  message: error instanceof Error ? error.message : 'Client request failed.',
                },
              }),
          );
        } else this.onNotification(message.method, message.params ?? {});
      } else {
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error)
          pending.reject(new Error(String(message.error.message ?? 'Codex request failed.')));
        else pending.resolve(message.result);
      }
    }
  }
  private fail(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.onClose(error);
  }
  async close(): Promise<void> {
    this.fail(new Error('Codex connection closed.'));
    const pid = this.child.pid;
    if (pid) {
      try {
        if (process.platform === 'win32') this.child.kill();
        else process.kill(-pid, 'SIGTERM');
      } catch {
        /* already exited */
      }
    }
    const timer = setTimeout(() => {
      if (!pid) return;
      try {
        if (process.platform === 'win32')
          spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
        else process.kill(-pid, 'SIGKILL');
      } catch {
        /* already exited */
      }
    }, 2000);
    await this.exited;
    clearTimeout(timer);
  }
}
