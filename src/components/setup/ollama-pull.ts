/**
 * Download a model into Ollama on this computer (`POST /api/pull`, streamed).
 * The renderer talks to Ollama directly, as chat does: Electron main shims
 * CORS for the app's own document on port 11434 (local.ts).
 *
 * Ollama answers with one JSON object per line: `{status}` for each phase,
 * `{status, digest, total, completed}` while a layer downloads, `{error}` when
 * it fails, and `{status: "success"}` at the end.
 */

/** A tool-capable family (local.ts TOOL_CAPABLE_FAMILIES) at a size most computers can run. */
export const RECOMMENDED_LOCAL_MODEL = {
  name: 'qwen3:8b',
  label: 'Qwen3 8B',
  /** Ollama's library lists it at 5.2 GB; the live total replaces this once Ollama reports it. */
  approxBytes: 5_200_000_000,
} as const;

export const OLLAMA_BASE = 'http://127.0.0.1:11434';
export const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download';
export const LM_STUDIO_URL = 'https://lmstudio.ai';

export interface PullLine {
  status?: string;
  digest?: string;
  total?: number;
  completed?: number;
  error?: string;
}

export interface PullProgress {
  /** Ollama's own words for the phase ("pulling manifest", "verifying sha256 digest", …). */
  status: string;
  completed: number;
  /** Bytes in every layer reported so far; 0 until the first layer starts. */
  total: number;
  /** 0–1 once a size is known, otherwise null. */
  fraction: number | null;
  done: boolean;
}

export class PullError extends Error {
  constructor(
    message: string,
    readonly kind: 'cancelled' | 'unreachable' | 'refused' | 'incomplete',
  ) {
    super(message);
    this.name = 'PullError';
  }
}

/** One NDJSON line; blank lines are skipped, anything unreadable is ignored. */
export function parsePullLine(line: string): PullLine | null {
  const text = line.trim();
  if (!text) return null;
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === 'object' ? (value as PullLine) : null;
  } catch {
    return null;
  }
}

/** Accumulates progress across layers: each digest reports its own total and completed bytes. */
export function createPullTracker() {
  const layers = new Map<string, { total: number; completed: number }>();
  let status = 'starting';
  let done = false;
  return {
    update(line: PullLine): PullProgress {
      if (line.status) status = line.status;
      if (line.status === 'success') done = true;
      if (line.digest && typeof line.total === 'number') {
        const previous = layers.get(line.digest);
        layers.set(line.digest, {
          total: line.total,
          completed: Math.max(previous?.completed ?? 0, line.completed ?? 0),
        });
      }
      return this.progress();
    },
    progress(): PullProgress {
      let total = 0;
      let completed = 0;
      for (const layer of layers.values()) {
        total += layer.total;
        completed += Math.min(layer.completed, layer.total);
      }
      return {
        status,
        completed,
        total,
        fraction: done ? 1 : total > 0 ? completed / total : null,
        done,
      };
    },
  };
}

export interface PullOptions {
  signal?: AbortSignal;
  onProgress?: (progress: PullProgress) => void;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

/** Pull a model; resolves when Ollama says "success", throws a PullError otherwise. */
export async function pullOllamaModel(model: string, options: PullOptions = {}): Promise<void> {
  const { signal, onProgress, fetchImpl = fetch, baseUrl = OLLAMA_BASE } = options;
  const tracker = createPullTracker();
  const aborted = () => signal?.aborted || false;
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: true }),
      signal,
    });
  } catch (error) {
    if (aborted() || isAbort(error)) throw new PullError('Download cancelled.', 'cancelled');
    throw new PullError(
      'Ollama is not answering. Make sure it is running, then try again.',
      'unreachable',
    );
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const line = parsePullLine(text);
    throw new PullError(
      line?.error ? `Ollama refused the download: ${line.error}` : `Ollama refused the download.`,
      'refused',
    );
  }
  if (!response.body) throw new PullError('Ollama sent nothing back.', 'incomplete');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const handle = (text: string) => {
    const line = parsePullLine(text);
    if (!line) return;
    if (line.error) throw new PullError(`Ollama could not download it: ${line.error}`, 'refused');
    onProgress?.(tracker.update(line));
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const text of lines) handle(text);
    }
    buffer += decoder.decode();
    handle(buffer);
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof PullError) throw error;
    if (aborted() || isAbort(error)) throw new PullError('Download cancelled.', 'cancelled');
    throw new PullError('The download stopped. Check Ollama and try again.', 'incomplete');
  }
  if (!tracker.progress().done)
    throw new PullError('The download ended before it finished. Try again.', 'incomplete');
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/** "4.9 GB", "512 MB" — decimal units, as Ollama's library states them. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`;
  return `${bytes} B`;
}

/**
 * Download speed over the last few seconds, for "time left". A moving window
 * rather than the whole run, so a slow start does not haunt the estimate.
 */
export function createRateMeter(windowMs = 8000) {
  const samples: { t: number; bytes: number }[] = [];
  const meter = {
    sample(bytes: number, t: number): void {
      samples.push({ t, bytes });
      while (samples.length > 2 && t - samples[0]!.t > windowMs) samples.shift();
    },
    bytesPerSecond(): number | null {
      if (samples.length < 2) return null;
      const first = samples[0]!;
      const last = samples[samples.length - 1]!;
      const seconds = (last.t - first.t) / 1000;
      if (seconds < 1) return null;
      const rate = (last.bytes - first.bytes) / seconds;
      return rate > 0 ? rate : null;
    },
    secondsLeft(remainingBytes: number): number | null {
      const rate = meter.bytesPerSecond();
      return rate ? remainingBytes / rate : null;
    },
  };
  return meter;
}

/** "about 3 minutes left" — plain words, rounded the way people say it. */
export function formatTimeLeft(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return 'working out the time left';
  if (seconds < 60) return 'less than a minute left';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `about ${minutes} minute${minutes === 1 ? '' : 's'} left`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `about ${hours} hour${hours === 1 ? '' : 's'}${rest ? ` ${rest} min` : ''} left`;
}
