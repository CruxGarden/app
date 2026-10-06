import { execFile, spawn } from 'node:child_process';
import * as path from 'node:path';

export interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export class ProcessOutputLimitError extends Error {
  constructor() {
    super('Process exceeded its output limit (2 MiB).');
  }
}

/** No shell, bounded combined output, and termination of the owned process group.
 * Callers choose their environment and translate timeout results for their API.
 */
export function boundedProcess(
  program: string,
  args: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs: number;
    onData?: (text: string, stream: 'stdout' | 'stderr') => void;
  },
): Promise<ProcessResult> {
  const timeout = options.timeoutMs;
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 30 * 60_000)
    throw new Error('Choose a positive process timeout of at most 30 minutes.');
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let failure: Error | undefined;
    let timedOut = false;
    let bytes = 0;
    let stdout = '';
    let stderr = '';
    let settled = false;
    const terminate = () => {
      if (!child.pid) return;
      if (process.platform === 'win32') {
        const taskkill = path.join(
          process.env.SystemRoot ?? 'C:\\Windows',
          'System32',
          'taskkill.exe',
        );
        execFile(
          taskkill,
          ['/pid', String(child.pid), '/T', '/F'],
          { windowsHide: true, timeout: 5000 },
          () => {
            child.kill('SIGKILL');
          },
        );
      } else {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }
    };
    const fail = (error: Error) => {
      if (failure) return;
      failure = error;
      terminate();
      // A broken provider must not retain the caller indefinitely through pipes.
      child.stdout.destroy();
      child.stderr.destroy();
    };
    const timer = setTimeout(() => {
      if (!failure) {
        timedOut = true;
        fail(new Error('Process exceeded its time limit.'));
      }
    }, timeout);
    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (failure && !timedOut) reject(failure);
      else resolve({ code: timedOut ? -1 : code, stdout, stderr, timedOut });
    };
    for (const [stream, kind] of [
      [child.stdout, 'out'],
      [child.stderr, 'err'],
    ] as const) {
      stream.setEncoding('utf8');
      stream.on('data', (chunk: string) => {
        if (failure) return;
        bytes += Buffer.byteLength(chunk);
        if (bytes > 2 * 1024 * 1024) return fail(new ProcessOutputLimitError());
        const text = chunk;
        if (kind === 'out') stdout += text;
        else stderr += text;
        try {
          options.onData?.(text, kind === 'out' ? 'stdout' : 'stderr');
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      });
    }
    child.on('error', (error) => {
      failure ??= error;
      finish(-1);
    });
    child.on('close', (code) => finish(code ?? -1));
  });
}
