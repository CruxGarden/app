import { afterEach, beforeEach } from 'vitest';
import { createLocalApiTestClient } from './local-api-client';
import { getSqliteClient, setSqliteClient } from '@/services/sqlite/client';
import { useGardenContext } from '@/stores/gardenContext';
import { allWorkspaces, closeWorkspace, useWorkspaceRegistry } from '@/stores/workspaceRegistry';

/** Adopt the command-backed fixture before a suite initializes its services.
 * Retired SQL.js setup is disposed immediately; workspace cleanup precedes
 * native owner shutdown, so queued writes cannot outlive their test Garden. */
export function localApiFixture() {
  let native: Awaited<ReturnType<typeof createLocalApiTestClient>> | undefined;
  beforeEach(async () => {
    await getSqliteClient().close();
    native = await createLocalApiTestClient();
    setSqliteClient(native.client);
    useGardenContext.getState().initialize(await native.client.enterLocalGarden!());
  });
  afterEach(async () => {
    if (!native) return;
    try {
      for (const w of allWorkspaces())
        await closeWorkspace(w.id, { stop: true, documents: 'discard' });
      useWorkspaceRegistry.setState({ entries: [], mru: [], activeId: null, restored: false });
    } finally {
      await native.client.close();
      native = undefined;
    }
  });
  return () => {
    if (!native) throw new Error('The local API test Garden is not open.');
    return native;
  };
}
