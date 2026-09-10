import { beforeEach, expect, it } from 'vitest';
import { initServices, getServices } from '@/services';
import { registerAppTools } from '@/services/embedded-app-tool-registry';
import { embeddedAppToolAdapter } from '@/services/embedded-app-tool-adapters';
import { createToolExecutor, defaultToolDefinitions, didMutate } from './tools';
import { instrumentCommand } from './instrument-tools';

beforeEach(() => initServices('local'));
it('validates bounded commands before reaching the instrument', () => {
  for (const values of [{}, { brightness: NaN }, { brightness: -0.1 }, { brightness: 1.1 }, []])
    expect(() => instrumentCommand('set_instrument_controls', { values })).toThrow();
  expect(() => instrumentCommand('select_instrument_preset', { presetId: '' })).toThrow();
});
it('routes tools to their owning instrument, respects write scope and reports failures as non-mutations', async () => {
  const crux = await getServices().crux.create({
    title: 'Slow Sky',
    type: 'workspace',
    kind: 'webapp',
    meta: { template: 'cardinal-drone' },
  });
  const calls: unknown[] = [];
  const adapter = embeddedAppToolAdapter(crux)!;
  const unregister = registerAppTools(crux.id, {
    tools: adapter.tools,
    execute: async (name, input) => {
      const command = adapter.prepare(name, input);
      calls.push(command);
      if (command.op === 'preset') throw new Error('This file changed elsewhere.');
      return { saved: true, controls: [{ id: 'brightness', value: 0.2 }] };
    },
  });
  try {
    expect(defaultToolDefinitions(crux.id).map((tool) => tool.name)).toContain(
      'inspect_instrument',
    );
    expect(defaultToolDefinitions('another-crux').map((tool) => tool.name)).not.toContain(
      'inspect_instrument',
    );
    const execute = createToolExecutor(crux.id);
    const result = await execute('set_instrument_controls', { values: { brightness: 0.2 } });
    expect(didMutate('set_instrument_controls', result)).toBe(true);
    expect(calls).toEqual([{ op: 'controls', values: { brightness: 0.2 } }]);
    const limited = createToolExecutor(crux.id, undefined, undefined, { scope: { folder: 'src' } });
    expect(await limited('set_instrument_controls', { values: { brightness: 0.3 } })).toContain(
      'outside',
    );
    expect(calls).toHaveLength(1);
    const failure = await execute('select_instrument_preset', { presetId: 'low-orbit' });
    expect(failure).toContain('changed elsewhere');
    expect(didMutate('select_instrument_preset', failure)).toBe(false);
    expect(await createToolExecutor('another-crux')('inspect_instrument', {})).toContain(
      'Open the app',
    );
  } finally {
    unregister();
  }
  expect(await createToolExecutor(crux.id)('inspect_instrument', {})).toContain('Open the app');
});
