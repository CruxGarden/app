import { afterEach, beforeEach } from 'vitest';
import { createTestSqliteClient } from './sqlite-client';
import { setSqliteClient, resetSqliteClient } from '@/services/sqlite/client';

// Provide a fresh in-memory SQLite database for each test
beforeEach(async () => {
  const client = await createTestSqliteClient();
  setSqliteClient(client);
});

afterEach(() => {
  resetSqliteClient();
});
