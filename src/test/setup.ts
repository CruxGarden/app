import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import Dexie from 'dexie';

// Reset IndexedDB between tests to prevent state leaking
afterEach(async () => {
  // Delete all Dexie databases
  const dbs = await Dexie.getDatabaseNames();
  for (const name of dbs) {
    await Dexie.delete(name);
  }
});
