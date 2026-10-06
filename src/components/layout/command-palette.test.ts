import { describe, expect, it } from 'vitest';
import { score, type Command } from './command-score';

const command = (label: string, extra: Partial<Command> = {}): Command => ({
  id: label,
  section: 'Actions',
  label,
  run: () => {},
  ...extra,
});

describe('command palette matching', () => {
  it('lists everything but query-only commands while the field is empty', () => {
    expect(score(command('Show Artifacts'), '')).toBeGreaterThan(0);
    expect(score(command('Wear Plasma', { queryOnly: true }), '')).toBe(0);
    expect(score(command('Wear Plasma', { queryOnly: true }), 'plasma')).toBeGreaterThan(0);
  });

  it('needs every word to land, and ranks the start of the label first', () => {
    expect(score(command('Show Artifacts'), 'show art')).toBeGreaterThan(0);
    expect(score(command('Show Artifacts'), 'show nothing')).toBe(0);
    expect(score(command('Share this Crux'), 'share')).toBeGreaterThan(
      score(command('Show Share'), 'share'),
    );
    expect(score(command('Show Share'), 'share')).toBeGreaterThan(
      score(command('Hide Collaboration', { keywords: 'share' }), 'share'),
    );
  });

  it('finds a command by its hint or keywords', () => {
    expect(score(command('Export this Crux', { keywords: 'download zip' }), 'zip')).toBe(1);
    expect(score(command('Dream study', { hint: 'My Garden › Studio' }), 'studio')).toBe(1);
  });
});
