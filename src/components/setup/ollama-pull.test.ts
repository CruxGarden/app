import { describe, expect, it, vi } from 'vitest';
import {
  PullError,
  createPullTracker,
  createRateMeter,
  formatBytes,
  formatTimeLeft,
  parsePullLine,
  pullOllamaModel,
  type PullProgress,
} from './ollama-pull';

const encoder = new TextEncoder();

/** A fetch whose body streams these chunks (split anywhere, as a network does). */
function streamingFetch(chunks: string[], init: { status?: number } = {}) {
  return vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
    const signal = options?.signal;
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        for (const chunk of chunks) {
          if (signal?.aborted) {
            controller.error(new DOMException('aborted', 'AbortError'));
            return;
          }
          controller.enqueue(encoder.encode(chunk));
          await new Promise((r) => setTimeout(r, 0));
        }
        controller.close();
      },
    });
    return new Response(body, { status: init.status ?? 200 });
  }) as unknown as typeof fetch;
}

const lines = (...objects: object[]) => objects.map((o) => JSON.stringify(o)).join('\n') + '\n';

describe('Ollama pull stream', () => {
  it('parses lines and ignores blanks and junk', () => {
    expect(parsePullLine('')).toBeNull();
    expect(parsePullLine('not json')).toBeNull();
    expect(parsePullLine('{"status":"pulling manifest"}')).toEqual({ status: 'pulling manifest' });
  });

  it('adds up progress across layers', () => {
    const tracker = createPullTracker();
    tracker.update({ status: 'pulling a', digest: 'a', total: 100, completed: 50 });
    const p = tracker.update({ status: 'pulling b', digest: 'b', total: 300, completed: 100 });
    expect(p).toMatchObject({ total: 400, completed: 150, fraction: 150 / 400, done: false });
    expect(tracker.update({ status: 'success' })).toMatchObject({ fraction: 1, done: true });
  });

  it('streams progress to the end, across chunks split mid-line', async () => {
    const text = lines(
      { status: 'pulling manifest' },
      { status: 'pulling abc', digest: 'abc', total: 1000, completed: 0 },
      { status: 'pulling abc', digest: 'abc', total: 1000, completed: 600 },
      { status: 'pulling abc', digest: 'abc', total: 1000, completed: 1000 },
      { status: 'verifying sha256 digest' },
      { status: 'success' },
    );
    const chunks = [text.slice(0, 17), text.slice(17, 90), text.slice(90)];
    const fetchImpl = streamingFetch(chunks);
    const seen: PullProgress[] = [];
    await pullOllamaModel('qwen3:8b', { fetchImpl, onProgress: (p) => seen.push(p) });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:11434/api/pull');
    expect(JSON.parse(init.body)).toEqual({ model: 'qwen3:8b', stream: true });
    expect(seen.map((p) => p.fraction)).toEqual([null, 0, 0.6, 1, 1, 1]);
    expect(seen.at(-1)).toMatchObject({ done: true, total: 1000 });
  });

  it('reports an error line in plain words', async () => {
    const fetchImpl = streamingFetch([
      lines({ status: 'pulling manifest' }, { error: 'pull model manifest: file does not exist' }),
    ]);
    await expect(pullOllamaModel('nope', { fetchImpl })).rejects.toMatchObject({
      kind: 'refused',
      message: expect.stringContaining('file does not exist'),
    });
  });

  it('says when Ollama is not answering, or refuses outright', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(pullOllamaModel('qwen3:8b', { fetchImpl: down })).rejects.toMatchObject({
      kind: 'unreachable',
    });
    const refused = streamingFetch([JSON.stringify({ error: 'insufficient disk space' })], {
      status: 500,
    });
    await expect(pullOllamaModel('qwen3:8b', { fetchImpl: refused })).rejects.toMatchObject({
      kind: 'refused',
      message: expect.stringContaining('insufficient disk space'),
    });
  });

  it('treats a stream that stops before success as unfinished', async () => {
    const fetchImpl = streamingFetch([
      lines({ status: 'pulling abc', digest: 'abc', total: 10, completed: 5 }),
    ]);
    await expect(pullOllamaModel('qwen3:8b', { fetchImpl })).rejects.toMatchObject({
      kind: 'incomplete',
    });
  });

  it('cancels', async () => {
    const controller = new AbortController();
    const fetchImpl = streamingFetch([
      lines({ status: 'pulling abc', digest: 'abc', total: 10, completed: 1 }),
      lines({ status: 'pulling abc', digest: 'abc', total: 10, completed: 2 }),
      lines({ status: 'success' }),
    ]);
    const run = pullOllamaModel('qwen3:8b', {
      fetchImpl,
      signal: controller.signal,
      onProgress: () => controller.abort(),
    });
    await expect(run).rejects.toBeInstanceOf(PullError);
    await expect(run).rejects.toMatchObject({ kind: 'cancelled' });
  });

  it('cancels before the first byte', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError');
    }) as unknown as typeof fetch;
    await expect(
      pullOllamaModel('qwen3:8b', { fetchImpl, signal: controller.signal }),
    ).rejects.toMatchObject({ kind: 'cancelled', message: 'Download cancelled.' });
  });
});

describe('size and time left', () => {
  it('formats sizes as Ollama states them', () => {
    expect(formatBytes(5_200_000_000)).toBe('5.2 GB');
    expect(formatBytes(512_000_000)).toBe('512 MB');
  });

  it('estimates time left from recent speed', () => {
    const meter = createRateMeter(8000);
    meter.sample(0, 0);
    expect(meter.secondsLeft(1000)).toBeNull();
    meter.sample(10_000_000, 2000); // 5 MB/s
    expect(meter.bytesPerSecond()).toBe(5_000_000);
    expect(meter.secondsLeft(600_000_000)).toBe(120);
    expect(formatTimeLeft(120)).toBe('about 2 minutes left');
    expect(formatTimeLeft(30)).toBe('less than a minute left');
    expect(formatTimeLeft(3900)).toBe('about 1 hour 5 min left');
    expect(formatTimeLeft(null)).toBe('working out the time left');
  });
});
