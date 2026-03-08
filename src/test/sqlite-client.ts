import initSqlJs, { type Database } from 'sql.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { ISqliteClient } from '@/services/sqlite/client';

const SCHEMA = readFileSync(resolve(__dirname, '../services/sqlite/schema.sql'), 'utf-8');

export class TestSqliteClient implements ISqliteClient {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async run(sql: string, params?: unknown[]): Promise<{ changes: number }> {
    this.db.run(sql, params as initSqlJs.BindParams);
    return { changes: this.db.getRowsModified() };
  }

  async get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined> {
    const stmt = this.db.prepare(sql);
    stmt.bind(params as initSqlJs.BindParams);
    if (stmt.step()) {
      const columns = stmt.getColumnNames();
      const values = stmt.get();
      const row: Record<string, unknown> = {};
      for (let i = 0; i < columns.length; i++) {
        row[columns[i]!] = values[i];
      }
      stmt.free();
      return row as T;
    }
    stmt.free();
    return undefined;
  }

  async all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    stmt.bind(params as initSqlJs.BindParams);
    const rows: T[] = [];
    const columns = stmt.getColumnNames();
    while (stmt.step()) {
      const values = stmt.get();
      const row: Record<string, unknown> = {};
      for (let i = 0; i < columns.length; i++) {
        row[columns[i]!] = values[i];
      }
      rows.push(row as T);
    }
    stmt.free();
    return rows;
  }

  async export(): Promise<ArrayBuffer> {
    const data = this.db.export();
    return data.buffer as ArrayBuffer;
  }

  async import(data: ArrayBuffer): Promise<void> {
    this.db.close();
    const SQL = await initSqlJs();
    this.db = new SQL.Database(new Uint8Array(data));
    this.db.run(SCHEMA);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

export async function createTestSqliteClient(): Promise<TestSqliteClient> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(SCHEMA);
  return new TestSqliteClient(db);
}
