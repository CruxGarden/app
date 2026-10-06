import { test, expect } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { AgentConnectionStore } =
  require('../dist/agent-connections.js') as typeof import('../src/agent-connections');
const { checkAgentCall } =
  require('../dist/agent-scopes.js') as typeof import('../src/agent-scopes');

test('named tokens persist as hashes, rotate independently, and revoke independently', () => {
  const folder = mkdtempSync(join(tmpdir(), 'crux-connections-'));
  try {
    const store = new AgentConnectionStore(folder);
    const first = store.create({ name: 'Reader', kind: 'other', scopes: ['read'] });
    const second = store.create({ name: 'Maker', kind: 'codex', scopes: ['read', 'edit'] });
    const persisted = readFileSync(join(folder, 'connections.json'), 'utf8');
    expect(persisted.includes(first.token) || persisted.includes(second.token)).toBe(false);
    const restored = new AgentConnectionStore(folder);
    expect(restored.verify(first.token)?.name).toBe('Reader');
    const rotated = restored.rotate(first.connection.id);
    expect(restored.verify(first.token)).toBeNull();
    expect(restored.verify(rotated.token)?.id).toBe(first.connection.id);
    expect(restored.verify(second.token)?.id).toBe(second.connection.id);
    restored.revoke(second.connection.id);
    expect(new AgentConnectionStore(folder).verify(second.token)).toBeNull();
    expect(restored.verify(rotated.token)).not.toBeNull();
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('scopes enforce wrapped operations and never grant approval authority', () => {
  expect(checkAgentCall(['read'], 'Reader', 'list_cruxes').allowed).toBe(true);
  expect(checkAgentCall(['read'], 'Reader', 'call_crux_tool', { name: 'write_file' }).allowed).toBe(
    false,
  );
  expect(
    checkAgentCall(['read', 'edit'], 'Maker', 'call_crux_tool', { name: 'write_file' }).allowed,
  ).toBe(true);
  expect(
    checkAgentCall(['read', 'edit'], 'Maker', 'call_garden_tool', { name: 'run_turn' }).allowed,
  ).toBe(false);
  expect(
    checkAgentCall(['read', 'edit', 'run', 'publish', 'settings'], 'Owner', 'answer_approval')
      .allowed,
  ).toBe(false);
});
