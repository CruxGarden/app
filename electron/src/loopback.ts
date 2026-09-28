/** Loopback-only Host header check (`127.0.0.1[:port]`, `localhost[:port]`, `[::1][:port]`). */
export function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  const h = host.trim().toLowerCase();
  const bare = h.startsWith('[')
    ? h.replace(/^\[([^\]]+)\](:\d+)?$/, '$1')
    : h.replace(/:\d+$/, '');
  return bare === '127.0.0.1' || bare === 'localhost' || bare === '::1';
}
