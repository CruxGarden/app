import { beforeEach, describe, expect, it } from 'vitest';
import { initServices } from '@/services';
import { createToolExecutor, defaultToolDefinitions } from './tools';
import {
  gardenOperatingTools,
  runGardenAccess,
  validateGardenAccess,
  validateGardenOperation,
} from './garden-access';

describe('shared garden operating authority', () => {
  beforeEach(async () => {
    await initServices();
  });
  it('lets a built-in collaborator discover the actual operating schemas', async () => {
    const execute = createToolExecutor('a');
    const result = await execute('list_garden_tools', {});
    expect(JSON.parse(result as string).map((t: { name: string }) => t.name)).toContain(
      'plant_crux',
    );
    expect(defaultToolDefinitions().some((t) => t.name === 'call_garden_tool')).toBe(true);
  });
  it('keeps a per-Crux token narrow even if it guesses a garden tool name', async () => {
    expect(defaultToolDefinitions('a', false).some((t) => t.name === 'call_garden_tool')).toBe(
      false,
    );
    const execute = createToolExecutor('a', undefined, undefined, { gardenAccess: false });
    expect(
      await execute('call_garden_tool', { name: 'plant_crux', input: { title: 'No' } }),
    ).toMatch(/^Error/);
    const scoped = createToolExecutor('a', undefined, undefined, { scope: { folder: 'posts' } });
    expect(await scoped('list_garden_tools', {})).toMatch(/^Error/);
  });
  it('rejects malformed, unknown, recursive and self-approved actions', () => {
    expect(validateGardenAccess('call_garden_tool', { name: 'show', input: null }).valid).toBe(
      false,
    );
    expect(
      validateGardenOperation('call_crux_tool', {
        cruxId: 'a',
        name: 'call_garden_tool',
        input: {},
      }).valid,
    ).toBe(false);
    expect(validateGardenOperation('answer_approval', { allow: true }).valid).toBe(false);
    expect(validateGardenOperation('plant_crux', {}).valid).toBe(false);
    expect(gardenOperatingTools().some((t) => t.name === 'answer_approval')).toBe(false);
    expect(gardenOperatingTools().some((t) => t.name === 'set_theme')).toBe(true);
  });
  it('does not start a second collaborator in the originating workspace', async () => {
    expect(
      await runGardenAccess(
        'call_garden_tool',
        { name: 'run_turn', input: { cruxId: 'a', message: 'work' } },
        'collaborator',
        'a',
      ),
    ).toMatch(/^Error/);
  });
});
