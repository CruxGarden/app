import type { WorkerResponse } from './worker';

export interface ISqliteClient {
  /** Initialize the worker + OPFS VFS. Resolves when the database is ready. */
  init(): Promise<void>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  export(): Promise<ArrayBuffer>;
  import(data: ArrayBuffer): Promise<void>;
  close(): Promise<void>;
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

let instance: ISqliteClient | null = null;

const WASM_ERRORS = ['memory access out of bounds', 'unreachable', 'table index is out of bounds'];

function isWasmCrash(msg: string): boolean {
  return WASM_ERRORS.some((e) => msg.includes(e));
}

export class SqliteClient implements ISqliteClient {
  private worker: Worker | null = null;
  private pending = new Map<string, Pending>();
  private counter = 0;
  private recovering = false;

  private ensureWorker(): Worker {
    if (!this.worker) this.createWorker();
    return this.worker!;
  }

  private createWorker() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const { id, result, error } = e.data;
      const handler = this.pending.get(id);
      if (!handler) return;
      this.pending.delete(id);
      if (error) {
        handler.reject(new Error(error));
      } else {
        handler.resolve(result);
      }
    };
    this.worker.onerror = (e) => {
      console.error('[sqlite client] worker error:', e.message);
      for (const [, handler] of this.pending) {
        handler.reject(new Error(`SQLite worker error: ${e.message}`));
      }
      this.pending.clear();
    };
  }

  private async recover(): Promise<void> {
    if (this.recovering) return;
    this.recovering = true;
    // Silent recovery — OPFS contention on refresh is expected
    try {
      this.worker?.terminate();
    } catch {
      // ignore
    }
    this.worker = null;
    // Brief pause to let the browser release OPFS handles
    await new Promise((r) => setTimeout(r, 500));
    this.createWorker();
    this.recovering = false;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private send(msg: Record<string, any>, transfer?: Transferable[]): Promise<unknown> {
    const worker = this.ensureWorker();
    const id = String(++this.counter);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      if (transfer) {
        worker.postMessage({ ...msg, id }, transfer);
      } else {
        worker.postMessage({ ...msg, id });
      }
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async sendWithRetry(msg: Record<string, any>): Promise<unknown> {
    try {
      return await this.send(msg);
    } catch (err) {
      if (err instanceof Error && isWasmCrash(err.message)) {
        await this.recover();
        return this.send(msg);
      }
      throw err;
    }
  }

  async init(): Promise<void> {
    await this.sendWithRetry({ method: 'init' });
  }

  async run(sql: string, params?: unknown[]): Promise<{ changes: number }> {
    return (await this.sendWithRetry({ method: 'run', sql, params })) as { changes: number };
  }

  async get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined> {
    return (await this.sendWithRetry({ method: 'get', sql, params })) as T | undefined;
  }

  async all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    return (await this.sendWithRetry({ method: 'all', sql, params })) as T[];
  }

  async export(): Promise<ArrayBuffer> {
    return (await this.sendWithRetry({ method: 'export' })) as ArrayBuffer;
  }

  async import(data: ArrayBuffer): Promise<void> {
    await this.send({ method: 'import', data }, [data]);
  }

  async close(): Promise<void> {
    if (!this.worker) return;
    await this.send({ method: 'close' });
    this.worker.terminate();
    this.worker = null;
  }
}

export function getSqliteClient(): ISqliteClient {
  if (!instance) {
    instance = new SqliteClient();
  }
  return instance;
}

/** Inject a custom client (for testing) */
export function setSqliteClient(client: ISqliteClient): void {
  instance = client;
}

/** Reset the singleton (for testing or re-import scenarios) */
export function resetSqliteClient(): void {
  if (instance) {
    instance.close().catch(() => {});
    instance = null;
  }
}
