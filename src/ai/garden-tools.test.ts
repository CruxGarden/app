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
      'look',
      'list_templates',
      'choose_collaborator',
      'answer_approval',
      'search_garden',
      'read_garden_file',
      'export_crux',
      'export_cruxspace',
      'list_gardens',
      'find_people',
      'invite_person',
      'add_to_garden',
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
    expect(validateGardenTool('look', {}).valid).toBe(true);
    expect(validateGardenTool('choose_collaborator', { title: 'x' }).valid).toBe(false);
    expect(
      validateGardenTool('choose_collaborator', { title: 'x', model: 'claude-code' }).valid,
    ).toBe(true);
    expect(validateGardenTool('answer_approval', {}).valid).toBe(false);
    expect(validateGardenTool('answer_approval', { approved: true }).valid).toBe(true);
    expect(validateGardenTool('search_garden', {}).valid).toBe(false);
    expect(validateGardenTool('read_garden_file', { title: 'x' }).valid).toBe(false);
    expect(validateGardenTool('read_garden_file', { title: 'x', path: 'a.md' }).valid).toBe(true);
    expect(validateGardenTool('export_crux', {}).valid).toBe(false);
    expect(validateGardenTool('export_cruxspace', { cruxspaceId: 's' }).valid).toBe(true);
    expect(validateGardenTool('find_people', {}).valid).toBe(false);
    expect(validateGardenTool('invite_person', { gardenCruxId: 'g' }).valid).toBe(false);
    expect(
      validateGardenTool('invite_person', { gardenCruxId: 'g', username: 'ada', role: 'boss' })
        .valid,
    ).toBe(false);
    expect(validateGardenTool('invite_person', { gardenCruxId: 'g', username: '@ada' }).valid).toBe(
      true,
    );
    expect(validateGardenTool('add_to_garden', { gardenCruxId: 'g' }).valid).toBe(false);
    expect(validateGardenTool('add_to_garden', { gardenCruxId: 'g', title: 'x' }).valid).toBe(true);
  });
});
