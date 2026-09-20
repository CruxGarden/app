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
      'show',
      'read_crux',
      'snapshot_crux',
      'set_names',
      'list_moods',
      'wear_mood',
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

  it('validates the operating tools: what to show, which pane, names within bounds', () => {
    expect(validateGardenTool('show', { what: 'home' }).valid).toBe(true);
    expect(validateGardenTool('show', { what: 'crux' }).valid).toBe(false);
    expect(validateGardenTool('show', { what: 'crux', title: 'Tour stop' }).valid).toBe(true);
    expect(validateGardenTool('show', { what: 'pane', pane: 'kitchen' }).valid).toBe(false);
    expect(
      validateGardenTool('show', { what: 'pane', pane: 'artifacts', visible: false }).valid,
    ).toBe(true);
    expect(validateGardenTool('show', { what: 'file', cruxId: 'x' }).valid).toBe(false);
    expect(
      validateGardenTool('show', { what: 'file', cruxId: 'x', path: 'index.html' }).valid,
    ).toBe(true);
    expect(validateGardenTool('show', { what: 'elsewhere' }).valid).toBe(false);
    expect(validateGardenTool('read_crux', {}).valid).toBe(false);
    expect(validateGardenTool('snapshot_crux', { title: 'x' }).valid).toBe(false);
    expect(validateGardenTool('snapshot_crux', { title: 'x', label: 'done' }).valid).toBe(true);
    expect(validateGardenTool('set_names', {}).valid).toBe(false);
    expect(validateGardenTool('set_names', { title: 'The Bachelor Pad' }).valid).toBe(true);
    expect(
      validateGardenTool('set_names', { panes: { collaboration: 'Interview room' } }).valid,
    ).toBe(true);
    expect(validateGardenTool('set_names', { panes: { kitchen: 'x' } }).valid).toBe(false);
    expect(validateGardenTool('set_names', { panes: ['x'] }).valid).toBe(false);
    expect(validateGardenTool('wear_mood', {}).valid).toBe(false);
    expect(validateGardenTool('wear_mood', { id: 'plasma' }).valid).toBe(true);
    expect(validateGardenTool('list_moods', {}).valid).toBe(true);
  });
});
