import { describe, it, expect } from 'vitest';
import { GARDEN_TOOL_DEFINITIONS, isGardenTool, validateGardenTool } from './garden-tools';

describe("the Keeper's garden tools", () => {
  it('names the operations the person has in the hub, the picker, the Collaboration and Explore', () => {
    expect(GARDEN_TOOL_DEFINITIONS.map((t) => t.name)).toEqual([
      'list_cruxes',
      'list_cruxspaces',
      'create_cruxspace',
      'plant_crux',
      'run_turn',
      'publish_crux',
      'install_tool',
    ]);
    expect(isGardenTool('plant_crux')).toBe(true);
    expect(isGardenTool('write_file')).toBe(false);
  });

  it('validates before it acts', () => {
    expect(validateGardenTool('plant_crux', { title: 'Field notes' }).valid).toBe(true);
    expect(validateGardenTool('plant_crux', {}).valid).toBe(false);
    expect(validateGardenTool('run_turn', { cruxId: 'x' }).valid).toBe(false);
    expect(validateGardenTool('create_cruxspace', { name: 'A', brief: '' }).valid).toBe(false);
    expect(validateGardenTool('install_tool', {}).valid).toBe(false);
    expect(validateGardenTool('install_tool', { username: 'a', slug: 'b' }).valid).toBe(true);
    expect(validateGardenTool('publish_crux', { cruxId: 'x' }).valid).toBe(true);
  });
});
