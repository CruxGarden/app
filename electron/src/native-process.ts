import { execFile } from 'node:child_process';

export interface NativeResult {
  code: number;
  ms: number;
  stderrTail: string;
  stdout: string;
}

/** One bounded process lifecycle for admitted native commands. Never a shell. */
export function runNativeProcess(
  binary: string,
  args: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    onProgress?: (progress: number) => void;
  },
): Promise<NativeResult> {
  const timeout = options.timeoutMs ?? 10 * 60_000;
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 30 * 60_000)
    throw new Error('Choose a positive native-tool timeout of at most 30 minutes.');
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const process = execFile(
      binary,
      args,
      {
        cwd: options.cwd,
        env: options.env,
        timeout,
        killSignal: 'SIGKILL',
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error && typeof error.code !== 'number' && !error.killed) return reject(error);
        resolve({
          code: error ? (typeof error.code === 'number' ? error.code : -1) : 0,
          ms: Date.now() - started,
          stdout: stdout.slice(-100_000),
          stderrTail: stderr.slice(-2000),
        });
      },
    );
    let duration = 0;
    let tail = '';
    const seconds = (match: RegExpMatchArray) =>
      Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    process.stderr?.on('data', (chunk: Buffer) => {
      tail = (tail + chunk.toString()).slice(-2000);
      const total = tail.match(/Duration:\s+(\d+):(\d+):(\d+\.\d+)/);
      if (total && !duration) duration = seconds(total);
      const current = chunk.toString().match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (current && duration > 0) options.onProgress?.(Math.min(seconds(current) / duration, 1));
    });
  });
}
