import { boundedProcess } from './bounded-process';

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
  const started = Date.now();
  let duration = 0;
  let tail = '';
  const seconds = (match: RegExpMatchArray) =>
    Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return boundedProcess(binary, args, {
    ...options,
    timeoutMs: options.timeoutMs ?? 10 * 60_000,
    onData: (text, stream) => {
      if (stream !== 'stderr') return;
      tail = (tail + text).slice(-2000);
      const total = tail.match(/Duration:\s+(\d+):(\d+):(\d+\.\d+)/);
      if (total && !duration) duration = seconds(total);
      const current = tail
        .match(/time=(\d+):(\d+):(\d+\.\d+)/g)
        ?.at(-1)
        ?.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (current && duration > 0) options.onProgress?.(Math.min(seconds(current) / duration, 1));
    },
  }).then(({ code, stdout, stderr, timedOut }) => ({
    code,
    ms: Date.now() - started,
    stdout: stdout.slice(-100_000),
    stderrTail: (stderr + (timedOut ? '\nProcess exceeded its time limit.' : '')).slice(-2000),
  }));
}
