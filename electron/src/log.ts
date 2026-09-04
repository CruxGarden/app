const fs = require('fs');
const path = require('path');

/**
 * Local logs, always on (ADR 0008): one file per app under the OS logs
 * directory for installed builds (macOS: ~/Library/Logs/Crux Garden/main.log;
 * dev and tests write under their own userData/logs), rotated at 5 MB. The
 * live file plus `keep` rotated generations are retained (main.log, .1, .2, .3
 * with the default keep = 3). Nothing is sent anywhere. Users attach this file
 * to a GitHub issue; Settings → Desktop opens the folder.
 */
export class AppLog {
  private readonly file: string;
  constructor(
    readonly dir: string,
    private readonly maxBytes = 5 * 1024 * 1024,
    private readonly keep = 3,
  ) {
    this.file = path.join(dir, 'main.log');
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }

  write(level: 'info' | 'warn' | 'error', msg: string): void {
    const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${msg}\n`;
    try {
      this.rotateIfNeeded(Buffer.byteLength(line));
      fs.appendFileSync(this.file, line);
    } catch {}
  }
  info(msg: string) {
    this.write('info', msg);
  }
  warn(msg: string) {
    this.write('warn', msg);
  }
  error(msg: string) {
    this.write('error', msg);
  }

  /**
   * Capture what would otherwise vanish: main-process throws, renderer/child
   * crashes. `uncaughtExceptionMonitor` only observes — it does not install an
   * 'uncaughtException' handler, so Electron's default behaviour (the error
   * dialog, and not continuing as if nothing happened) is left intact. We log
   * first because the monitor runs before the default handler.
   */
  attach(proc: NodeJS.Process, app: any): void {
    proc.on('uncaughtExceptionMonitor', (err: Error, origin: string) =>
      this.error(`${origin}: ${err?.stack || err}`),
    );
    proc.on('unhandledRejection', (reason: unknown) =>
      this.error(`unhandledRejection: ${(reason as Error)?.stack || String(reason)}`),
    );
    app.on('render-process-gone', (_e: unknown, _wc: unknown, details: any) =>
      this.error(`renderer gone: ${details?.reason} exit=${details?.exitCode}`),
    );
    app.on('child-process-gone', (_e: unknown, details: any) =>
      this.error(
        `child process gone: ${details?.type} ${details?.reason} exit=${details?.exitCode}`,
      ),
    );
  }

  /** `incoming` is the byte length of the line about to be appended. */
  private rotateIfNeeded(incoming: number): void {
    let size: number;
    try {
      size = fs.statSync(this.file).size;
    } catch {
      return;
    }
    if (size + incoming < this.maxBytes) return;
    // main.log.{keep-1} → .{keep}, …, main.log.1 → .2, then main.log → .1
    for (let i = this.keep - 1; i >= 1; i--) {
      const from = `${this.file}.${i}`;
      const to = `${this.file}.${i + 1}`;
      try {
        if (fs.existsSync(from)) fs.renameSync(from, to);
      } catch {}
    }
    try {
      fs.renameSync(this.file, `${this.file}.1`);
    } catch {}
  }
}
