/** Public media/catalogue downloads. Reserve a byte budget before opening a
 * connection, and count decoded response bytes before retaining each chunk.
 */
const MAX_BYTES = 512_000_000;
const MAX_DOWNLOADS = 4;
let activeDownloads = 0;
let reservedBytes = 0;

/** Plain HTTP is only for the person's own machines; HTTPS can be anywhere. */
function mediaUrl(value: string): URL {
  if (typeof value !== 'string' || value.length > 8192)
    throw new Error('Choose a media URL of at most 8192 characters.');
  let target: URL;
  try {
    target = new URL(value);
  } catch {
    throw new Error('Not a URL.');
  }
  const host = target.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const octets = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  const a = Number(octets?.[1]);
  const b = Number(octets?.[2]);
  const privateHost =
    host === 'localhost' ||
    host === '::1' ||
    host.endsWith('.local') ||
    (octets &&
      (a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)));
  if (
    target.username ||
    target.password ||
    (target.protocol !== 'https:' && !(target.protocol === 'http:' && privateHost))
  )
    throw new Error(
      'Use https media sources, or http on this machine or your local network, without URL credentials.',
    );
  return target;
}

export async function downloadMedia(
  url: string,
  maxBytes: number | undefined,
  transport: (
    url: string,
    options: { signal: AbortSignal; headers: Record<string, string> },
  ) => Promise<Response>,
  userAgent: string,
  timeoutMs = 90_000,
) {
  const cap = maxBytes ?? 64_000_000;
  if (!Number.isSafeInteger(cap) || cap < 1 || cap > MAX_BYTES)
    throw new Error('Choose a positive whole-byte download limit of at most 512 MB.');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 90_000)
    throw new Error('Choose a download time limit of at most 90 seconds.');
  let target = mediaUrl(url);
  if (activeDownloads >= MAX_DOWNLOADS || reservedBytes + cap > MAX_BYTES)
    throw new Error('Media downloads are busy. Wait for one to finish, then try again.');
  activeDownloads++;
  reservedBytes += cap;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error('Media download exceeded its time limit.')),
    timeoutMs,
  );
  const size = cap < 1_000_000 ? `${cap} byte` : `${cap / 1_000_000} MB`;
  const tooLarge = () => new Error(`That file is larger than the ${size} limit.`);
  try {
    for (let redirects = 0; ; redirects++) {
      const response = await transport(target.href, {
        signal: controller.signal,
        headers: { 'User-Agent': userAgent, Accept: '*/*' },
      });
      const location = response.headers.get('location');
      if ([301, 302, 303, 307, 308].includes(response.status) && location) {
        if (redirects >= 8) throw new Error('Media source exceeded the redirect limit.');
        target = mediaUrl(new URL(location, target).href);
        await response.body?.cancel();
        continue;
      }
      // Compressed Content-Length describes wire bytes, not the decoded body.
      const encoding = response.headers.get('content-encoding');
      if (
        (!encoding || encoding === 'identity') &&
        Number(response.headers.get('content-length')) > cap
      )
        throw tooLarge();
      let total = 0;
      const chunks: Uint8Array[] = [];
      const reader = response.body?.getReader();
      try {
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value.byteLength > cap - total) throw tooLarge();
            total += value.byteLength;
            chunks.push(value);
          }
        }
      } finally {
        reader?.releaseLock();
      }
      return {
        ok: response.ok,
        status: response.status,
        mimeType: (response.headers.get('content-type') || '').split(';')[0]!.trim(),
        bytes: Buffer.concat(chunks, total),
      };
    }
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    // Also closes responses refused on headers, a redirect, or a streamed chunk.
    controller.abort();
    clearTimeout(timer);
    activeDownloads--;
    reservedBytes -= cap;
  }
}
