import { createServer, type Socket } from 'node:net';
import { runNativeProcess, type NativeResult } from './native-process';

/** Typst 0.15.1 routes package downloads through env_proxy. Pin that reviewed
 * behavior: every proxy points at an owned listener that refuses all traffic.
 * This is a compiler policy, not an OS sandbox for an untrusted executable.
 * https://github.com/typst/typst/blob/v0.15.1/crates/typst-kit/src/downloader.rs
 */
export async function runTypstOffline(
  binary: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<NativeResult> {
  let attemptedDownload = false;
  const sockets = new Set<Socket>();
  const proxy = createServer((socket) => {
    attemptedDownload = true;
    sockets.add(socket);
    socket.on('error', () => {}); // The refused client may reset its connection.
    socket.on('close', () => sockets.delete(socket));
    // No target is parsed, resolved or forwarded. CONNECT is refused too.
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });
  proxy.maxConnections = 8;
  try {
    await new Promise<void>((resolve, reject) => {
      proxy.once('error', reject);
      proxy.listen(0, '127.0.0.1', resolve);
    });
    const address = proxy.address();
    if (!address || typeof address === 'string')
      throw new Error('Could not isolate Typst downloads.');
    const url = `http://127.0.0.1:${address.port}`;
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => {
        const upper = key.toUpperCase();
        return !upper.startsWith('TYPST_') && !upper.endsWith('_PROXY');
      }),
    );
    // Both spellings matter across platforms. Remove inherited NO_PROXY so an
    // exception (including '*') cannot bypass the nonforwarding listener.
    for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY']) {
      env[key] = url;
      env[key.toLowerCase()] = url;
    }
    env.NO_PROXY = env.no_proxy = '';
    const version = await runNativeProcess(binary, ['--version'], {
      cwd,
      env,
      timeoutMs: Math.min(timeoutMs, 5000),
    });
    if (version.code !== 0 || !/^typst 0\.15\.1(?:\s|$)/.test(version.stdout))
      throw new Error(
        'Offline typesetting requires Typst 0.15.1. Other versions need review before use.',
      );
    const result = await runNativeProcess(binary, args, { cwd, env, timeoutMs });
    if (attemptedDownload)
      return {
        ...result,
        code: 1,
        stderrTail:
          'Typst package downloads are disabled. Keep document dependencies inside the Project Folder.',
      };
    return result;
  } finally {
    for (const socket of sockets) socket.destroy();
    if (proxy.listening) await new Promise<void>((resolve) => proxy.close(() => resolve()));
  }
}
