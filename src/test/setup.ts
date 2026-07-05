import { afterEach, beforeEach } from 'vitest';
import { createTestSqliteClient } from './sqlite-client';
import { setSqliteClient, resetSqliteClient } from '@/services/sqlite/client';

// Minimal localStorage shim — the vitest environment is 'node', which has none.
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    writable: true,
  });
}

// Provide a fresh in-memory SQLite database for each test
beforeEach(async () => {
  const client = await createTestSqliteClient();
  setSqliteClient(client);
  localStorage.clear();
});

afterEach(() => {
  resetSqliteClient();
});
