import { net } from 'electron';
import { Readable } from 'node:stream';

/** One HTTP hop over Chromium's networking stack. net.fetch cancels manual
 * redirects; net.request exposes their headers before following them.
 */
export function requestMedia(
  url: string,
  options: { signal: AbortSignal; headers: Record<string, string> },
): Promise<Response> {
  options.signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const request = net.request({
      url,
      headers: options.headers,
      redirect: 'manual',
      credentials: 'omit',
    });
    const abort = () => request.abort();
    options.signal.addEventListener('abort', abort, { once: true });
    const cleanup = () => options.signal.removeEventListener('abort', abort);
    request.once('abort', () => {
      cleanup();
      reject(options.signal.reason ?? new Error('Media request was cancelled.'));
    });
    request.once('error', (error) => {
      cleanup();
      reject(error);
    });
    request.once('redirect', (status, _method, location, rawHeaders) => {
      try {
        const headers = responseHeaders(rawHeaders);
        headers.set('location', location);
        resolve(new Response(null, { status, headers }));
      } catch (error) {
        reject(error);
      } finally {
        request.abort();
      }
    });
    request.once('response', (response) => {
      // ClientRequest's writable side can close before the response arrives.
      // Keep cancellation attached until the response, not the request, settles.
      const stream = response as unknown as Readable;
      stream.once('end', cleanup);
      stream.once('close', cleanup);
      stream.once('error', cleanup);
      try {
        // Electron implements a Node readable, but its declarations expose only
        // events. Count queue bytes explicitly rather than counting chunks.
        const body = [204, 205, 304].includes(response.statusCode)
          ? null
          : Readable.toWeb(stream, {
              strategy: { highWaterMark: 64 * 1024, size: (chunk: Uint8Array) => chunk.byteLength },
            });
        resolve(
          new Response(body, {
            status: response.statusCode,
            headers: responseHeaders(response.headers),
          }),
        );
        if (!body) request.abort();
      } catch (error) {
        reject(error);
        request.abort();
      }
    });
    request.end();
  });
}

function responseHeaders(values: Record<string, string | string[]>): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(values))
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
  return headers;
}
