import { describe, expect, it } from 'vitest';
import { gdevelopCommand, GDEVELOP_TOOLS } from './gdevelop-tools';
import { piskelCommand, PISKEL_TOOLS } from './piskel-tools';
import { audiomassCommand, AUDIOMASS_TOOLS } from './audiomass-tools';
import { CRUXSPACE_TOOLS, validateCruxspaceTool } from './cruxspace-tools';

/** The bounded App Tools the Glow Garden collaborator uses (GAME-CRUXSPACE-PLAN.md §5). */
describe('game Cruxspace app tools', () => {
  it('map Piskel and AudioMass outputs to their bridge operations and reject bad names', () => {
    expect(PISKEL_TOOLS.map((t) => t.name)).toContain('save_piskel_sheet');
    expect(piskelCommand('save_piskel_sheet', { name: ' Gardener sheet ' })).toEqual({
      op: 'save-sheet',
      label: 'Gardener sheet',
    });
    expect(() => piskelCommand('save_piskel_sheet', { name: '' })).toThrow('Name the sheet');
    expect(() => piskelCommand('save_piskel_sheet', { name: 'x', extra: 1 })).toThrow();
    expect(AUDIOMASS_TOOLS.map((t) => t.name)).toContain('save_audiomass_output');
    expect(audiomassCommand('save_audiomass_output', { name: 'Pickup chime' })).toEqual({
      op: 'save-audio',
      label: 'Pickup chime',
    });
    expect(() => audiomassCommand('save_audiomass_output', { name: 'a'.repeat(121) })).toThrow();
  });

  it('validate GDevelop resources, sprites, instances, events and export before the bridge sees them', () => {
    expect(GDEVELOP_TOOLS.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        'add_gdevelop_resource',
        'add_gdevelop_sprite',
        'add_gdevelop_instance',
        'add_gdevelop_event',
        'export_gdevelop_web_game',
      ]),
    );
    expect(
      gdevelopCommand('add_gdevelop_resource', { path: 'assets/chime.wav', name: 'chime', kind: 'audio' }),
    ).toEqual({ op: 'add-resource', path: 'assets/chime.wav', name: 'chime', kind: 'audio' });
    expect(() =>
      gdevelopCommand('add_gdevelop_resource', { path: 'assets/chime.wav', name: 'chime', kind: 'font' }),
    ).toThrow('image or audio');
    const sprite = {
      scene: 'Scene',
      name: 'Gardener',
      path: 'assets/gardener.png',
      frameWidth: 32,
      frameHeight: 32,
      fps: 8,
      behaviors: ['TopDownMovementBehavior::TopDownMovementBehavior'],
    };
    expect(gdevelopCommand('add_gdevelop_sprite', sprite)).toEqual({ op: 'add-sprite-object', ...sprite });
    expect(() => gdevelopCommand('add_gdevelop_sprite', { ...sprite, frameHeight: undefined })).toThrow();
    expect(() => gdevelopCommand('add_gdevelop_sprite', { ...sprite, fps: 0 })).toThrow();
    expect(() => gdevelopCommand('add_gdevelop_sprite', { ...sprite, other: true })).toThrow();
    expect(gdevelopCommand('add_gdevelop_instance', { scene: 'Scene', object: 'Seed', x: 1, y: 2 })).toEqual({
      op: 'add-instance',
      scene: 'Scene',
      object: 'Seed',
      x: 1,
      y: 2,
    });
    expect(() => gdevelopCommand('add_gdevelop_instance', { scene: 'Scene', object: 'Seed', x: '1', y: 2 })).toThrow();
    const event = {
      scene: 'Scene',
      conditions: [{ type: 'CollisionNP', parameters: ['Gardener', 'Seed', '', '', ''], inverted: false }],
      actions: [{ type: 'Delete', parameters: ['Seed', ''] }],
    };
    expect(gdevelopCommand('add_gdevelop_event', event)).toEqual({ op: 'add-event', ...event });
    expect(() => gdevelopCommand('add_gdevelop_event', { scene: 'Scene' })).toThrow('conditions');
    expect(() =>
      gdevelopCommand('add_gdevelop_event', {
        scene: 'Scene',
        actions: [{ type: 'Delete', parameters: ['Seed'], inverted: true }],
      }),
    ).toThrow();
    expect(gdevelopCommand('export_gdevelop_web_game', { name: 'Glow Garden web build' })).toEqual({
      op: 'export-web-game',
      name: 'Glow Garden web build',
    });
  });

  it('accepts the unpack flag on Cruxspace transfers only as a string flag', () => {
    const use = CRUXSPACE_TOOLS.find((t) => t.name === 'use_cruxspace_asset')!;
    expect(Object.keys(use.input_schema.properties)).toContain('unpack');
    const base = { spaceId: 's', sourceCruxId: 'c', outputId: 'o', fingerprint: 'f', path: 'public/game' };
    expect(validateCruxspaceTool('use_cruxspace_asset', { ...base, unpack: 'true' }).valid).toBe(true);
    expect(validateCruxspaceTool('use_cruxspace_asset', { ...base, unpack: true as unknown as string }).valid).toBe(false);
  });
});
